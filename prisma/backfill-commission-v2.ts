// Phase 3 backfill (financials rebuild §7 / §9.7 #6): map the four OLD commission
// tables into the unified CommissionLine + CommissionPayout, additively. The OLD
// tables stay authoritative until the Phase 4 cutover; this only INSERTS the new
// rows so the parity gate can compare new vs old.
//
//   Origination               → one origination-kind line per row (basis
//                               labor_revenue, buildPct = originationPct ×
//                               sharePct/100), ONLY when the project is the first
//                               contract; build payouts split across stages (D1:
//                               origination now pays on schedule). The under-100
//                               pool remainder gets NO line and stays in reserve.
//   ProjectSourceCommission   → one source-kind line (basis build_value, buildPct
//                               = pct). Build payouts split the FROZEN buildAmount
//                               (the contracted dollar — NOT a recompute), so the
//                               parity gate is exact even if budgetFee later moved.
//   + linked OngoingContractCommission → folds recurringPct + coveredMonths onto
//                               the SAME line.
//   OngoingContractCommissionAccrual → recurring payouts, paid state preserved via
//                               effectiveAccrualStatus (paid → paid + paidAt; else
//                               → owed).
//   Buyout projects           → skipped entirely (D3: no commission on buyout).
//
// SAFE BY DEFAULT: dry-run unless `--apply` is passed. Local dev shares the prod
// Supabase, so a bare run only READS and prints what it WOULD write. Idempotent:
// it skips any OLD row already backfilled (matched on backfillSourceTable +
// backfillSourceId), so re-runs and partial-failure recovery are safe.
//
//   Preview:  npx tsx prisma/backfill-commission-v2.ts
//   Apply:    npx tsx prisma/backfill-commission-v2.ts --apply

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { economicsTotals } from "../lib/billing/economics";
import { authoritativeBuildValue } from "../lib/billing/build-value";
import { splitProportional, lineBuildTotal } from "../lib/billing/commission-payouts";
import { effectiveAccrualStatus } from "../lib/billing/commission";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const now = new Date();

// A planned payout row (build or recurring) before it is written.
type PlannedPayout =
  | { stream: "build"; installmentId: string; amount: number; status: "owed" }
  | { stream: "recurring"; periodIndex: number; periodStart: Date; amount: number; status: "owed" | "paid"; paidAt: Date | null };

