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
