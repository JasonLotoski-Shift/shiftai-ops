// lib/billing/commission.ts
// Pure money math for deal-source commission + on-going service contracts.
// No "use server", no Prisma client — shared by the deal/project actions AND
// convertDeal (mirrors how lib/billing/apply.ts is shared), and unit-tested in
// isolation. All amounts are whole CAD ints (Project.budgetFee, ServiceContract.monthlyFee).
//
// NO-DOUBLE-COUNT: a commission splits into two DISJOINT dollar slices —
//   build slice  = round(pct/100 * buildValue)         [one-time, on budgetFee]
//   recurring    = round(pct/100 * monthlyFee * N)     [N months, on monthlyFee]
// The slices key to different revenue numbers, so no dollar is ever counted
// twice. The per-month accrual rows sum EXACTLY to the recurring total — the
// last row absorbs the per-month rounding remainder (same rule as
// recomputePayoutsTx in lib/billing/payouts.ts).

import type { CommissionBase, CommissionAccrualStatus } from "@/lib/generated/prisma/enums";

/** Months of recurring revenue the chosen base covers. deal_value = build only. */
export function baseMonths(base: CommissionBase): number {
  switch (base) {
    case "total_6mo":
      return 6;
    case "total_12mo":
      return 12;
    default:
      return 0; // deal_value
  }
}

export type CommissionDollars = {
  build: number; // one-time, on the build budgetFee
  recurringPerMonth: number; // nominal per accrual month, on the monthlyFee
  recurringTotal: number; // round(pct/100 * monthlyFee * N) — the projectedAmount
  coveredMonths: number; // N
};

/** Split a commission into its disjoint build + recurring dollar slices. */
export function commissionDollars(
  pct: number,
  base: CommissionBase,
  buildValue: number,
  monthlyFee: number,
): CommissionDollars {
  const n = baseMonths(base);
  const build = Math.round((pct / 100) * buildValue);
  const recurringPerMonth = Math.round((pct / 100) * monthlyFee);
  const recurringTotal = n > 0 ? Math.round((pct / 100) * monthlyFee * n) : 0;
  return { build, recurringPerMonth, recurringTotal, coveredMonths: n };
}

/** Add `n` whole months to a date (UTC-based for determinism; clamps month-end
 *  overflow so Jan 31 + 1 month = Feb 28/29, not Mar). */
export function addMonths(date: Date, n: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + n);
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d;
}

export type AccrualRow = { periodIndex: number; periodStart: Date; amount: number };

/** The per-month accrual schedule. N rows; rows 0..N-2 = nominal per-month, the
 *  LAST row carries the remainder so Σ(amount) === the recurring total exactly. */
export function accrualSchedule(
  pct: number,
  monthlyFee: number,
  coveredMonths: number,
  startDate: Date,
): AccrualRow[] {
  const n = coveredMonths;
  if (n <= 0) return [];
  const perMonth = Math.round((pct / 100) * monthlyFee);
  const total = Math.round((pct / 100) * monthlyFee * n);
  const rows: AccrualRow[] = [];
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    rows.push({
      periodIndex: i,
      periodStart: addMonths(startDate, i),
      amount: isLast ? total - perMonth * (n - 1) : perMonth,
    });
  }
  return rows;
}

/** Lazy placeholder→accrued flip — correct with ZERO cron. A projected row whose
 *  month has started reads as `accrued`; accrued/paid pass through. Rollups + the
 *  service-contract UI use this, never the raw status column. */
export function effectiveAccrualStatus(
  status: CommissionAccrualStatus,
  periodStart: Date,
  now: Date = new Date(),
): CommissionAccrualStatus {
  if (status === "projected" && periodStart.getTime() <= now.getTime()) return "accrued";
  return status;
}
