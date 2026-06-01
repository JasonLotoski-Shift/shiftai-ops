// Project economics math — pure helpers (no DB, no "use server").
//
// A line is one person/role on the project: hours × payRate (what we pay,
// COST) and hours × billRate (what the client pays, BILLABLE). Rates are in
// CENTS; hours are fractional. Line/total amounts resolve to whole CAD.
// Extras (out-of-scope / change orders) are summed separately and excluded
// from reconciliation — mirroring how BillingInstallment.isExtra is handled.

export type EconLineInput = {
  hours: number;
  payRateCents: number;
  billRateCents: number;
  isExtra: boolean;
};

// Whole-CAD cost/bill for a single line (hours × cents-per-hour → CAD).
export function lineCostCAD(l: { hours: number; payRateCents: number }): number {
  return Math.round((l.hours * l.payRateCents) / 100);
}
export function lineBillCAD(l: { hours: number; billRateCents: number }): number {
  return Math.round((l.hours * l.billRateCents) / 100);
}

export type EconomicsTotals = {
  billableTotal: number; // whole CAD, non-extra
  costTotal: number; // whole CAD, non-extra
  grossMargin: number; // billableTotal - costTotal
  marginPct: number; // 0..1 (0 when billableTotal is 0)
  extrasBillable: number; // whole CAD
  extrasCost: number; // whole CAD
  totalHours: number; // non-extra
};

export function economicsTotals(lines: EconLineInput[]): EconomicsTotals {
  let billableTotal = 0;
  let costTotal = 0;
  let extrasBillable = 0;
  let extrasCost = 0;
  let totalHours = 0;
  for (const l of lines) {
    const bill = lineBillCAD(l);
    const cost = lineCostCAD(l);
    if (l.isExtra) {
      extrasBillable += bill;
      extrasCost += cost;
    } else {
      billableTotal += bill;
      costTotal += cost;
      totalHours += l.hours;
    }
  }
  const grossMargin = billableTotal - costTotal;
  const marginPct = billableTotal > 0 ? grossMargin / billableTotal : 0;
  return { billableTotal, costTotal, grossMargin, marginPct, extrasBillable, extrasCost, totalHours };
}

export type Reconciliation = {
  delta: number; // billableTotal - value (signed)
  balanced: boolean; // within tolerance
  tolerance: number; // the band that was applied (whole CAD)
};

// Economics ≈ project value? Tolerance = max(1% of value, $100). Warn-only —
// callers never block on this.
export function reconcile(billableTotal: number, value: number): Reconciliation {
  const tolerance = Math.max(Math.round(value * 0.01), 100);
  const delta = billableTotal - value;
  return { delta, balanced: Math.abs(delta) <= tolerance, tolerance };
}

// ──────────────────────────────────────────────────────────────────────
// The 10/15/75 internal allocation (firm-economics.md §3).
//
// Every dollar of LABOUR revenue (hours × bill rate) splits three ways, and
// the split lives INSIDE the bill rate — there is NO markup multiplier. Never
// divide by 0.75 / multiply by 1.333: price = labour billings + direct costs.
//
//   10% → origination  (first contract per client only; rolls to firm pool otherwise)
//   15% → firm pool
//   75% → labour budget (pays everyone's cost; surplus → firm reserve)
//
// Direct costs pass through AT COST and never enter this split.
// Reconciliation invariant (always exact): takeHome + origination + firmReserve = laborBillable.
// ──────────────────────────────────────────────────────────────────────

export const DEFAULT_ORIGINATION_PCT = 0.1; // 10% of labour revenue
export const FIRM_POOL_PCT = 0.15; // 15% firm reserve

export type LaborAllocation = {
  laborBillable: number; // Σ non-extra bill, whole CAD
  takeHome: number; // Σ non-extra cost (what the team is paid), whole CAD
  origination: number; // 10% on first contract, else 0
  firmPool: number; // 15% (+ the origination slot on retainer/subsequent)
  laborBudget: number; // 75% of billable (laborBillable − origination − firmPool)
  laborSurplus: number; // laborBudget − takeHome (rolls into firm reserve)
  firmReserve: number; // firmPool + laborSurplus
  directCosts: number; // pass-through, excluded from the split
  clientPrice: number; // laborBillable + directCosts (what the client pays)
  isFirstContract: boolean;
  originationPct: number; // fraction actually applied
};

// Split labour revenue into origination / firm pool / labour budget. `takeHome`
// is Σ(cost) of the non-extra lines (economicsTotals.costTotal). On a non-first
// contract the 10% origination slot rolls into the firm pool (firm capture rises
// ~10 points). firmReserve absorbs rounding so the invariant holds exactly.
export function allocateLaborRevenue(args: {
  laborBillable: number;
  takeHome: number;
  directCosts?: number;
  originationPct?: number; // fraction (0.10 = 10%); default DEFAULT_ORIGINATION_PCT
  isFirstContract?: boolean; // default true
}): LaborAllocation {
  const laborBillable = Math.max(0, Math.round(args.laborBillable));
  const takeHome = Math.max(0, Math.round(args.takeHome));
  const directCosts = Math.max(0, Math.round(args.directCosts ?? 0));
  const isFirstContract = args.isFirstContract ?? true;
  const originationPct = args.originationPct ?? DEFAULT_ORIGINATION_PCT;

  const origSlot = Math.round(laborBillable * originationPct);
  const origination = isFirstContract ? origSlot : 0;
  const firmPool = Math.round(laborBillable * FIRM_POOL_PCT) + (isFirstContract ? 0 : origSlot);
  const laborBudget = laborBillable - origination - firmPool;
  const laborSurplus = laborBudget - takeHome;
  const firmReserve = firmPool + laborSurplus;

  return {
    laborBillable,
    takeHome,
    origination,
    firmPool,
    laborBudget,
    laborSurplus,
    firmReserve,
    directCosts,
    clientPrice: laborBillable + directCosts,
    isFirstContract,
    originationPct,
  };
}

// Per-consultant total cost (non-extra), for splitting payouts across stages.
export function costByConsultant(
  lines: { consultantId: string | null; hours: number; payRateCents: number; isExtra: boolean }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) {
    if (l.isExtra || !l.consultantId) continue;
    const cost = lineCostCAD(l);
    out.set(l.consultantId, (out.get(l.consultantId) ?? 0) + cost);
  }
  return out;
}
