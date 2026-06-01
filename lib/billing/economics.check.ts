// Acceptance checks for the economics math — the two worked examples from
// firm-economics.md §10. No test runner is configured; run directly:
//   npx tsx lib/billing/economics.check.ts
// Exits non-zero on any failed assertion.

import { economicsTotals, allocateLaborRevenue } from "./economics";

let failures = 0;
function eq(label: string, got: number, want: number) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}: got ${got}${ok ? "" : ` — expected ${want}`}`);
}

// ── Example A: 240-hr pilot, 60% MP / 30% Jr / 10% Dev, first contract ──
// MP 144×$450, Jr 72×$250, Dev 24×$250 → labour billable $88,800; +$1,200 direct.
{
  const totals = economicsTotals([
    { hours: 144, payRateCents: 33750, billRateCents: 45000, isExtra: false }, // MP
    { hours: 72, payRateCents: 15000, billRateCents: 25000, isExtra: false }, // Jr
    { hours: 24, payRateCents: 15000, billRateCents: 25000, isExtra: false }, // Dev @ Jr
  ]);
  eq("A · labour billable", totals.billableTotal, 88800);
  eq("A · take-home (cost)", totals.costTotal, 63000);

  const a = allocateLaborRevenue({
    laborBillable: totals.billableTotal,
    takeHome: totals.costTotal,
    directCosts: 1200,
    isFirstContract: true,
  });
  eq("A · client price", a.clientPrice, 90000);
  eq("A · origination", a.origination, 8880);
  eq("A · firm pool", a.firmPool, 13320);
  eq("A · labour budget", a.laborBudget, 66600);
  eq("A · firm reserve", a.firmReserve, 16920);
  eq("A · reconciles", a.takeHome + a.origination + a.firmReserve, a.laborBillable);
}

// ── Example B: Yardworx pilot (discounted MP rate), first contract ──
// Jr 39×$250/$150, MP 15×$300/$225 → billed $14,250.
{
  const totals = economicsTotals([
    { hours: 39, payRateCents: 15000, billRateCents: 25000, isExtra: false }, // Jr (Jack)
    { hours: 15, payRateCents: 22500, billRateCents: 30000, isExtra: false }, // MP (Jason, discounted)
  ]);
  eq("B · labour billable", totals.billableTotal, 14250);
  eq("B · take-home (cost)", totals.costTotal, 9225);

  const b = allocateLaborRevenue({
    laborBillable: totals.billableTotal,
    takeHome: totals.costTotal,
    isFirstContract: true,
  });
  eq("B · origination", b.origination, 1425);
  eq("B · firm reserve", b.firmReserve, 3600);
  eq("B · reconciles", b.takeHome + b.origination + b.firmReserve, b.laborBillable);
}

// ── Retainer: no origination, the 10% slot rolls into the firm pool ──
{
  const r = allocateLaborRevenue({ laborBillable: 100000, takeHome: 60000, isFirstContract: false });
  eq("R · origination is zero", r.origination, 0);
  eq("R · firm pool absorbs 25%", r.firmPool, 25000);
  eq("R · reconciles", r.takeHome + r.origination + r.firmReserve, r.laborBillable);
}

console.log(failures === 0 ? "\nAll economics checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
