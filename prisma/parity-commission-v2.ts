// Phase 3 parity gate (financials rebuild §8 / §9.7 #6). READ-ONLY: recomputes
// both the OLD allocation and the NEW allocation from the OLD source tables and
// asserts they agree, so the cutover provably preserves firm money to the dollar.
//
// Three comparisons, per project, ±1 dollar tolerance (buyout excluded — D3):
//   1. firmReserveBeforeSource (new) == firmReserve (old). Both equal
//      laborBillable − takeHome − origination, so this must hold exactly.
//   2. originationFromLabour (new) == origination (old). The 10% labour slot is
//      unchanged; D2 only changes how SOURCE interacts with reserve.
//   3. per source line: recompute buildPct × budgetFee vs the FROZEN buildAmount.
//      A drift means budgetFee moved since convert; the backfill freezes the
//      contracted dollar (§9.7 #6), and this gate surfaces any gap.
//
// Plus firm-wide totals for visibility: total commission $ and total paid
// commission $ (recurring paid state carried from the accruals).
//
//   npx tsx prisma/parity-commission-v2.ts

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { economicsTotals, allocateLaborRevenue } from "../lib/billing/economics";
import { allocateLaborRevenueV2 } from "../lib/billing/allocation-v2";
import { authoritativeBuildValue } from "../lib/billing/build-value";
import { effectiveAccrualStatus } from "../lib/billing/commission";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const TOLERANCE = 1; // whole CAD per check/line
const now = new Date();

async function main() {
  const projects = await prisma.project.findMany({
    select: { id: true, name: true, originationPct: true, isFirstContract: true, projectType: true, budgetFee: true },
  });
  const [econLines, pscs] = await Promise.all([
    prisma.projectEconomicsLine.findMany({ select: { projectId: true, hours: true, payRateCents: true, billRateCents: true, isExtra: true } }),
    prisma.projectSourceCommission.findMany({ include: { ongoing: { include: { accruals: true } } } }),
  ]);

  const econByProject = new Map<string, typeof econLines>();
  for (const l of econLines) (econByProject.get(l.projectId) ?? econByProject.set(l.projectId, []).get(l.projectId)!).push(l);
  const pscByProject = new Map<string, typeof pscs>();
  for (const p of pscs) (pscByProject.get(p.projectId) ?? pscByProject.set(p.projectId, []).get(p.projectId)!).push(p);

  let fails = 0;
  let totalCommission = 0;
  let totalPaidCommission = 0;
  const rows: string[] = [];

  for (const project of projects) {
    if (project.projectType === "buyout") continue;

    const econ = econByProject.get(project.id) ?? [];
    const totals = economicsTotals(
      econ.map((l) => ({ hours: Number(l.hours), payRateCents: l.payRateCents, billRateCents: l.billRateCents, isExtra: l.isExtra })),
    );
    const laborBillable = totals.billableTotal;
    const takeHome = totals.costTotal;
    const originationPctFrac = Number(project.originationPct) / 100;
    const buildValue = authoritativeBuildValue({ kind: "project", budgetFee: project.budgetFee ?? 0 });
    const projPscs = pscByProject.get(project.id) ?? [];

    // Skip projects with no commission footprint at all (nothing to compare).
    const hasOrigination = project.isFirstContract && originationPctFrac > 0 && laborBillable > 0;
    if (!hasOrigination && projPscs.length === 0) continue;

    const old = allocateLaborRevenue({ laborBillable, takeHome, originationPct: originationPctFrac, isFirstContract: project.isFirstContract });
    const next = allocateLaborRevenueV2({
      laborBillable,
      takeHome,
      originationPct: originationPctFrac,
      isFirstContract: project.isFirstContract,
      authoritativeBuildValue: buildValue,
      commissionLines: projPscs.map((p) => ({ kind: "source" as const, buildPct: Number(p.pct) })),
    });

    // (1) firm reserve, (2) origination.
    const dReserve = next.firmReserveBeforeSource - old.firmReserve;
    const dOrig = next.originationFromLabour - old.origination;
    const reserveOk = Math.abs(dReserve) <= TOLERANCE;
    const origOk = Math.abs(dOrig) <= TOLERANCE;

    // (3) per source line: recomputed vs frozen.
    let lineFail = 0;
    let frozenSum = 0;
    projPscs.forEach((p, i) => {
      const recomputed = next.sourceSlices[i] ?? 0;
      frozenSum += p.buildAmount;
      if (Math.abs(recomputed - p.buildAmount) > TOLERANCE) lineFail++;
    });

    // Recurring totals (carried from accruals; paid state preserved).
    let recurring = 0;
    let recurringPaid = 0;
    for (const p of projPscs) {
      for (const a of p.ongoing?.accruals ?? []) {
        recurring += a.amount;
        if (effectiveAccrualStatus(a.status, a.periodStart, now) === "paid") recurringPaid += a.amount;
      }
    }

    totalCommission += old.origination + frozenSum + recurring;
    totalPaidCommission += recurringPaid;

    const ok = reserveOk && origOk && lineFail === 0;
    if (!ok) fails++;
    rows.push(
      `  ${ok ? "✓" : "✗"} ${project.name}\n` +
        `      reserve old ${old.firmReserve} → new ${next.firmReserveBeforeSource} (Δ${dReserve})` +
        `  · origination old ${old.origination} → new ${next.originationFromLabour} (Δ${dOrig})` +
        (projPscs.length ? `  · source frozen ${frozenSum} vs recompute ${next.sourceCommissionTotal} (${lineFail} line drift)` : ""),
    );
  }

  console.log("Commission parity gate — READ ONLY\n");
  console.log(rows.join("\n") || "  (no projects with a commission footprint)");
  console.log(`\n── Firm-wide ──`);
  console.log(`  Total commission (origination + source build + recurring): $${totalCommission.toLocaleString("en-CA")}`);
  console.log(`  Of which already paid (recurring): $${totalPaidCommission.toLocaleString("en-CA")}`);
  console.log(`\n${fails === 0 ? "PARITY PASS — new allocation reproduces the old numbers within tolerance." : `PARITY FAIL — ${fails} project(s) out of tolerance.`}`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
