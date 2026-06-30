// lib/billing/cashflow.ts
// Pure cashflow engine (no DB, no "use server") for the Financials rebuild Phase 2
// cash strip + Money-home cashflow lens. Turns already-queried obligations into a
// dated stream of EXPECTED money movements, buckets them into 13 weekly or 12
// monthly periods with a running balance seeded by cash-on-hand, and derives the
// five cash-position numbers (on hand, in 30d, out 30d, projected close, runway).
//
// "Committed only": every item here is a real obligation (a sent invoice, a planned
// installment, a due bill, an owed payout, a contracted recurring fee). Weighted
// pipeline is intentionally excluded from v1 — it is an explicit opt-in the page can
// layer on later. All amounts whole CAD. The caller passes `now` for determinism.

export type CashDirection = "in" | "out";
export type CashItemKind =
  // in
  | "installment"
  | "invoice"
  | "contract" // recurring service-contract revenue
  // out
  | "bill"
  | "payout"
  | "reimbursement"
  | "subscription" // recurring SaaS/office the firm pays
  | "commission"; // recurring commission the firm owes (old accrual model in Phase 2)

export type ExpectedCashItem = {
  id: string;
  date: string; // ISO — when the money is expected to move
  amount: number; // whole CAD, always positive
  direction: CashDirection;
  kind: CashItemKind;
  label: string; // human row label for the worklist
  party: string | null; // who (vendor / client / consultant)
  overdue: boolean; // date is strictly before `now`
  undated: boolean; // no real due date on the source row (defaulted to now)
};

// ── Source rows (already queried; dates are real Date objects) ───────────────

export type CashflowSourceRows = {
  // IN
  installments: { id: string; label: string; amount: number; dueDate: Date | null; status: string }[];
  invoices: { id: string; number: string; amount: number; dueAt: Date; status: string; company: string | null }[];
  contracts: { id: string; label: string; monthlyFee: number; startDate: Date; termMonths: number; status: string }[];
  // OUT
  bills: { id: string; vendor: string; number: string | null; amount: number; dueAt: Date | null; status: string }[];
  owedPayouts: { id: string; party: string; amount: number; dueDate: Date | null }[];
  reimbursements: { id: string; party: string; amount: number }[];
  subscriptions: { id: string; vendor: string; amount: number; renewalDate: Date | null }[];
  commissions: { id: string; party: string; amount: number; periodStart: Date }[];
};

// ── Date helpers (local time — single-region app, display-oriented) ──────────

const DAY_MS = 86_400_000;
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// ── Periods ──────────────────────────────────────────────────────────────────

export type CashLensMode = "weekly" | "monthly";

export type CashPeriod = {
  key: string;
  label: string;
  start: string; // ISO (inclusive)
  end: string; // ISO (exclusive)
  opening: number;
  cashIn: number;
  cashOut: number;
  net: number;
  closing: number;
  negative: boolean;
};

type PeriodWindow = { key: string; label: string; start: Date; end: Date };

const WEEKLY_COUNT = 13;
const MONTHLY_COUNT = 12;

export function buildPeriodWindows(now: Date, mode: CashLensMode): PeriodWindow[] {
  const windows: PeriodWindow[] = [];
  if (mode === "monthly") {
    const start0 = startOfMonth(now);
    for (let i = 0; i < MONTHLY_COUNT; i++) {
      const start = addMonths(start0, i);
      const end = addMonths(start0, i + 1);
      windows.push({
        key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
        label: start.toLocaleDateString("en-CA", { month: "short", year: "numeric" }),
        start,
        end,
      });
    }
  } else {
    const start0 = startOfDay(now);
    for (let i = 0; i < WEEKLY_COUNT; i++) {
      const start = addDays(start0, i * 7);
      const end = addDays(start0, (i + 1) * 7);
      windows.push({
        key: `wk-${i}`,
        label: start.toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
        start,
        end,
      });
    }
  }
  return windows;
}

