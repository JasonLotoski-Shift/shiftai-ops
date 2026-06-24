// lib/billing/forecast.ts
// Pure forecast math (no DB, no "use server") for the /financials forecast:
// pipeline-weighted revenue, subscription run-rate (MRR/ARR), and a projected
// cash-in calendar. All amounts whole CAD. Callers pass already-queried rows.

export const FORECAST_MONTHS = 12;

/** Whole months from a→b, floored at 1 (UTC-based for determinism). */
export function monthsBetween(a: Date, b: Date): number {
  const m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  return Math.max(1, m);
}

export type DealForWeight = { valueEstimate: number; probability: number | null; acceptedEstimateTotal?: number | null };

/** A deal's probability-weighted value. Prefers an accepted estimate's total over
 *  the rough valueEstimate. probability null => weighted 0 + an unweighted flag the
 *  caller surfaces (so they're visible, not silently dropped). */
export function weightDeal(d: DealForWeight): { weighted: number; unweighted: boolean } {
  const base = d.acceptedEstimateTotal && d.acceptedEstimateTotal > 0 ? d.acceptedEstimateTotal : d.valueEstimate;
  if (d.probability == null) return { weighted: 0, unweighted: true };
  return { weighted: Math.round(base * (d.probability / 100)), unweighted: false };
}

export function weightedPipelineTotal(deals: DealForWeight[]): { total: number; unweightedCount: number } {
  let total = 0;
  let unweightedCount = 0;
  for (const d of deals) {
    const { weighted, unweighted } = weightDeal(d);
    total += weighted;
    if (unweighted) unweightedCount++;
  }
  return { total, unweightedCount };
}

export type ProjectForMrr = {
  projectType: string | null;
  budgetFee: number;
  scheduleType: string;
  startDate: Date;
  targetEndDate: Date;
  serviceContractMonthlyFee?: number | null;
};

/** Monthly recurring fee for a project. Prefers the item-5 ServiceContract fee
 *  (canonical); else for a subscription the budgetFee (monthly_even => budgetFee
 *  IS the monthly per apply.ts subscriptionMonthDraft; else budgetFee spread over
 *  the term). 0 for anything non-recurring (buyout, one-off, legacy null type). */
export function deriveMonthlyFee(p: ProjectForMrr): number {
  if (p.serviceContractMonthlyFee && p.serviceContractMonthlyFee > 0) return p.serviceContractMonthlyFee;
  if (p.projectType !== "subscription") return 0;
  if (p.scheduleType === "monthly_even") return p.budgetFee;
  return Math.round(p.budgetFee / monthsBetween(p.startDate, p.targetEndDate));
}

export function mrrTotal(projects: ProjectForMrr[]): number {
  return projects.reduce((s, p) => s + deriveMonthlyFee(p), 0);
}

export function arrTotal(projects: ProjectForMrr[]): number {
  return mrrTotal(projects) * 12;
}

export type CashInputs = {
  installments: { amount: number; dueDate: Date | null; status: string }[];
  invoices: { amount: number; dueAt: Date; status: string }[];
  ongoing: { monthlyFee: number; startDate: Date; termMonths: number; status: string }[];
};

export type CashMonth = { monthKey: string; monthLabel: string; installments: number; ongoingFees: number; total: number };

function monthKeyOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthLabelOf(d: Date): string {
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", timeZone: "UTC" });
}

/** Bucket projected cash-in over `months` from `fromDate`: planned installments +
 *  sent/overdue invoices by due month (disjoint — an installment is either still
 *  planned or already invoiced), plus each active/pending ServiceContract's monthly
 *  fee across its in-window remaining months. Paid invoices excluded (cash already in). */
export function bucketCashIn(inputs: CashInputs, fromDate: Date, months: number): CashMonth[] {
  const buckets: CashMonth[] = [];
  const index = new Map<string, CashMonth>();
  const start = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1));
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const m: CashMonth = { monthKey: monthKeyOf(d), monthLabel: monthLabelOf(d), installments: 0, ongoingFees: 0, total: 0 };
    buckets.push(m);
    index.set(m.monthKey, m);
  }
  const add = (date: Date, amount: number, kind: "installments" | "ongoingFees") => {
    const m = index.get(monthKeyOf(date));
    if (m) {
      m[kind] += amount;
      m.total += amount;
    }
  };
  for (const inst of inputs.installments) {
    if (inst.status !== "planned" || !inst.dueDate) continue;
    add(inst.dueDate, inst.amount, "installments");
  }
  for (const inv of inputs.invoices) {
    if (inv.status !== "sent" && inv.status !== "overdue") continue;
    add(inv.dueAt, inv.amount, "installments");
  }
  for (const c of inputs.ongoing) {
    if (c.status !== "active" && c.status !== "pending_start") continue;
    for (let k = 0; k < c.termMonths; k++) {
      add(new Date(Date.UTC(c.startDate.getUTCFullYear(), c.startDate.getUTCMonth() + k, 1)), c.monthlyFee, "ongoingFees");
    }
  }
  return buckets;
}
