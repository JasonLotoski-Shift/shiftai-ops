// Payout recompute — the DB side of the consultant payout ledger.
//
// Splits each consultant's project cost (Σ non-extra economics line costs)
// across the client STAGES (non-extra BillingInstallments), proportional to
// each stage's amount, remainder pushed to the last stage so the per-consultant
// total reconciles exactly. Upserts ConsultantPayout rows. Already paid/
// confirmed payouts are PRESERVED (only `owed` rows are recomputed); stale
// `owed` rows (consultant/stage no longer present) are removed.
//
// No "use server" — imported by server actions inside their own transactions.

import type { PrismaClient } from "@/lib/generated/prisma/client";
import { costByConsultant } from "@/lib/billing/economics";

type Tx = Pick<PrismaClient, "projectEconomicsLine" | "billingInstallment" | "consultantPayout">;

export type RecomputeResult = { created: number; updated: number; deleted: number };

export async function recomputePayoutsTx(tx: Tx, projectId: string): Promise<RecomputeResult> {
  const [lines, installments, existing] = await Promise.all([
    tx.projectEconomicsLine.findMany({
      where: { projectId },
      select: { consultantId: true, hours: true, payRateCents: true, isExtra: true },
    }),
    tx.billingInstallment.findMany({
      where: { projectId, isExtra: false },
      orderBy: { sortOrder: "asc" },
      select: { id: true, amount: true },
    }),
    tx.consultantPayout.findMany({
      where: { projectId },
      select: { id: true, installmentId: true, consultantId: true, status: true },
    }),
  ]);

  const result: RecomputeResult = { created: 0, updated: 0, deleted: 0 };

  const totalScheduled = installments.reduce((s, i) => s + i.amount, 0);
  const cost = costByConsultant(
    lines.map((l) => ({ consultantId: l.consultantId, hours: Number(l.hours), payRateCents: l.payRateCents, isExtra: l.isExtra })),
  );

  // Key helper + lookup of existing payouts.
  const key = (instId: string, cId: string) => `${instId}:${cId}`;
  const existingMap = new Map(existing.map((p) => [key(p.installmentId, p.consultantId), p]));
  const wanted = new Set<string>();

  if (totalScheduled > 0) {
    for (const [consultantId, totalCost] of cost) {
      // Per-stage split, remainder to the last stage.
      const amounts = installments.map((inst) => Math.round((totalCost * inst.amount) / totalScheduled));
      const drift = totalCost - amounts.reduce((s, a) => s + a, 0);
      if (amounts.length > 0) amounts[amounts.length - 1] += drift;

      for (let i = 0; i < installments.length; i++) {
        const inst = installments[i];
        const k = key(inst.id, consultantId);
        wanted.add(k);
        const existingRow = existingMap.get(k);
        if (existingRow) {
          // Only recompute rows still in 'owed'; preserve paid/confirmed amounts.
          if (existingRow.status === "owed") {
            await tx.consultantPayout.update({ where: { id: existingRow.id }, data: { amount: amounts[i] } });
            result.updated++;
          }
        } else {
          await tx.consultantPayout.create({
            data: { projectId, consultantId, installmentId: inst.id, amount: amounts[i], status: "owed" },
          });
          result.created++;
        }
      }
    }
  }

  // Remove stale 'owed' payouts no longer represented by current economics/schedule.
  for (const p of existing) {
    if (p.status === "owed" && !wanted.has(key(p.installmentId, p.consultantId))) {
      await tx.consultantPayout.delete({ where: { id: p.id } });
      result.deleted++;
    }
  }

  return result;
}