/** The forecast horizon end = the end of the longest lens (12 months), so the same
 *  item stream feeds both lenses and the 12-month runway. */
export function horizonEnd(now: Date): Date {
  return addMonths(startOfMonth(now), MONTHLY_COUNT);
}

// ── Expected-item stream ─────────────────────────────────────────────────────

/** Flatten every obligation into one dated, signed stream. Fixed-date items are
 *  always emitted (the bucketer clamps an overdue date into the first period);
 *  recurring contract revenue emits one occurrence per in-window month. */
export function buildExpectedItems(rows: CashflowSourceRows, now: Date): ExpectedCashItem[] {
  const out: ExpectedCashItem[] = [];
  const windowStart = startOfDay(now);
  const windowEnd = horizonEnd(now);
  const push = (
    id: string,
    date: Date,
    amount: number,
    direction: CashDirection,
    kind: CashItemKind,
    label: string,
    party: string | null,
    undated = false,
  ) => {
    if (amount <= 0) return;
    out.push({
      id,
      date: date.toISOString(),
      amount,
      direction,
      kind,
      label,
      party,
      overdue: date.getTime() < windowStart.getTime(),
      undated,
    });
  };

  // ── IN ──
  for (const inst of rows.installments) {
    if (inst.status !== "planned" || !inst.dueDate) continue;
    push(`inst-${inst.id}`, inst.dueDate, inst.amount, "in", "installment", inst.label || "Installment", null);
  }
  for (const inv of rows.invoices) {
    if (inv.status !== "sent" && inv.status !== "overdue") continue;
    push(`inv-${inv.id}`, inv.dueAt, inv.amount, "in", "invoice", `Invoice ${inv.number}`, inv.company);
  }
  for (const c of rows.contracts) {
    if (c.status !== "active" && c.status !== "pending_start") continue;
    if (c.monthlyFee <= 0) continue;
    for (let k = 0; k < c.termMonths; k++) {
      const occ = addMonths(c.startDate, k);
      if (occ.getTime() < windowStart.getTime()) continue; // already received
      if (occ.getTime() >= windowEnd.getTime()) break; // beyond horizon
      push(`contract-${c.id}-${k}`, occ, c.monthlyFee, "in", "contract", c.label || "Recurring fee", c.label);
    }
  }

  // ── OUT ──
  for (const b of rows.bills) {
    if (b.status === "paid" || b.status === "void") continue;
    const date = b.dueAt ?? windowStart;
    push(`bill-${b.id}`, date, b.amount, "out", "bill", b.number ? `Bill ${b.number}` : "Bill", b.vendor, !b.dueAt);
  }
  for (const p of rows.owedPayouts) {
    const date = p.dueDate ?? windowStart;
    push(`payout-${p.id}`, date, p.amount, "out", "payout", "Contractor payout", p.party, !p.dueDate);
  }
  for (const r of rows.reimbursements) {
    push(`reimb-${r.id}`, windowStart, r.amount, "out", "reimbursement", "Reimbursement owed", r.party, true);
  }
  for (const s of rows.subscriptions) {
    const date = s.renewalDate ?? windowStart;
    push(`sub-${s.id}`, date, s.amount, "out", "subscription", "Subscription", s.vendor, !s.renewalDate);
  }
  for (const c of rows.commissions) {
    push(`comm-${c.id}`, c.periodStart, c.amount, "out", "commission", "Recurring commission", c.party);
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// ── Bucketing (running balance) ──────────────────────────────────────────────

export function bucketCashflow(items: ExpectedCashItem[], windows: PeriodWindow[], openingCash: number): CashPeriod[] {
  if (windows.length === 0) return [];
  const firstStart = windows[0].start.getTime();
  const lastEnd = windows[windows.length - 1].end.getTime();
  const sums = windows.map(() => ({ cashIn: 0, cashOut: 0 }));

  for (const it of items) {
    let t = new Date(it.date).getTime();
    if (t >= lastEnd) continue; // beyond the horizon
    if (t < firstStart) t = firstStart; // overdue → first period
    // Find the period whose [start, end) contains t.
    let idx = 0;
    for (let i = 0; i < windows.length; i++) {
      if (t >= windows[i].start.getTime() && t < windows[i].end.getTime()) {
        idx = i;
        break;
      }
    }
    if (it.direction === "in") sums[idx].cashIn += it.amount;
    else sums[idx].cashOut += it.amount;
  }

  const periods: CashPeriod[] = [];
  let opening = openingCash;
  for (let i = 0; i < windows.length; i++) {
    const { cashIn, cashOut } = sums[i];
    const net = cashIn - cashOut;
    const closing = opening + net;
    periods.push({
      key: windows[i].key,
      label: windows[i].label,
      start: windows[i].start.toISOString(),
      end: windows[i].end.toISOString(),
      opening,
      cashIn,
      cashOut,
      net,
      closing,
      negative: closing < 0,
    });
    opening = closing;
  }
  return periods;
}

// ── Cash position (the strip) ────────────────────────────────────────────────

export type CashPosition = {
  cashOnHand: number;
  comingIn30: number;
  goingOut30: number;
  projectedClose30: number;
  runwayMonths: number | null; // null = cash-flow positive over the horizon (no burn)
  shortfallDate: string | null; // first day the running balance goes negative
};

/** The five always-visible numbers. 30-day window is exact (now → now+30d);
 *  runway uses the average net monthly OUTFLOW across the 12-month horizon. */
export function cashPosition(items: ExpectedCashItem[], now: Date, cashOnHand: number): CashPosition {
  const in30Cut = now.getTime() + 30 * DAY_MS;
  const nowT = now.getTime();
  let comingIn30 = 0;
  let goingOut30 = 0;
  let in12 = 0;
  let out12 = 0;
  const horizonT = horizonEnd(now).getTime();
  for (const it of items) {
    const t = new Date(it.date).getTime();
    const effT = Math.max(t, nowT); // overdue counts as due now
    if (effT <= in30Cut) {
      if (it.direction === "in") comingIn30 += it.amount;
      else goingOut30 += it.amount;
    }
    if (effT < horizonT) {
      if (it.direction === "in") in12 += it.amount;
      else out12 += it.amount;
    }
  }
  const avgNetMonthlyOutflow = (out12 - in12) / MONTHLY_COUNT;
  const runwayMonths = avgNetMonthlyOutflow > 0 ? cashOnHand / avgNetMonthlyOutflow : null;

  // Shortfall: walk the weekly periods (finest grain) and report the first start
  // date whose closing balance is negative.
  const weekly = bucketCashflow(items, buildPeriodWindows(now, "weekly"), cashOnHand);
  const firstNeg = weekly.find((p) => p.negative);

  return {
    cashOnHand,
    comingIn30,
    goingOut30,
    projectedClose30: cashOnHand + comingIn30 - goingOut30,
    runwayMonths,
    shortfallDate: firstNeg ? firstNeg.start : null,
  };
}

// ── Top-level compose ────────────────────────────────────────────────────────

export type CashflowResult = {
  weekly: CashPeriod[];
  monthly: CashPeriod[];
  position: CashPosition;
  items: ExpectedCashItem[]; // the full dated worklist, sorted ascending
};

export function computeCashflow(rows: CashflowSourceRows, now: Date, cashOnHand: number): CashflowResult {
  const items = buildExpectedItems(rows, now);
  return {
    weekly: bucketCashflow(items, buildPeriodWindows(now, "weekly"), cashOnHand),
    monthly: bucketCashflow(items, buildPeriodWindows(now, "monthly"), cashOnHand),
    position: cashPosition(items, now, cashOnHand),
    items,
  };
}
