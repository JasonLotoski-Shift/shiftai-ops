// Pure ledger normalizer — the GL spine. Flattens Invoice / Bill / Expense /
// ConsultantPayout into ONE LedgerEntry[] that the Financials "Ledger" tab, the
// per-entity rollup (group-by entity), the missing-document worklist, and the
// CSV export all read. NO Prisma / Drive / fs imports — client-safe, same
// contract as lib/finance.ts.
//
// PHASE 1 (no migration): reads existing columns only. There is no payout<->bill
// link column yet, so a contractor payout and the invoice (Bill) that justifies
// it are matched HEURISTICALLY (same project, equal amount, matching name) and
// shown as a "possible" pair. We never blend payouts + bills into one money-out
// total: the header shows contractor payouts and bills/expenses as SEPARATE
// figures. The only place the heuristic touches a number is a group SUBTOTAL,
// where the matched bill is excluded (the payout is the cash; the bill is the
// document) and visibly chipped — never silently. The exact link lands in Phase 2.

import type { ExpenseCategory } from "@/lib/types";
import {
  EXPENSE_CATEGORY_LABELS,
  BILL_STATUS_LABELS,
  EXPENSE_STATUS_LABELS,
  nameSlug,
} from "@/lib/finance";

export type LedgerSourceType = "invoice" | "bill" | "expense" | "payout" | "commission";
export type LedgerDirection = "in" | "out";
export type EntityKind = "client" | "consultant" | "vendor" | "partner" | "external";

export type LedgerParty = { kind: EntityKind; id: string | null; name: string };

export type LedgerEntry = {
  id: string; // GL id, prefixed by source: inv- / bill- / exp- / payout-
  sourceType: LedgerSourceType;
  direction: LedgerDirection;
  party: LedgerParty;
  projectId: string | null;
  projectName: string | null;
  number: string | null;
  category: ExpenseCategory | null;
  categoryLabel: string | null;
  description: string | null;
  amountCad: number; // whole CAD (total || amount; gstBps is 0 today)
  origCurrency: string | null;
  origAmount: number | null;
  status: string; // source-native status, raw
  statusLabel: string;
  cashMoved: boolean; // money actually moved (paid / reimbursed / confirmed)
  date: string; // ISO — best available (issued / spent / paid / created)
  paidDate: string | null;
  hasDocument: boolean; // a backing invoice / receipt is on file
  driveUrl: string | null;
  // Cross-reference (Phase 2 = exact link; Phase 1 = heuristic):
  probablePairId: string | null; // GL id of a likely-matching payout/bill
  countsAsCashOut: boolean; // false on the bill side of a probable pair (group subtotals only)
  entityKey: string; // `${kind}:${id ?? slug(name)}` — stable grouping key
};

// ── Raw inputs (match the Prisma selects in ledger-data.ts) ────────────────
// Enum-typed columns are taken as `string` here to avoid coupling to the
// generated client's enum types; we narrow by comparison below.

type RawProject = { id: string; name: string } | null;

export type RawInvoice = {
  id: string;
  number: string;
  amount: number;
  total: number;
  issuedAt: Date;
  paidAt: Date | null;
  status: string;
  client: { id: string; company: string } | null;
  project: RawProject;
};
export type RawBill = {
  id: string;
  vendor: string;
  number: string | null;
  amount: number;
  total: number;
  origAmount: number | null;
  origCurrency: string | null;
  issuedAt: Date | null;
  createdAt: Date;
  paidAt: Date | null;
  status: string;
  category: string | null;
  description: string | null;
  driveUrl: string | null;
  project: RawProject;
};
export type RawExpense = {
  id: string;
  vendor: string | null;
  description: string | null;
  category: string;
  kind: string;
  amount: number;
  total: number;
  origAmount: number | null;
  origCurrency: string | null;
  spentAt: Date;
  reimbursedAt: Date | null;
  status: string;
  needsPhoto: boolean;
  driveUrl: string | null;
  paidById: string | null;
  paidByConsultantId: string | null;
  paidBy: { name: string } | null;
  paidByConsultant: { name: string } | null;
  project: RawProject;
};
export type RawPayout = {
  id: string;
  amount: number;
  status: string;
  method: string | null;
  paidAt: Date | null;
  confirmedAt: Date | null;
  createdAt: Date;
  consultantId: string;
  consultant: { name: string };
  project: RawProject;
};

export type LedgerRaw = {
  invoices: RawInvoice[];
  bills: RawBill[];
  expenses: RawExpense[];
  payouts: RawPayout[];
};