// A planned line + its payouts, with the resolved CommissionLine create data.
type PlannedLine = {
  kind: "origination" | "source";
  basis: "labor_revenue" | "build_value";
  buildPct: number;
  recurringPct: number | null;
  coveredMonths: number | null;
  partnerId: string | null;
  externalName: string | null;
  projectId: string;
  sortOrder: number;
  backfillSourceTable: string;
  backfillSourceId: string;
  payouts: PlannedPayout[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  console.log(`Commission backfill — ${APPLY ? "APPLY (writing rows)" : "DRY RUN (no writes)"}\n`);

  // Provenance of lines already backfilled — the idempotency guard.
  const already = await prisma.commissionLine.findMany({
    where: { backfillSourceId: { not: null } },
    select: { backfillSourceTable: true, backfillSourceId: true },
  });
  const doneKey = new Set(already.map((l) => `${l.backfillSourceTable}:${l.backfillSourceId}`));

  // Load the project facts + the OLD rows, grouped by project.
  const projects = await prisma.project.findMany({
    select: { id: true, name: true, originationPct: true, isFirstContract: true, projectType: true, budgetFee: true },
  });
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const [originations, pscs, econLines, installments] = await Promise.all([
    prisma.origination.findMany({ select: { id: true, projectId: true, partnerId: true, sharePct: true } }),
    prisma.projectSourceCommission.findMany({
      include: { ongoing: { include: { accruals: true } } },
    }),
    prisma.projectEconomicsLine.findMany({ select: { projectId: true, hours: true, payRateCents: true, billRateCents: true, isExtra: true } }),
    prisma.billingInstallment.findMany({ where: { isExtra: false }, orderBy: { sortOrder: "asc" }, select: { id: true, projectId: true, amount: true } }),
  ]);

  // Group helpers.
  const econByProject = new Map<string, typeof econLines>();
  for (const l of econLines) (econByProject.get(l.projectId) ?? econByProject.set(l.projectId, []).get(l.projectId)!).push(l);
  const instByProject = new Map<string, typeof installments>();
  for (const i of installments) (instByProject.get(i.projectId) ?? instByProject.set(i.projectId, []).get(i.projectId)!).push(i);
  const origByProject = new Map<string, typeof originations>();
  for (const o of originations) (origByProject.get(o.projectId) ?? origByProject.set(o.projectId, []).get(o.projectId)!).push(o);
  const pscByProject = new Map<string, typeof pscs>();
  for (const p of pscs) (pscByProject.get(p.projectId) ?? pscByProject.set(p.projectId, []).get(p.projectId)!).push(p);

  const planByProject = new Map<string, PlannedLine[]>();
  const stats = {
    buyoutSkipped: 0,
    origLines: 0,
    sourceLines: 0,
    alreadyDone: 0,
    buildPayouts: 0,
    recurringPayouts: 0,
    buildDollars: 0,
    recurringDollars: 0,
    recurringPaidPreserved: 0,
    orphanOngoing: 0,
  };

  for (const project of projects) {
    if (project.projectType === "buyout") {
      stats.buyoutSkipped++;
      continue;
    }
    const lines: PlannedLine[] = [];
    const econ = econByProject.get(project.id) ?? [];
    const inst = instByProject.get(project.id) ?? [];
    const weights = inst.map((i) => i.amount);
    const laborBillable = economicsTotals(
      econ.map((l) => ({ hours: Number(l.hours), payRateCents: l.payRateCents, billRateCents: l.billRateCents, isExtra: l.isExtra })),
    ).billableTotal;
    const buildValue = authoritativeBuildValue({ kind: "project", budgetFee: project.budgetFee ?? 0 });
    const originationPct = Number(project.originationPct); // stored as percent (e.g. 10)

    // ── Origination → origination-kind lines (first contract only) ──
    if (project.isFirstContract) {
      let sort = 0;
      for (const o of origByProject.get(project.id) ?? []) {
        if (doneKey.has(`Origination:${o.id}`)) {
          stats.alreadyDone++;
          continue;
        }
        const buildPct = round2((originationPct * Number(o.sharePct)) / 100);
        const total = lineBuildTotal({ buildPct, basis: "labor_revenue" }, { laborBillable, authoritativeBuildValue: buildValue });
        const amounts = splitProportional(total, weights);
        const payouts: PlannedPayout[] = inst.map((it, i) => ({ stream: "build", installmentId: it.id, amount: amounts[i], status: "owed" }));
        lines.push({
          kind: "origination",
          basis: "labor_revenue",
          buildPct,
          recurringPct: null,
          coveredMonths: null,
          partnerId: o.partnerId,
          externalName: null,
          projectId: project.id,
          sortOrder: sort++,
          backfillSourceTable: "Origination",
          backfillSourceId: o.id,
          payouts,
        });
        stats.origLines++;
        stats.buildPayouts += payouts.length;
        stats.buildDollars += total;
      }
    }

    // ── ProjectSourceCommission (+ linked ongoing) → source-kind lines ──
    let srcSort = 100; // keep source after origination in sortOrder
    for (const psc of pscByProject.get(project.id) ?? []) {
      if (doneKey.has(`ProjectSourceCommission:${psc.id}`)) {
        stats.alreadyDone++;
        continue;
      }
      const ongoing = psc.ongoing; // 1:1 recurring twin (may be null)
      const recurringPct = ongoing ? Number(ongoing.pct) : null;
      const coveredMonths = ongoing ? ongoing.coveredMonths : null;

      // Build payouts split the FROZEN buildAmount (§9.7 #6), not a recompute.
      const buildAmounts = splitProportional(psc.buildAmount, weights);
      const payouts: PlannedPayout[] = inst.map((it, i) => ({ stream: "build", installmentId: it.id, amount: buildAmounts[i], status: "owed" }));

      // Recurring payouts mirror the existing accruals, paid state preserved.
      if (ongoing) {
        for (const a of ongoing.accruals) {
          const eff = effectiveAccrualStatus(a.status, a.periodStart, now);
          const status = eff === "paid" ? "paid" : "owed";
          payouts.push({ stream: "recurring", periodIndex: a.periodIndex, periodStart: a.periodStart, amount: a.amount, status, paidAt: a.paidAt ?? null });
          stats.recurringPayouts++;
          stats.recurringDollars += a.amount;
          if (status === "paid") stats.recurringPaidPreserved += a.amount;
        }
      }

      lines.push({
        kind: "source",
        basis: "build_value",
        buildPct: Number(psc.pct),
        recurringPct,
        coveredMonths,
        partnerId: psc.partnerId,
        externalName: psc.externalName,
        projectId: project.id,
        sortOrder: srcSort++,
        backfillSourceTable: "ProjectSourceCommission",
        backfillSourceId: psc.id,
        payouts,
      });
      stats.sourceLines++;
      stats.buildPayouts += inst.length;
      stats.buildDollars += psc.buildAmount;
    }

    if (lines.length) planByProject.set(project.id, lines);
  }

  // Anomalies (reported, never auto-fixed). A DealSourceCommission is "converted"
  // once a ProjectSourceCommission points back at it (sourceDealCommissionId); the
  // rest sit on open deals and convert through the normal flow, not this backfill.
  const convertedSourceIds = new Set(pscs.map((p) => p.sourceDealCommissionId).filter((x): x is string => !!x));
  const dealCommIds = (await prisma.dealSourceCommission.findMany({ select: { id: true } })).map((d) => d.id);
  const unconvertedDealCommissions = dealCommIds.filter((id) => !convertedSourceIds.has(id)).length;
  const orphanOngoing = await prisma.ongoingContractCommission.count({ where: { projectCommissionId: null } });
  stats.orphanOngoing = orphanOngoing;

  // ── Write (apply) or report (dry run) ──
  if (APPLY) {
    for (const [projectId, lines] of planByProject) {
      await prisma.$transaction(async (tx) => {
        for (const l of lines) {
          await tx.commissionLine.create({
            data: {
              kind: l.kind,
              basis: l.basis,
              buildPct: l.buildPct,
              recurringPct: l.recurringPct,
              coveredMonths: l.coveredMonths,
              onSchedule: true,
              sortOrder: l.sortOrder,
              partnerId: l.partnerId,
              externalName: l.externalName,
              projectId: l.projectId,
              backfillSourceTable: l.backfillSourceTable,
              backfillSourceId: l.backfillSourceId,
              payouts: {
                create: l.payouts.map((p) =>
                  p.stream === "build"
                    ? { stream: "build", installmentId: p.installmentId, amount: p.amount, status: p.status }
                    : { stream: "recurring", periodIndex: p.periodIndex, periodStart: p.periodStart, amount: p.amount, status: p.status, paidAt: p.paidAt },
                ),
              },
            },
          });
        }
      });
      console.log(`  ✓ ${projectById.get(projectId)?.name ?? projectId}: ${lines.length} line(s)`);
    }
  } else {
    for (const [projectId, lines] of planByProject) {
      const b = lines.reduce((s, l) => s + l.payouts.filter((p) => p.stream === "build").length, 0);
      const r = lines.reduce((s, l) => s + l.payouts.filter((p) => p.stream === "recurring").length, 0);
      console.log(`  • ${projectById.get(projectId)?.name ?? projectId}: ${lines.length} line(s), ${b} build + ${r} recurring payout(s)`);
    }
  }

  const fmt = (n: number) => `$${n.toLocaleString("en-CA")}`;
  console.log(`\n── Summary (${APPLY ? "written" : "would write"}) ──`);
  console.log(`  Lines:            ${stats.origLines} origination + ${stats.sourceLines} source = ${stats.origLines + stats.sourceLines}`);
  console.log(`  Payouts:          ${stats.buildPayouts} build + ${stats.recurringPayouts} recurring`);
  console.log(`  Build dollars:    ${fmt(stats.buildDollars)}`);
  console.log(`  Recurring dollars:${fmt(stats.recurringDollars)} (of which ${fmt(stats.recurringPaidPreserved)} already paid, preserved)`);
  console.log(`  Buyout projects skipped (D3): ${stats.buyoutSkipped}`);
  console.log(`  Already backfilled (skipped):  ${stats.alreadyDone}`);
  console.log(`\n── Anomalies (handle before Phase 5 drop) ──`);
  console.log(`  Unconverted deals carrying DealSourceCommission: ${unconvertedDealCommissions} (convert via the normal flow; not backfilled here)`);
  console.log(`  OngoingContractCommission with no project twin:  ${stats.orphanOngoing} (would need a standalone line; flag if > 0)`);

  if (!APPLY) console.log(`\nDry run only. Re-run with --apply to write these rows.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
