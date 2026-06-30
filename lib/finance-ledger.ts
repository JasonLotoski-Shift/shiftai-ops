// Pure ledger normalizer — the GL spine. Flattens Invoice / Bill / Expense /
// ConsultantPayout into ONE LedgerEntry[] that the Financials "Ledger" tab, the
// per-entity rollup (group-by entity), the missing-document worklist, and the
// CSV export all read. NO Prisma / Drive / fs imports — client-safe, same
// contract as lib/finance.ts.
//
// PHASE 2 (migration applied): a contractor payout and the invoice (Bill) that
// justifies it are linked EXACTLY via ConsultantPayout.settledByBillId. For a
// confirmed pair the payout is the cash that moved and the bill is the supporting
// document, so the bill is dropped from cash-out (countsAsCashOut=false) and the
// deduped money-out total counts the payment once. A payout with no link and no
// waiver flags as "missing a document" until an MP attaches the invoice or marks
// it "no invoice required" (ConsultantPayout.invoiceWaivedReason).

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
  // Cross-reference (Phase 2 = exact link via ConsultantPayout.settledByBillId):
  linkedEntryId: string | null; // GL id of the confirmed paired payout/bill
  waiverReason: string | null; // payout only — an MP's "no invoice required" reason
  countsAsCashOut: boolean; // false on the bill side of a CONFIRMED payout↔bill pair
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
  // Phase 2 cross-reference (selected only after the migration; see ledger-data).
  settledByBillId: string | null;
  invoiceWaivedReason: string | null;
};

export type RawCommissionPayout = {
  id: string;
  amount: number;
  status: string;
  method: string | null;
  paidAt: Date | null;
  confirmedAt: Date | null;
  createdAt: Date;
  stream: string; // build | recurring
  partnerId: string | null;
  partnerName: string | null;
  externalName: string | null;
  project: RawProject;
  // Reconciliation (mirrors RawPayout): a commission paid via a vendor bill, or an
  // MP waiver for an external referrer who has no bill.
  settledByBillId: string | null;
  invoiceWaivedReason: string | null;
};

export type LedgerRaw = {
  invoices: RawInvoice[];
  bills: RawBill[];
  expenses: RawExpense[];
  payouts: RawPayout[];
  commissions: RawCommissionPayout[];
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
    linkedEntryId: null,
    waiverReason: null,
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
    linkedEntryId: null,
    waiverReason: null,
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
    linkedEntryId: null,
    waiverReason: null,
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
    // Documented iff an MP waived it here, OR (set in linkSettledPairs) the linked
    // bill carries a Drive doc. A bare payout flags until linked or waived.
    hasDocument: !!p.invoiceWaivedReason,
    driveUrl: null,
    linkedEntryId: null,
    waiverReason: p.invoiceWaivedReason,
    countsAsCashOut: true,
    entityKey: entityKeyOf(party),
  };
}

function commissionPayoutToEntry(c: RawCommissionPayout): LedgerEntry {
  // The payee is a partner (entity) or an outside referrer (free-text external).
  const party: LedgerParty = c.partnerId
    ? { kind: "partner", id: c.partnerId, name: c.partnerName ?? "Partner" }
    : { kind: "external", id: null, name: c.externalName ?? "Referrer" };
  return {
    id: `commission-${c.id}`,
    sourceType: "commission",
    direction: "out",
    party,
    projectId: c.project?.id ?? null,
    projectName: projName(c.project?.name),
    number: null,
    category: null,
    categoryLabel: null,
    description: c.stream === "recurring" ? "Recurring commission" : "Build commission",
    amountCad: c.amount,
    origCurrency: null,
    origAmount: null,
    status: c.status,
    statusLabel: PAYOUT_STATUS_LABELS[c.status] ?? c.status,
    cashMoved: c.status === "paid" || c.status === "confirmed",
    date: (c.paidAt ?? c.createdAt).toISOString(),
    paidDate: iso(c.paidAt),
    // Documented iff an MP waived it (external, no bill) OR — set in linkBillSettlement —
    // the linked bill carries a Drive doc. A bare paid commission flags until then.
    hasDocument: !!c.invoiceWaivedReason,
    driveUrl: null,
    linkedEntryId: null,
    waiverReason: c.invoiceWaivedReason,
    countsAsCashOut: true,
    entityKey: entityKeyOf(party),
  };
}

/** Exact cross-reference (Phase 2): for every disbursement (consultant payout OR
 *  commission payout) with a `settledByBillId`, pair it with that bill. The
 *  disbursement is the cash that moved, so the bill is DROPPED from cash-out
 *  (countsAsCashOut=false) and re-filed under the payee for the entity rollup. The
 *  disbursement inherits the bill's document, clearing its missing-invoice flag
 *  once the PDF is filed. A bill may settle several disbursements; each is linked.
 *  `prefix` keys the GL id (`payout-` / `commission-`); both raw shapes carry
 *  `id` + `settledByBillId`. */