// ── Labels ─────────────────────────────────────────────────────────────────

export const LEDGER_TYPE_LABELS: Record<LedgerSourceType, string> = {
  invoice: "Invoice",
  bill: "Bill",
  expense: "Expense",
  payout: "Payout",
  commission: "Commission",
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
};
const PAYOUT_STATUS_LABELS: Record<string, string> = {
  owed: "Owed",
  paid: "Paid",
  confirmed: "Confirmed",
};

// ── Helpers ──────────────────────────────────────────────────────────────

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const catLabel = (c: string | null): string | null =>
  c ? EXPENSE_CATEGORY_LABELS[c as ExpenseCategory] ?? c : null;

// Project names are stored as "Client · Project" — show the trailing part.
const projName = (name: string | null | undefined): string | null =>
  name == null ? null : name.split("·")[1]?.trim() ?? name;

const entityKeyOf = (p: LedgerParty): string => `${p.kind}:${p.id ?? nameSlug(p.name)}`;

const DAY_MS = 86_400_000;
function daysApart(a: string | null, b: string | null): number {
  if (!a || !b) return Infinity;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / DAY_MS;
}

// ── Normalizers ────────────────────────────────────────────────────────────

function invoiceToEntry(i: RawInvoice): LedgerEntry {
  const party: LedgerParty = { kind: "client", id: i.client?.id ?? null, name: i.client?.company ?? "Unknown client" };
  return {
    id: `inv-${i.id}`,
    sourceType: "invoice",
    direction: "in",
    party,
    projectId: i.project?.id ?? null,
    projectName: projName(i.project?.name),
    number: i.number,
    category: null,
    categoryLabel: null,
    description: null,
    amountCad: i.total || i.amount,
    origCurrency: null,
    origAmount: null,
    status: i.status,
    statusLabel: INVOICE_STATUS_LABELS[i.status] ?? i.status,
    cashMoved: i.status === "paid",
    date: i.issuedAt.toISOString(),
    paidDate: iso(i.paidAt),
    hasDocument: i.status !== "draft", // the issued invoice IS our document
    driveUrl: null,
    probablePairId: null,
    countsAsCashOut: true,
    entityKey: entityKeyOf(party),
  };
}

function billToEntry(b: RawBill): LedgerEntry {
  // Phase 1: no consultant link column yet, so a bill's party is its free-text
  // vendor. (Phase 2 resolves contractor bills to the Consultant entity.)
  const party: LedgerParty = { kind: "vendor", id: null, name: b.vendor };
  return {
    id: `bill-${b.id}`,
    sourceType: "bill",
    direction: "out",
    party,
    projectId: b.project?.id ?? null,
    projectName: projName(b.project?.name),
    number: b.number,
    category: (b.category as ExpenseCategory | null) ?? null,
    categoryLabel: catLabel(b.category),
    description: b.description,
    amountCad: b.total || b.amount,
    origCurrency: b.origCurrency,
    origAmount: b.origAmount,
    status: b.status,
    statusLabel: BILL_STATUS_LABELS[b.status as keyof typeof BILL_STATUS_LABELS] ?? b.status,
    cashMoved: b.status === "paid",
    date: (b.issuedAt ?? b.createdAt).toISOString(),
    paidDate: iso(b.paidAt),
    hasDocument: !!b.driveUrl,
    driveUrl: b.driveUrl,
    probablePairId: null,
    countsAsCashOut: true,
    entityKey: entityKeyOf(party),
  };
}

function expenseToEntry(e: RawExpense): LedgerEntry {
  // Reimbursable: the party is the person the firm owes back (partner or
  // consultant). Firm-paid / subscription: the vendor.
  let party: LedgerParty;
  if (e.kind === "reimbursable" && (e.paidByConsultantId || e.paidById)) {
    party = e.paidByConsultantId
      ? { kind: "consultant", id: e.paidByConsultantId, name: e.paidByConsultant?.name ?? "Consultant" }
      : { kind: "partner", id: e.paidById, name: e.paidBy?.name ?? "Partner" };
  } else {
    party = { kind: "vendor", id: null, name: e.vendor ?? catLabel(e.category) ?? "Expense" };
  }
  // Mileage is CRA-computed and legitimately receipt-free → treat as documented.
  const hasDocument = !e.needsPhoto || e.category === "fuel_mileage";
  return {
    id: `exp-${e.id}`,
    sourceType: "expense",
    direction: "out",
    party,
    projectId: e.project?.id ?? null,
    projectName: projName(e.project?.name),
    number: null,
    category: e.category as ExpenseCategory,
    categoryLabel: catLabel(e.category),
    description: e.description,
    amountCad: e.total || e.amount,
    origCurrency: e.origCurrency,
    origAmount: e.origAmount,
    status: e.status,
    statusLabel: EXPENSE_STATUS_LABELS[e.status as keyof typeof EXPENSE_STATUS_LABELS] ?? e.status,
    cashMoved: e.status === "paid" || e.status === "reimbursed",
    date: e.spentAt.toISOString(),
    paidDate: iso(e.reimbursedAt),
    hasDocument,
    driveUrl: e.driveUrl,
    probablePairId: null,
    countsAsCashOut: true,
    entityKey: entityKeyOf(party),
  };
}

