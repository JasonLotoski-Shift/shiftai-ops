// Commission payout recompute (plan §9.6) — the DB side of the unified commission
// ledger, mirroring the proven recomputePayoutsTx in payouts.ts.
//
// Two streams, both keyed off a CommissionLine:
//   build     — one payout row per non-extra BillingInstallment (stage). The
//               line's build total is split across stages proportional to stage
//               amount. Origination now pays on schedule too (D1).
//   recurring — one payout row per covered month (periodIndex / periodStart),
//               from the engagement's ServiceContract monthlyFee.
//
// Like recomputePayoutsTx: only `owed` rows recompute; paid/confirmed rows are
// PRESERVED; stale `owed` rows (line/stage no longer present) are removed. All
// money is whole CAD, rounded half-away-from-zero (§9.7 #1).
//
// No "use server" — imported by server actions inside their own transactions,
// and the pure helpers below are reused by the Phase 3 backfill.

import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { CommissionBasis } from "@/lib/generated/prisma/enums";
import { roundHalfAwayFromZero as round } from "./round";
import { economicsTotals } from "./economics";
import { authoritativeBuildValue } from "./build-value";
import { addMonths } from "./commission";

export type RecomputeResult = { created: number; updated: number; deleted: number };

// ──────────────────────────────────────────────────────────────────────
// Pure splitting math (no DB) — unit-tested in commission-payouts.check.ts and
// reused by the backfill so generated rows match the parity gate to the dollar.
// ──────────────────────────────────────────────────────────────────────

/**
 * Split a whole-CAD `total` across `weights`, guaranteeing: every share is a
 * non-negative integer, the shares sum to EXACTLY `total`, and the fractional
 * remainder lands on the largest fractional parts (largest-remainder method).
 * Non-negativity hardens the recurring schedule so no month renders negative
 * (§9.7 #5); the exact-sum property is what the per-line parity gate relies on.
 */
export function splitProportional(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || totalWeight <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (total * w) / totalWeight);
  const out = exact.map((x) => Math.floor(x));
  const remainder = total - out.reduce((s, x) => s + x, 0); // integer 0..n-1
  const byFrac = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) out[byFrac[k % n].i] += 1;
  return out;
}

/** The intended TOTAL build-stream dollars for one line (§9.7 #6 gates on this,
 *  not the sum of generated rows, so schedule-less projects still pass). Source
 *  lines compute against the build value; origination against the labour pie. */
export function lineBuildTotal(
  line: { buildPct: number; basis: CommissionBasis },
  ctx: { laborBillable: number; authoritativeBuildValue: number },
): number {
  const base = line.basis === "build_value" ? ctx.authoritativeBuildValue : ctx.laborBillable;
  return round((line.buildPct / 100) * base);
}

/** Per-month recurring amounts: round the N-month total, then split evenly with
 *  the largest-remainder method so every row is non-negative and the rows sum to
 *  the total exactly (§9.7 #5). */
export function recurringScheduleAmounts(recurringPct: number, monthlyFee: number, coveredMonths: number): number[] {
  if (coveredMonths <= 0) return [];
  const total = round((recurringPct / 100) * monthlyFee * coveredMonths);
  return splitProportional(total, Array(coveredMonths).fill(1));
}

// ──────────────────────────────────────────────────────────────────────
// DB recompute (transaction-scoped). Exercised at the Phase 4 cutover, when
// commission/economics/schedule edits run the new model. Faithful mirror of
// recomputePayoutsTx.
// ──────────────────────────────────────────────────────────────────────

type BuildTx = Pick<
  PrismaClient,
  "project" | "projectEconomicsLine" | "commissionLine" | "billingInstallment" | "commissionPayout"
>;

/** Build stream: split each on-schedule line's build total across the non-extra
 *  installments. Buyout projects carry no commission (D3) and short-circuit. */
