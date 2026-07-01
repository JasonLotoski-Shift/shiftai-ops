"use client";

// Financials sub-tabs: Overview (the firm revenue rollup, passed as children)
// and AP/AR (managing partners only — outstanding invoices + bills + expenses).
// The AP/AR tab is the new home of the old Invoice Register plus the vendor-bill
// (AP) and expense ledgers, with the "+ Upload" action that adds any of them.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, ExternalLink, FileWarning, Download, Repeat } from "lucide-react";
import { Card, Stat, Badge, Button, EmptyState, Tabs } from "@/components/ui";
import { formatCAD, formatDate, daysSince } from "@/lib/format";
import {
  agingBucket,
  AGING_LABELS,
  type AgingBucket,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_STATUS_LABELS,
} from "@/lib/finance";
import type { BillStatus, ExpenseCategory, ExpenseKind, ExpenseStatus } from "@/lib/types";
import { markBillPaid, markExpenseReimbursed, markExpensePaid, exportLedgerCsv } from "@/app/(app)/financials/finance-actions";
import { markInvoicePaid } from "@/app/(app)/invoices/[id]/actions";
import { UploadFinanceModal } from "@/components/billing/upload-finance-modal";
import { VendorsView } from "@/components/billing/vendors-view";
import { LedgerTable } from "@/components/billing/ledger-table";
import { CashflowView } from "@/components/financials/cashflow-view";
import type { LedgerEntry } from "@/lib/finance-ledger";
import type { CashflowResult } from "@/lib/billing/cashflow";

type InvoiceRow = {
  id: string;
  number: string;
  company: string;
  amount: number;
  dueAt: string;
  status: "draft" | "sent" | "paid" | "overdue";
};
type BillRow = {
  id: string;
  vendor: string;
  number: string | null;
  amount: number;
  origCurrency?: string | null;
  origAmount?: number | null;
  dueAt: string | null;
  paidAt: string | null;
  status: BillStatus;
  category: ExpenseCategory | null;
  hasDoc: boolean;
  driveUrl: string | null;
  linked?: boolean; // settled by a contractor payout — tracked via that payout, not as vendor AP
};
type ExpenseRow = {
  id: string;
  vendor: string | null;
  description: string | null;
  category: ExpenseCategory;
  kind: ExpenseKind;
  amount: number;
  origCurrency?: string | null;
  origAmount?: number | null;
  status: ExpenseStatus;
  spentAt: string;
  needsPhoto: boolean;
  driveUrl: string | null;
  paidByName: string | null;
  recurring?: boolean;
  renewalDate?: string | null;
};

export type ApArProps = {
  invoices: InvoiceRow[];
  bills: BillRow[];
  expenses: ExpenseRow[];
  consultants: { id: string; name: string }[]; // the people roster — reimburse "Paid by"
  clients: { id: string; company: string }[];
  projects: { id: string; name: string }[];
};

const cad = (n: number) => formatCAD(n).replace("CA$", "$");

type FinTab = "overview" | "cashflow" | "ledger" | "apar" | "vendors";