function payoutToEntry(p: RawPayout): LedgerEntry {
  const party: LedgerParty = { kind: "consultant", id: p.consultantId, name: p.consultant.name };
  return {
    id: `payout-${p.id}`,
    sourceType: "payout",
    direction: "out",
    party,
    projectId: p.project?.id ?? null,
    projectName: projName(p.project?.name),
    number: null,
    category: null,
    categoryLabel: null,
    description: p.method ? `Paid by ${p.method}` : null,
    amountCad: p.amount,
    origCurrency: null,
    origAmount: null,
    status: p.status,
    statusLabel: PAYOUT_STATUS_LABELS[p.status] ?? p.status,
    cashMoved: p.status === "paid" || p.status === "confirmed",
    date: (p.paidAt ?? p.createdAt).toISOString(),
    paidDate: iso(p.paidAt),
    hasDocument: false, // Phase 1: no link column — every payout flags until linked/waived (Phase 2)
    driveUrl: null,
    probablePairId: null,
    countsAsCashOut: true,
    entityKey: entityKeyOf(party),
  };
}

/** Heuristic pairing: a contractor payout and a bill that probably document the
 *  same dollars (same project, equal amount, matching name, within 60 days).
 *  Mutates entries: links both via probablePairId and drops the BILL from cash-out
 *  subtotals (the payout is the cash). Never auto-dedupes a header total. */
function markProbablePairs(entries: LedgerEntry[]): void {
  const bills = entries.filter((e) => e.sourceType === "bill" && e.projectId);
  const usedBill = new Set<string>();
  for (const payout of entries) {
    if (payout.sourceType !== "payout" || !payout.projectId) continue;
    const match = bills.find(
      (b) =>
        !usedBill.has(b.id) &&
        b.projectId === payout.projectId &&
        b.amountCad === payout.amountCad &&
        (nameSlug(b.party.name) === nameSlug(payout.party.name) ||
          nameSlug(b.party.name).includes(nameSlug(payout.party.name))) &&
        daysApart(b.paidDate ?? b.date, payout.paidDate ?? payout.date) <= 60,
    );
    if (!match) continue;
    usedBill.add(match.id);
    payout.probablePairId = match.id;
    match.probablePairId = payout.id;
    match.countsAsCashOut = false; // the payout carries the cash; the bill is the doc
  }
}

export function toLedgerEntries(raw: LedgerRaw): LedgerEntry[] {
  const entries: LedgerEntry[] = [
    ...raw.invoices.map(invoiceToEntry),
    ...raw.bills.map(billToEntry),
    ...raw.expenses.map(expenseToEntry),
    ...raw.payouts.map(payoutToEntry),
  ];
  markProbablePairs(entries);
  entries.sort((a, b) => b.date.localeCompare(a.date));
  return entries;
}

// ── Compliance ───────────────────────────────────────────────────────────

/** A money-out record that left the firm's "every dollar has a document" net:
 *  no backing doc, not void/draft, and not already shown as a probable pair. */
export function isMissingDoc(e: LedgerEntry): boolean {
  return (
    e.direction === "out" &&
    !e.hasDocument &&
    !e.probablePairId &&
    e.status !== "void" &&
    e.status !== "draft"
  );
}

// ── Totals (the only summing path; never blends payouts + bills) ────────────

export type LedgerTotals = {
  receivedIn: number;
  invoicedIn: number;
  outstandingIn: number;
  payoutsPaid: number;
  payoutsOwed: number;
  billsExpensesPaid: number;
  billsExpensesOutstanding: number;
  missingDocCount: number;
  missingDocExposure: number;
};