export async function recomputeCommissionPayoutsTx(tx: BuildTx, projectId: string): Promise<RecomputeResult> {
  const result: RecomputeResult = { created: 0, updated: 0, deleted: 0 };

  const project = await tx.project.findUnique({ where: { id: projectId }, select: { budgetFee: true, projectType: true, isFirstContract: true } });
  if (!project || project.projectType === "buyout") return result;

  const [econ, lines, installments, existing] = await Promise.all([
    tx.projectEconomicsLine.findMany({ where: { projectId }, select: { hours: true, payRateCents: true, billRateCents: true, isExtra: true } }),
    tx.commissionLine.findMany({ where: { projectId, onSchedule: true }, select: { id: true, kind: true, basis: true, buildPct: true } }),
    tx.billingInstallment.findMany({ where: { projectId, isExtra: false }, orderBy: { sortOrder: "asc" }, select: { id: true, amount: true } }),
    tx.commissionPayout.findMany({
      where: { commissionLine: { projectId }, stream: "build" },
      select: { id: true, installmentId: true, commissionLineId: true, status: true },
    }),
  ]);

  const laborBillable = economicsTotals(
    econ.map((l) => ({ hours: Number(l.hours), payRateCents: l.payRateCents, billRateCents: l.billRateCents, isExtra: l.isExtra })),
  ).billableTotal;
  const buildValue = authoritativeBuildValue({ kind: "project", budgetFee: project.budgetFee ?? 0 });

  const key = (lineId: string, instId: string) => `${lineId}:${instId}`;
  const existingMap = new Map(existing.map((p) => [key(p.commissionLineId, p.installmentId ?? ""), p]));
  const wanted = new Set<string>();
  const weights = installments.map((i) => i.amount);

  for (const line of lines) {
    // Origination pays only on the first contract (§9.1 step 2). On a subsequent
    // contract the slot stays in firm reserve, so skip: its owed rows fall out of
    // `wanted` below and are cleaned up as stale.
    if (line.kind === "origination" && !project.isFirstContract) continue;
    const total = lineBuildTotal({ buildPct: Number(line.buildPct), basis: line.basis }, { laborBillable, authoritativeBuildValue: buildValue });
    const amounts = splitProportional(total, weights);
    for (let i = 0; i < installments.length; i++) {
      const inst = installments[i];
      const k = key(line.id, inst.id);
      wanted.add(k);
      const ex = existingMap.get(k);
      if (ex) {
        if (ex.status === "owed") {
          await tx.commissionPayout.update({ where: { id: ex.id }, data: { amount: amounts[i] } });
          result.updated++;
        }
      } else {
        await tx.commissionPayout.create({
          data: { commissionLineId: line.id, installmentId: inst.id, stream: "build", amount: amounts[i], status: "owed" },
        });
        result.created++;
      }
    }
  }

  for (const p of existing) {
    if (p.status === "owed" && !wanted.has(key(p.commissionLineId, p.installmentId ?? ""))) {
      await tx.commissionPayout.delete({ where: { id: p.id } });
      result.deleted++;
    }
  }

  return result;
}

type RecurringTx = Pick<PrismaClient, "serviceContract" | "commissionLine" | "commissionPayout">;

/** Recurring stream: one payout per covered month, keyed by periodIndex, dated
 *  startDate + index months. No ServiceContract → no recurring rows. */
export async function recomputeRecurringCommissionPayoutsTx(tx: RecurringTx, projectId: string): Promise<RecomputeResult> {
  const result: RecomputeResult = { created: 0, updated: 0, deleted: 0 };

  const contract = await tx.serviceContract.findUnique({ where: { projectId }, select: { monthlyFee: true, startDate: true } });
  if (!contract) return result;

  const [lines, existing] = await Promise.all([
    tx.commissionLine.findMany({
      where: { projectId, onSchedule: true, recurringPct: { not: null } },
      select: { id: true, recurringPct: true, coveredMonths: true },
    }),
    tx.commissionPayout.findMany({
      where: { commissionLine: { projectId }, stream: "recurring" },
      select: { id: true, commissionLineId: true, periodIndex: true, status: true },
    }),
  ]);

  const key = (lineId: string, idx: number) => `${lineId}:${idx}`;
  const existingMap = new Map(existing.map((p) => [key(p.commissionLineId, p.periodIndex ?? -1), p]));
  const wanted = new Set<string>();

  for (const line of lines) {
    const n = line.coveredMonths ?? 0;
    const amounts = recurringScheduleAmounts(Number(line.recurringPct), contract.monthlyFee, n);
    for (let i = 0; i < n; i++) {
      const k = key(line.id, i);
      wanted.add(k);
      const periodStart = addMonths(contract.startDate, i);
      const ex = existingMap.get(k);
      if (ex) {
        if (ex.status === "owed") {
          await tx.commissionPayout.update({ where: { id: ex.id }, data: { amount: amounts[i], periodStart } });
          result.updated++;
        }
      } else {
        await tx.commissionPayout.create({
          data: { commissionLineId: line.id, stream: "recurring", periodIndex: i, periodStart, amount: amounts[i], status: "owed" },
        });
        result.created++;
      }
    }
  }

  for (const p of existing) {
    if (p.status === "owed" && !wanted.has(key(p.commissionLineId, p.periodIndex ?? -1))) {
      await tx.commissionPayout.delete({ where: { id: p.id } });
      result.deleted++;
    }
  }

  return result;
}
