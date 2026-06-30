// Acceptance checks for the commission payout splitting math (plan §9.6 / §9.7
// #5). Pure helpers only (the DB recompute mirrors the proven recomputePayoutsTx
// and is exercised at cutover). Run directly:
//   npx tsx lib/billing/commission-payouts.check.ts
// Exits non-zero on any failed assertion.

import { splitProportional, lineBuildTotal, recurringScheduleAmounts } from "./commission-payouts";

let failures = 0;
function eq(label: string, got: number, want: number) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}: got ${got}${ok ? "" : ` — expected ${want}`}`);
}
function arrEq(label: string, got: number[], want: number[]) {
  const ok = got.length === want.length && got.every((g, i) => g === want[i]);
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}: got [${got}]${ok ? "" : ` — expected [${want}]`}`);
}
function ok(label: string, cond: boolean) {
  if (!cond) failures++;
  console.log(`${cond ? "✓" : "✗"} ${label}`);
}

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

// ── splitProportional: exact sum, non-negative, largest-remainder ──
{
  // 5% of 88800 across a 50/25/25 schedule (worked example a, build stream).
  arrEq("split 4440 / [50,25,25]", splitProportional(4440, [50, 25, 25]), [2220, 1110, 1110]);
  // Even thirds: remainder of 1 lands on one row, sum stays exact.
  const thirds = splitProportional(100, [1, 1, 1]);
  eq("split 100/3 sums exactly", sum(thirds), 100);
  ok("split 100/3 non-negative", thirds.every((x) => x >= 0));
  ok("split 100/3 each is 33 or 34", thirds.every((x) => x === 33 || x === 34));
  // Remainder larger than 1, spread across rows.
  const five = splitProportional(5, Array(10).fill(1));
  eq("split 5 across 10 sums exactly", sum(five), 5);
  ok("split 5 across 10 non-negative", five.every((x) => x >= 0));
  ok("split 5 across 10 has five 1s", five.filter((x) => x === 1).length === 5);
  // Degenerate inputs.
  arrEq("split with no weights", splitProportional(100, []), []);
  arrEq("split zero total", splitProportional(0, [3, 1]), [0, 0]);
  arrEq("split zero weight", splitProportional(100, [0, 0]), [0, 0]);
}

// ── lineBuildTotal: source on build value, origination on labour pie ──
{
  const ctx = { laborBillable: 88800, authoritativeBuildValue: 50000 };
  eq("source line 5% of build value", lineBuildTotal({ buildPct: 5, basis: "build_value" }, ctx), 2500);
  eq("origination line 10% of labour", lineBuildTotal({ buildPct: 10, basis: "labor_revenue" }, ctx), 8880);
  // Per-partner origination share: 10% pool × 60% share = 6% of labour.
  eq("origination 6% (10%×60% share)", lineBuildTotal({ buildPct: 6, basis: "labor_revenue" }, ctx), 5328);
}

// ── recurringScheduleAmounts: 12 even months, exact sum, non-negative ──
{
  // Worked example (d): 5% of $8,000/mo × 12 → twelve rows of 400, total 4800.
  const sched = recurringScheduleAmounts(5, 8000, 12);
  eq("recurring count", sched.length, 12);
  eq("recurring sums to total", sum(sched), 4800);
  ok("recurring all 400", sched.every((x) => x === 400));
  // Fractional case: 3.33% of $1,000 × 3 = round(99.9) = 100, split non-negative.
  const frac = recurringScheduleAmounts(3.33, 1000, 3);
  eq("recurring fractional sums exactly", sum(frac), 100);
  ok("recurring fractional non-negative", frac.every((x) => x >= 0));
  // Zero months → no rows.
  arrEq("recurring zero months", recurringScheduleAmounts(5, 8000, 0), []);
}

console.log(failures === 0 ? "\nAll commission-payout checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