export function ledgerTotals(entries: LedgerEntry[]): LedgerTotals {
  let receivedIn = 0,
    invoicedIn = 0,
    payoutsPaid = 0,
    payoutsOwed = 0,
    billsExpensesPaid = 0,
    billsExpensesOutstanding = 0,
    missingDocCount = 0,
    missingDocExposure = 0;
  for (const e of entries) {
    if (e.direction === "in") {
      if (e.status !== "draft") invoicedIn += e.amountCad;
      if (e.cashMoved) receivedIn += e.amountCad;
    } else if (e.status !== "void") {
      const paid = e.cashMoved;
      if (e.sourceType === "payout") {
        if (paid) payoutsPaid += e.amountCad;
        else payoutsOwed += e.amountCad;
      } else {
        if (paid) billsExpensesPaid += e.amountCad;
        else if (e.status !== "draft") billsExpensesOutstanding += e.amountCad;
      }
    }
    if (isMissingDoc(e)) {
      missingDocCount += 1;
      missingDocExposure += e.amountCad;
    }
  }
  return {
    receivedIn,
    invoicedIn,
    outstandingIn: invoicedIn - receivedIn,
    payoutsPaid,
    payoutsOwed,
    billsExpensesPaid,
    billsExpensesOutstanding,
    missingDocCount,
    missingDocExposure,
  };
}

// ── Filtering ──────────────────────────────────────────────────────────────

export type LedgerStatusFilter = "all" | "paid" | "unpaid";
export type LedgerQuery = {
  text?: string;
  type?: LedgerSourceType | "all";
  direction?: LedgerDirection | "all";
  status?: LedgerStatusFilter;
  missingDocOnly?: boolean;
};

export function filterLedger(entries: LedgerEntry[], q: LedgerQuery): LedgerEntry[] {
  const text = q.text?.trim().toLowerCase() ?? "";
  return entries.filter((e) => {
    if (q.type && q.type !== "all" && e.sourceType !== q.type) return false;
    if (q.direction && q.direction !== "all" && e.direction !== q.direction) return false;
    if (q.status === "paid" && !e.cashMoved) return false;
    if (q.status === "unpaid" && e.cashMoved) return false;
    if (q.missingDocOnly && !isMissingDoc(e)) return false;
    if (text) {
      const hay = `${e.party.name} ${e.number ?? ""} ${e.description ?? ""} ${e.projectName ?? ""} ${e.categoryLabel ?? ""}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}

// ── Grouping ─────────────────────────────────────────────────────────────

export type LedgerGroupBy = "none" | "project" | "entity" | "month";
export type LedgerGroup = {
  key: string;
  label: string;
  entries: LedgerEntry[];
  subtotalIn: number;
  subtotalOut: number; // money out, with probable-pair bills excluded
  missingDocCount: number;
};

function subtotals(entries: LedgerEntry[]): Pick<LedgerGroup, "subtotalIn" | "subtotalOut" | "missingDocCount"> {
  let subtotalIn = 0,
    subtotalOut = 0,
    missingDocCount = 0;
  for (const e of entries) {
    if (e.direction === "in") {
      if (e.cashMoved) subtotalIn += e.amountCad;
    } else if (e.status !== "void" && e.countsAsCashOut && e.cashMoved) {
      subtotalOut += e.amountCad;
    }
    if (isMissingDoc(e)) missingDocCount += 1;
  }
  return { subtotalIn, subtotalOut, missingDocCount };
}

function monthLabel(key: string): string {
  const d = new Date(`${key}-01T00:00:00`);
  return Number.isNaN(d.getTime())
    ? key
    : d.toLocaleDateString("en-CA", { month: "short", year: "numeric" });
}

export function groupLedger(entries: LedgerEntry[], by: LedgerGroupBy): LedgerGroup[] {
  if (by === "none") {
    return [{ key: "all", label: "", entries, ...subtotals(entries) }];
  }
  const map = new Map<string, { key: string; label: string; entries: LedgerEntry[] }>();
  for (const e of entries) {
    let key: string;
    let label: string;
    if (by === "project") {
      key = e.projectId ?? "_none";
      label = e.projectName ?? "Firm / unassigned";
    } else if (by === "entity") {
      key = e.entityKey;
      label = e.party.name;
    } else {
      key = e.date.slice(0, 7);
      label = monthLabel(key);
    }
    let g = map.get(key);
    if (!g) {
      g = { key, label, entries: [] };
      map.set(key, g);
    }
    g.entries.push(e);
  }
  const groups = [...map.values()].map((g) => ({ ...g, ...subtotals(g.entries) }));
  if (by === "month") groups.sort((a, b) => b.key.localeCompare(a.key));
  else groups.sort((a, b) => b.subtotalOut + b.subtotalIn - (a.subtotalOut + a.subtotalIn));
  return groups;
}
