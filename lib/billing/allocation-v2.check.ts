// Acceptance checks for the NEW allocation (plan §9.4 worked examples + §9.2
// invariant + §9.7 #1 rounding). No test runner is configured; run directly:
//   npx tsx lib/billing/allocation-v2.check.ts
// Exits non-zero on any failed assertion.

import { allocateLaborRevenueV2 } from "./allocation-v2";
import { roundHalfAwayFromZero } from "./round";

let failures = 0;
function eq(label: string, got: number, want: number) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}: got ${got}${ok ? "" : ` — expected ${want}`}`);
}
function ok(label: string, cond: boolean) {
  if (!cond) failures++;
  console.log(`${cond ? "✓" : "✗"} ${label}`);
}

// ── (a) Normal first-contract, no direct costs (§9.4a) ──
// laborBillable 88800, takeHome 63000, build 88800; origination 10%, source 5%.
{
  const a = allocateLaborRevenueV2({
    laborBillable: 88800,
    takeHome: 63000,
    authoritativeBuildValue: 88800,
    originationPct: 0.1,
    isFirstContract: true,
    commissionLines: [{ kind: "source", buildPct: 5 }],
  });
  eq("a · originationFromLabour", a.originationFromLabour, 8880);
  eq("a · firmReserveBeforeSource", a.firmReserveBeforeSource, 16920);
  eq("a · sourceCommissionTotal", a.sourceCommissionTotal, 4440);
  eq("a · firmReserve", a.firmReserve, 12480);
  eq("a · deficit", a.firmReserveDeficit, 0);
  ok("a · not over-committed", a.overCommitted === false);
  // §9.2 always: takeHome + originationFromLabour + firmReserveBeforeSource == laborBillable
  eq("a · labour-pie identity", a.takeHome + a.originationFromLabour + a.firmReserveBeforeSource, a.laborBillable);
  // §9.2 deficit==0 full form
  eq(
    "a · full identity (deficit 0)",
    a.takeHome + a.originationFromLabour + a.sourceCommissionTotal + a.firmReserve,
    a.laborBillable,
  );
}

// ── (b) First-contract WITH direct costs — the negative-reserve case (§9.4b) ──
// laborBillable 14250, takeHome 9225, directCosts 35750 so build 50000; orig 10%, source 10%.
{
  const b = allocateLaborRevenueV2({
    laborBillable: 14250,
    takeHome: 9225,
    directCosts: 35750,
    authoritativeBuildValue: 50000,
    originationPct: 0.1,
    isFirstContract: true,
    commissionLines: [{ kind: "source", buildPct: 10 }],
  });
  eq("b · originationFromLabour", b.originationFromLabour, 1425);
  eq("b · firmReserveBeforeSource", b.firmReserveBeforeSource, 3600);
  eq("b · sourceCommissionTotal", b.sourceCommissionTotal, 5000); // round(0.10 × 50000), build base not labour
  eq("b · firmReserve (clamped)", b.firmReserve, 0);
  eq("b · deficit", b.firmReserveDeficit, 1400);
  ok("b · over-committed flag fires", b.overCommitted === true);
  // §9.2 always (holds even with a deficit)
  eq("b · labour-pie identity", b.takeHome + b.originationFromLabour + b.firmReserveBeforeSource, b.laborBillable);
  // §9.2 deficit>0: takeHome + orig + source == laborBillable + deficit
  eq(
    "b · deficit identity",
    b.takeHome + b.originationFromLabour + b.sourceCommissionTotal,
    b.laborBillable + b.firmReserveDeficit,
  );
}

// ── (c) Buyout (§9.4c): value 100000 → firmReserve 100000, zero commission ──
{
  const c = allocateLaborRevenueV2({
    laborBillable: 0,
    takeHome: 0,
    authoritativeBuildValue: 100000,
    isBuyout: true,
    commissionLines: [{ kind: "source", buildPct: 5 }], // must be ignored
  });
  eq("c · firmReserve == build value", c.firmReserve, 100000);
  eq("c · origination 0", c.originationFromLabour, 0);
  eq("c · source 0 (ignored on buyout)", c.sourceCommissionTotal, 0);
  ok("c · no source slices", c.sourceSlices.length === 0);
}

// ── (d) Subscription build side (§9.4d) ──
// laborBillable 40000, takeHome 26000, build 40000; origination 10%, source 5% build.
// (The recurring 5% lives on the payout schedule, not in this build-side split.)
{
  const d = allocateLaborRevenueV2({
    laborBillable: 40000,
    takeHome: 26000,
    authoritativeBuildValue: 40000,
    originationPct: 0.1,
    isFirstContract: true,
    commissionLines: [{ kind: "source", buildPct: 5 }],
  });
  eq("d · originationFromLabour", d.originationFromLabour, 4000);
  eq("d · firmReserveBeforeSource", d.firmReserveBeforeSource, 10000);
  eq("d · source build slice", d.sourceCommissionTotal, 2000);
  eq("d · build-side firmReserve", d.firmReserve, 8000);
  eq("d · deficit", d.firmReserveDeficit, 0);
}

// ── Retainer: non-first contract pays no origination, slot stays in reserve ──
{
  const r = allocateLaborRevenueV2({
    laborBillable: 100000,
    takeHome: 60000,
    authoritativeBuildValue: 100000,
    originationPct: 0.1,
    isFirstContract: false,
    commissionLines: [],
  });
  eq("r · origination 0 on retainer", r.originationFromLabour, 0);
  eq("r · firmReserveBeforeSource keeps the slot", r.firmReserveBeforeSource, 40000);
  eq("r · firmReserve", r.firmReserve, 40000);
}

// ── Two source payees compute in order and sum (covers the 2+ payee case) ──
{
  const t = allocateLaborRevenueV2({
    laborBillable: 100000,
    takeHome: 50000,
    authoritativeBuildValue: 100000,
    originationPct: 0.1,
    isFirstContract: true,
    commissionLines: [
      { kind: "source", buildPct: 5 },
      { kind: "source", buildPct: 3 },
      { kind: "origination", buildPct: 99 }, // ignored by the source loop
    ],
  });
  eq("t · two slices summed", t.sourceCommissionTotal, 8000);
  ok("t · slices in order [5000, 3000]", t.sourceSlices[0] === 5000 && t.sourceSlices[1] === 3000);
  ok("t · origination line excluded from source loop", t.sourceSlices.length === 2);
}

// ── §9.7 #1: rounding pinned half-AWAY-from-zero, agrees to the dollar ──
{
  eq("round 2.5 → 3", roundHalfAwayFromZero(2.5), 3);
  eq("round -2.5 → -3", roundHalfAwayFromZero(-2.5), -3);
  // A source slice landing on a half-dollar: 2.5% of 50010 = 1250.25 → 1250;
  // 2.5% of 50030 = 1250.75 → 1251. And exactly .5: 2.5% of 50020 = 1250.5 → 1251.
  const half = allocateLaborRevenueV2({
    laborBillable: 100000,
    takeHome: 0,
    authoritativeBuildValue: 50020,
    isFirstContract: false,
    commissionLines: [{ kind: "source", buildPct: 2.5 }],
  });
  eq("half-cent slice rounds away from zero", half.sourceCommissionTotal, 1251);
}

console.log(failures === 0 ? "\nAll allocation-v2 checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
