// lib/billing/commission.test.ts — run: npx tsx lib/billing/commission.test.ts
// Pure math, no env needed (the Prisma enum imports are types, erased at runtime).

import assert from "node:assert/strict";
import { baseMonths, commissionDollars, accrualSchedule, addMonths, effectiveAccrualStatus } from "@/lib/billing/commission";

// baseMonths
assert.equal(baseMonths("deal_value"), 0);
assert.equal(baseMonths("total_6mo"), 6);
assert.equal(baseMonths("total_12mo"), 12);

// deal_value → build slice only, no recurring (nothing to double-count)
{
  const d = commissionDollars(5, "deal_value", 100_000, 4_000);
  assert.equal(d.build, 5_000);
  assert.equal(d.coveredMonths, 0);
  assert.equal(d.recurringTotal, 0);
}

// total_12mo → build + 12 recurring months
{
  const d = commissionDollars(5, "total_12mo", 100_000, 4_000);
  assert.equal(d.build, 5_000);
  assert.equal(d.recurringPerMonth, 200);
  assert.equal(d.coveredMonths, 12);
  assert.equal(d.recurringTotal, 2_400);
}

// accruals sum EXACTLY to the recurring total even with per-month rounding
{
  const pct = 5;
  const monthlyFee = 4_099; // 5% = 204.95 → perMonth rounds to 205
  const total = commissionDollars(pct, "total_6mo", 0, monthlyFee).recurringTotal;
  const rows = accrualSchedule(pct, monthlyFee, 6, new Date("2026-09-01T00:00:00Z"));
  assert.equal(rows.length, 6);
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  assert.equal(sum, total, "accruals reconcile to the projected recurring total");
  assert.equal(rows[0].periodIndex, 0);
  assert.equal(rows[0].periodStart.getUTCMonth(), 8); // Sep (0-indexed)
  assert.equal(rows[1].periodStart.getUTCMonth(), 9); // Oct
}

// addMonths clamps month-end overflow (Jan 31 + 1 → Feb, not Mar)
assert.equal(addMonths(new Date("2026-01-31T00:00:00Z"), 1).getUTCMonth(), 1);

// effectiveAccrualStatus: lazy projected→accrued flip, zero cron
assert.equal(effectiveAccrualStatus("projected", new Date("2020-01-01T00:00:00Z")), "accrued");
assert.equal(effectiveAccrualStatus("projected", new Date("2099-01-01T00:00:00Z")), "projected");
assert.equal(effectiveAccrualStatus("paid", new Date("2020-01-01T00:00:00Z")), "paid");

console.log("billing/commission.test.ts OK");