function linkBillSettlement(
  entries: LedgerEntry[],
  rows: { id: string; settledByBillId: string | null }[],
  prefix: "payout" | "commission",
): void {
  const byId = new Map(entries.map((e) => [e.id, e] as const));
  for (const p of rows) {
    if (!p.settledByBillId) continue;
    const payEntry = byId.get(`${prefix}-${p.id}`);
    const billEntry = byId.get(`bill-${p.settledByBillId}`);
    if (!payEntry || !billEntry) continue;
    payEntry.linkedEntryId = billEntry.id;
    billEntry.linkedEntryId = payEntry.id;
    // Count the cash exactly once, on whichever side actually settled. Normally the
    // disbursement is the cash and the bill is its document. But the two have
    // independent statuses: if the BILL was paid while the disbursement is still
    // owed, the bill is the cash that moved and the owed disbursement becomes the
    // doc side — otherwise that real outflow would vanish from the money-out total.
    if (!payEntry.cashMoved && billEntry.cashMoved) {
      payEntry.countsAsCashOut = false; // the paid bill carries the cash
    } else {
      billEntry.countsAsCashOut = false; // the disbursement carries the cash; the bill is the doc
    }
    billEntry.entityKey = payEntry.entityKey; // group the bill under the payee (keep its vendor label)
    if (billEntry.hasDocument) payEntry.hasDocument = true; // the bill PDF documents the disbursement
  }
}

export function toLedgerEntries(raw: LedgerRaw): LedgerEntry[] {
  const entries: LedgerEntry[] = [
    ...raw.invoices.map(invoiceToEntry),
    ...raw.bills.map(billToEntry),
    ...raw.expenses.map(expenseToEntry),
    ...raw.payouts.map(payoutToEntry),
    ...raw.commissions.map(commissionPayoutToEntry),
  ];
  linkBillSettlement(entries, raw.payouts, "payout");
  linkBillSettlement(entries, raw.commissions, "commission");
  entries.sort((a, b) => b.date.localeCompare(a.date));
  return entries;
}

// ── Compliance ───────────────────────────────────────────────────────────

/** A money-out record that left the firm's "every dollar has a document" net:
 *  no backing doc, not void/draft. The doc-side of a confirmed payout↔bill pair
 *  (countsAsCashOut=false) is excluded — its compliance is represented through the
 *  payout it settles, so the gap is counted once (on the payout) not twice. An
 *  OWED payout (not yet paid) is excluded too: no cash has left, so no invoice is
 *  expected yet — it flags once it's marked paid. */
export function isMissingDoc(e: LedgerEntry): boolean {
  if (e.direction !== "out" || !e.countsAsCashOut) return false;
  if (e.status === "void" || e.status === "draft") return false;
  // An OWED disbursement (payout or commission) hasn't moved cash yet, so no
  // invoice is expected — it flags once it's marked paid.
  if ((e.sourceType === "payout" || e.sourceType === "commission") && !e.cashMoved) return false;
  return !e.hasDocument;
}

// ── Totals (the only summing path; never blends payouts + bills) ────────────

export type LedgerTotals = {
  receivedIn: number;
  invoicedIn: number;
  outstandingIn: number;
  payoutsPaid: number;
  payoutsOwed: number;
  commissionPaid: number;
  commissionOwed: number;
  billsExpensesPaid: number;
  billsExpensesOutstanding: number;
  cashOut: number; // the single deduped money-out figure (== payoutsPaid + commissionPaid + billsExpensesPaid)
  committedOut: number; // owed / received-not-paid, deduped (== payoutsOwed + commissionOwed + billsExpensesOutstanding)
  missingDocCount: number;
  missingDocExposure: number;
};

// The ONE summing path. A confirmed payout↔bill pair counts ONCE: the payout is
// the cash (countsAsCashOut=true); the linked bill (countsAsCashOut=false) is the
// document and is skipped, so cashOut never double-counts a contractor payment.
export function ledgerTotals(entries: LedgerEntry[]): LedgerTotals {
  let receivedIn = 0,
    invoicedIn = 0,
    payoutsPaid = 0,
    payoutsOwed = 0,
    commissionPaid = 0,
    commissionOwed = 0,
    billsExpensesPaid = 0,
    billsExpensesOutstanding = 0,
    cashOut = 0,
    committedOut = 0,
    missingDocCount = 0,
    missingDocExposure = 0;
  for (const e of entries) {
    if (e.direction === "in") {
      if (e.status !== "draft") invoicedIn += e.amountCad;
      if (e.cashMoved) receivedIn += e.amountCad;
    } else if (e.status !== "void" && e.countsAsCashOut) {
      // Only the cash-carrying side reaches here; the doc side of a linked pair
      // (countsAsCashOut=false — a bill OR an owed disbursement) is excluded from
      // EVERY total, so the breakdown sums to the deduped figures with no double-count.
      const paid = e.cashMoved;
      if (e.sourceType === "payout") {
        if (paid) payoutsPaid += e.amountCad;
        else payoutsOwed += e.amountCad;
      } else if (e.sourceType === "commission") {
        if (paid) commissionPaid += e.amountCad;
        else commissionOwed += e.amountCad;
      } else if (paid) {
        billsExpensesPaid += e.amountCad;
      } else if (e.status !== "draft") {
        billsExpensesOutstanding += e.amountCad;
      }
      if (e.status !== "draft") {
        if (paid) cashOut += e.amountCad;
        else committedOut += e.amountCad;
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
    commissionPaid,
    commissionOwed,
    billsExpensesPaid,
    billsExpensesOutstanding,
    cashOut,
    committedOut,
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