export function FinancialsTabs({
  canSeeApAr,
  canManageVendors,
  apAr,
  ledger,
  cashflow,
  hasOpening,
  cashStrip,
  children,
}: {
  canSeeApAr: boolean;
  canManageVendors: boolean;
  apAr: ApArProps | null;
  ledger: LedgerEntry[] | null;
  cashflow: CashflowResult | null;
  hasOpening: boolean;
  cashStrip?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState<FinTab>("overview");
  const tabs = [{ key: "overview", label: "Overview" }];
  if (cashflow) tabs.push({ key: "cashflow", label: "Cashflow" });
  if (ledger) tabs.push({ key: "ledger", label: "Ledger" });
  if (canSeeApAr) tabs.push({ key: "apar", label: "AP / AR" });
  if (canManageVendors) tabs.push({ key: "vendors", label: "Vendors" });

  return (
    <>
      {/* Persistent cash-position strip (MP-only; the page passes null otherwise). */}
      {cashStrip && <div className="px-8 pt-6">{cashStrip}</div>}
      <div className="px-8 pt-5 border-b border-graphite">
        <Tabs tabs={tabs} active={tab} onChange={(k) => setTab(k as FinTab)} />
      </div>
      <div className={tab === "overview" ? "" : "hidden"}>{children}</div>
      {cashflow && tab === "cashflow" && (
        <CashflowView weekly={cashflow.weekly} monthly={cashflow.monthly} items={cashflow.items} hasOpening={hasOpening} />
      )}
      {ledger && tab === "ledger" && <LedgerTable entries={ledger} />}
      {canSeeApAr && apAr && tab === "apar" && <ApArView {...apAr} />}
      {canManageVendors && tab === "vendors" && <VendorsView />}
    </>
  );
}

function ApArView({ invoices, bills, expenses, consultants, clients, projects }: ApArProps) {
  const router = useRouter();
  const [pendingId, startPaid] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  // A bill linked to a contractor payout is that payout's paperwork (paid via the
  // payout flow, deduped on the Ledger) — keep it out of vendor Payable so the AP
  // figure and the Ledger's money-out never double-count the same dollars.
  const outstandingBills = bills.filter((b) => (b.status === "received" || b.status === "approved") && !b.linked);
  const paidBillsCount = bills.filter((b) => b.status === "paid").length;
  // Subscriptions get their own card so recurring SaaS/phone/office spend is
  // visible at a glance; the Expenses card shows everything else.
  const subscriptions = expenses.filter((e) => e.kind === "subscription");
  const otherExpenses = expenses.filter((e) => e.kind !== "subscription");

  const totals = useMemo(() => {
    const ar = invoices.reduce((s, i) => s + i.amount, 0);
    const ap = outstandingBills.reduce((s, b) => s + b.amount, 0);
    const now = new Date();
    const mtd = expenses
      .filter((e) => {
        const d = new Date(e.spentAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((s, e) => s + e.amount, 0);
    const owed = expenses
      .filter((e) => e.kind === "reimbursable" && e.status !== "reimbursed" && e.status !== "paid")
      .reduce((s, e) => s + e.amount, 0);
    return { ar, ap, net: ar - ap, mtd, owed };
  }, [invoices, outstandingBills, expenses]);

  // Aging buckets for AR (invoices) and AP (outstanding bills).
  const aging = useMemo(() => {
    const empty = (): Record<AgingBucket, number> => ({ current: 0, d30: 0, d60: 0, d90: 0 });
    const ar = empty();
    const ap = empty();
    for (const i of invoices) ar[agingBucket(i.dueAt)] += i.amount;
    for (const b of outstandingBills) ap[agingBucket(b.dueAt)] += b.amount;
    return { ar, ap };
  }, [invoices, outstandingBills]);

  function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    startPaid(async () => {
      try {
        await fn();
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  }

  // Pull the full ledger as CSV and download it (no server file — a Blob link).
  async function onExport() {
    setExporting(true);
    try {
      const { filename, csv } = await exportLedgerCsv();
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const buckets: AgingBucket[] = ["current", "d30", "d60", "d90"];

  return (
    <div className="px-8 py-8 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-4 gap-4 flex-1">
          <Card className="p-5"><Stat label="Outstanding AR" value={cad(totals.ar)} delta={`${invoices.length} invoices · money in`} /></Card>
          <Card className="p-5"><Stat label="Outstanding AP" value={cad(totals.ap)} delta={`${outstandingBills.length} vendor bills to pay`} /></Card>
          <Card className="p-5"><Stat label="Net position" value={cad(totals.net)} delta="AR − AP" gold={totals.net >= 0} /></Card>
          <Card className="p-5"><Stat label="Expenses · MTD" value={cad(totals.mtd)} delta={totals.owed > 0 ? `${cad(totals.owed)} owed to team` : "this month"} /></Card>
        </div>
        <div className="pl-4 self-start flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onExport} disabled={exporting}>
            <Download size={14} strokeWidth={1.5} />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
          <Button variant="primary" size="sm" onClick={() => setModal(true)}>
            <Plus size={14} strokeWidth={1.5} />
            Upload Expense / Invoice / Receipt
          </Button>
        </div>
      </div>

      {/* Aging — AR & AP by how overdue they are */}
      <Card>
        <div className="px-5 pt-4 pb-2">
          <h2 className="title-md">Aging</h2>
        </div>
        <div className="grid grid-cols-[80px_repeat(4,1fr)] gap-3 px-5 py-2">
          <span className="text-[11px] text-bone-dim" />
          {buckets.map((b) => (
            <span key={b} className="text-[11px] text-bone-dim text-right">{AGING_LABELS[b]}</span>
          ))}
        </div>
        {(["ar", "ap"] as const).map((side) => (
          <div key={side} className="grid grid-cols-[80px_repeat(4,1fr)] gap-3 px-5 py-3 border-t border-graphite/40">
            <span className="text-[12px] text-bone self-center">{side.toUpperCase()}</span>
            {buckets.map((b) => {
              const v = aging[side][b];
              const danger = (b === "d60" || b === "d90") && v > 0;
              return (
                <span key={b} className={`mono text-[13px] tabular-nums text-right self-center ${danger ? "text-flag-red" : v > 0 ? "text-bone-dim" : "text-bone-mute"}`}>
                  {cad(v)}
                </span>
              );
            })}
          </div>
        ))}
      </Card>

      {/* Receivable — invoices we've sent, waiting on payment */}
      <Card>
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h2 className="title-md">Receivable — money in</h2>
          <span className="label">{invoices.length} outstanding</span>
        </div>
        {invoices.length === 0 ? (
          <div className="px-5 py-8 text-[13px] text-bone-mute">No outstanding invoices.</div>
        ) : (
          <>
            <LedgerHead left="Client" mid="Invoice" />
            {invoices.map((i) => {
              const overdueDays = i.status === "overdue" ? daysSince(i.dueAt) : 0;
              return (
                <div key={i.id} className="grid grid-cols-[1.4fr_120px_120px_120px_140px] gap-4 px-5 py-3.5 border-t border-graphite/40 items-center">
                  <span className="text-[13px] text-bone truncate">{i.company}</span>
                  <span className="mono text-[12px] text-bone-dim self-center">{i.number}</span>
                  <span className="mono text-[14px] text-track-gold tabular-nums text-right">{cad(i.amount)}</span>
                  <span className={`mono text-[12px] tabular-nums text-right ${overdueDays > 0 ? "text-flag-red" : "text-bone-dim"}`}>
                    {formatDate(i.dueAt)}{overdueDays > 0 && ` (${overdueDays}d)`}
                  </span>
                  <div className="flex justify-end">
                    <Button variant="secondary" size="sm" disabled={pendingId} onClick={() => run(`inv-${i.id}`, () => markInvoicePaid(i.id))}>
                      {busy === `inv-${i.id}` ? "…" : "Mark paid"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </Card>

      {/* Payable — vendor bills we still owe (paid bills drop off; they're in Drive + audit) */}
      <Card>
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h2 className="title-md">Payable — money out</h2>
          <span className="label">
            {outstandingBills.length} to pay{paidBillsCount > 0 ? ` · ${paidBillsCount} paid` : ""}
          </span>
        </div>
        {outstandingBills.length === 0 ? (
          <div className="px-5 py-8 text-[13px] text-bone-mute">Nothing to pay. Use “Upload” to add a vendor invoice.</div>
        ) : (
          <>
            <LedgerHead left="Vendor" mid="Number" />
            {outstandingBills.map((b) => {
              const overdueDays = b.dueAt ? daysSince(b.dueAt) : 0;
              return (
                <div key={b.id} className="grid grid-cols-[1.4fr_120px_120px_120px_140px] gap-4 px-5 py-3.5 border-t border-graphite/40 items-center">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] text-bone truncate">{b.vendor}</span>
                    {b.driveUrl && (
                      <a href={b.driveUrl} target="_blank" rel="noreferrer" className="text-bone-mute hover:text-track-gold shrink-0" title="Open document">
                        <ExternalLink size={12} strokeWidth={1.5} />
                      </a>
                    )}
                  </span>
                  <span className="mono text-[12px] text-bone-dim self-center truncate">{b.number ?? "—"}</span>
                  <span className="flex flex-col items-end leading-tight text-right">
                    <span className="mono text-[14px] text-bone tabular-nums">{cad(b.amount)}</span>
                    {b.origCurrency && b.origAmount != null && <span className="mono text-[10px] text-bone-mute">{b.origCurrency} {b.origAmount}</span>}
                  </span>
                  <span className={`mono text-[12px] tabular-nums text-right ${overdueDays > 0 ? "text-flag-red" : "text-bone-dim"}`}>
                    {b.dueAt ? formatDate(b.dueAt) : "—"}{overdueDays > 0 && ` (${overdueDays}d)`}
                  </span>
                  <div className="flex justify-end">
                    <Button variant="secondary" size="sm" disabled={pendingId} onClick={() => run(`bill-${b.id}`, () => markBillPaid(b.id))}>
                      {busy === `bill-${b.id}` ? "…" : "Mark paid"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </Card>

      {/* Subscriptions — recurring SaaS / phone / office */}
      {subscriptions.length > 0 && (
        <Card>
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <h2 className="title-md flex items-center gap-2"><Repeat size={14} strokeWidth={1.5} className="text-track-gold" /> Subscriptions</h2>
            <span className="label">{subscriptions.length} · {cad(subscriptions.reduce((s, e) => s + e.amount, 0))} logged</span>
          </div>
          <div className="grid grid-cols-[1.4fr_160px_120px_120px_140px] gap-4 px-5 py-2">
            <span className="text-[11px] text-bone-dim">Service</span>
            <span className="text-[11px] text-bone-dim">Category</span>
            <span className="text-[11px] text-bone-dim text-right">Amount</span>
            <span className="text-[11px] text-bone-dim text-right">Renews</span>
            <span className="text-[11px] text-bone-dim text-right">Status</span>
          </div>
          {subscriptions.map((e) => (
            <div key={e.id} className="grid grid-cols-[1.4fr_160px_120px_120px_140px] gap-4 px-5 py-3.5 border-t border-graphite/40 items-center">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-[13px] text-bone truncate">{e.vendor ?? EXPENSE_CATEGORY_LABELS[e.category]}</span>
                  {e.driveUrl && (
                    <a href={e.driveUrl} target="_blank" rel="noreferrer" className="text-bone-mute hover:text-track-gold shrink-0" title="Open receipt">
                      <ExternalLink size={12} strokeWidth={1.5} />
                    </a>
                  )}
                </span>
                {e.description && <span className="text-[11px] text-bone-mute truncate">{e.description}</span>}
              </div>
              <span className="text-[12px] text-bone-dim self-center truncate">{EXPENSE_CATEGORY_LABELS[e.category]}</span>
              <span className="flex flex-col items-end leading-tight text-right">
                <span className="mono text-[14px] text-bone tabular-nums">{cad(e.amount)}</span>
                {e.origCurrency && e.origAmount != null && <span className="mono text-[10px] text-bone-mute">{e.origCurrency} {e.origAmount}</span>}
              </span>
              <span className="mono text-[12px] text-bone-dim tabular-nums text-right">{e.renewalDate ? formatDate(e.renewalDate) : "—"}</span>
              <div className="flex justify-end">
                <Badge tone={e.status === "paid" || e.status === "reimbursed" ? "steel" : "neutral"}>{EXPENSE_STATUS_LABELS[e.status]}</Badge>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Expenses — receipts (subscriptions are in their own card above) */}
      <Card>
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h2 className="title-md">Expenses</h2>
          <span className="label">{otherExpenses.length} total{totals.owed > 0 ? ` · ${cad(totals.owed)} owed` : ""}</span>
        </div>
        {otherExpenses.length === 0 ? (
          <EmptyState icon={<FileWarning size={26} strokeWidth={1.5} />} title="No expenses yet" hint="Upload a receipt or log an expense to start tracking spend by category." compact />
        ) : (
          <>
            <div className="grid grid-cols-[1.4fr_160px_120px_120px_140px] gap-4 px-5 py-2">
              <span className="text-[11px] text-bone-dim">Vendor</span>
              <span className="text-[11px] text-bone-dim">Category</span>
              <span className="text-[11px] text-bone-dim text-right">Amount</span>
              <span className="text-[11px] text-bone-dim text-right">Date</span>
              <span className="text-[11px] text-bone-dim text-right">Status</span>
            </div>
            {otherExpenses.map((e) => {
              const settled = e.status === "reimbursed" || e.status === "paid";
              const tone = settled ? "steel" : e.status === "approved" ? "gold" : "neutral";
              return (
                <div key={e.id} className="grid grid-cols-[1.4fr_160px_120px_120px_140px] gap-4 px-5 py-3.5 border-t border-graphite/40 items-center">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] text-bone truncate">{e.vendor ?? EXPENSE_CATEGORY_LABELS[e.category]}</span>
                      {e.needsPhoto && <Badge tone="red">needs photo</Badge>}
                      {e.driveUrl && (
                        <a href={e.driveUrl} target="_blank" rel="noreferrer" className="text-bone-mute hover:text-track-gold shrink-0" title="Open receipt">
                          <ExternalLink size={12} strokeWidth={1.5} />
                        </a>
                      )}
                    </span>
                    {e.kind === "reimbursable" && e.paidByName && <span className="text-[11px] text-track-gold truncate">Owed to {e.paidByName}</span>}
                    {e.description && <span className="text-[11px] text-bone-mute truncate">{e.description}</span>}
                  </div>
                  <span className="text-[12px] text-bone-dim self-center truncate">{EXPENSE_CATEGORY_LABELS[e.category]}</span>
                  <span className="flex flex-col items-end leading-tight text-right">
                    <span className="mono text-[14px] text-bone tabular-nums">{cad(e.amount)}</span>
                    {e.origCurrency && e.origAmount != null && <span className="mono text-[10px] text-bone-mute">{e.origCurrency} {e.origAmount}</span>}
                  </span>
                  <span className="mono text-[12px] text-bone-dim tabular-nums text-right">{formatDate(e.spentAt)}</span>
                  <div className="flex justify-end items-center gap-2">
                    {settled ? (
                      <Badge tone={tone}>{EXPENSE_STATUS_LABELS[e.status]}</Badge>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={pendingId}
                        onClick={() =>
                          run(`exp-${e.id}`, () =>
                            e.kind === "reimbursable" ? markExpenseReimbursed(e.id) : markExpensePaid(e.id),
                          )
                        }
                      >
                        {busy === `exp-${e.id}` ? "…" : e.kind === "reimbursable" ? "Reimburse" : "Mark paid"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </Card>

      {modal && (
        <UploadFinanceModal
          consultants={consultants}
          clients={clients}
          projects={projects}
          onClose={() => setModal(false)}
          onSaved={() => {
            setModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function LedgerHead({ left, mid }: { left: string; mid: string }) {
  return (
    <div className="grid grid-cols-[1.4fr_120px_120px_120px_140px] gap-4 px-5 py-2">
      <span className="text-[11px] text-bone-dim">{left}</span>
      <span className="text-[11px] text-bone-dim">{mid}</span>
      <span className="text-[11px] text-bone-dim text-right">Amount</span>
      <span className="text-[11px] text-bone-dim text-right">Due</span>
      <span className="text-[11px] text-bone-dim text-right">Action</span>
    </div>
  );
}
