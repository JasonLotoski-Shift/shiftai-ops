"use client";

// The Financials "Ledger" (GL) tab — one table over every money movement:
// invoices in, plus bills / expenses / contractor payouts out. Reads the pure
// lib/finance-ledger normalizer; all filtering and grouping is client-side over
// the prefetched array. Managing-partners only (gated where it's mounted).
//
// PHASE 1: contractor payouts now appear in Financials (they used to live only on
// the project page). The header keeps payouts and bills/expenses as SEPARATE
// figures — they are never blended into one money-out number, because a payout
// and the invoice that documents it can be the same dollars until the Phase 2
// link exists. Probable payout<->bill matches show an "≈ pair" chip; the matched
// bill is dropped from group subtotals (visibly), never from a header total.

import { useMemo, useState } from "react";
import { ExternalLink, Download, ShieldAlert } from "lucide-react";
import { Card, Stat, Badge, Button, Select, SearchInput, EmptyState } from "@/components/ui";
import { formatCAD, formatDate } from "@/lib/format";
import { fxNote } from "@/lib/finance";
import {
  filterLedger,
  groupLedger,
  ledgerTotals,
  isMissingDoc,
  LEDGER_TYPE_LABELS,
  type LedgerEntry,
  type LedgerSourceType,
  type LedgerDirection,
  type LedgerStatusFilter,
  type LedgerGroupBy,
} from "@/lib/finance-ledger";
import { exportLedgerCsv } from "@/app/(app)/financials/finance-actions";

const cad = (n: number) => formatCAD(n).replace("CA$", "$");
const COLS =
  "grid grid-cols-[104px_84px_minmax(0,1.6fr)_minmax(0,1.1fr)_140px_104px_76px] gap-3 px-5";

export function LedgerTable({ entries }: { entries: LedgerEntry[] }) {
  const [text, setText] = useState("");
  const [type, setType] = useState<LedgerSourceType | "all">("all");
  const [direction, setDirection] = useState<LedgerDirection | "all">("all");
  const [status, setStatus] = useState<LedgerStatusFilter>("all");
  const [missingOnly, setMissingOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<LedgerGroupBy>("none");
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(
    () => filterLedger(entries, { text, type, direction, status, missingDocOnly: missingOnly }),
    [entries, text, type, direction, status, missingOnly],
  );
  const totals = useMemo(() => ledgerTotals(filtered), [filtered]);
  const groups = useMemo(() => groupLedger(filtered, groupBy), [filtered, groupBy]);
  // The compliance worklist is always the FULL picture, not the filtered view.
  const exceptions = useMemo(
    () => entries.filter(isMissingDoc).sort((a, b) => b.amountCad - a.amountCad),
    [entries],
  );

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

  return (
    <div className="px-8 py-8 flex flex-col gap-8">
      {/* KPIs — payouts and bills are SEPARATE, never one blended money-out total */}
      <div className="flex items-start justify-between gap-4">
        <div className="grid grid-cols-4 gap-4 flex-1">
          <Card className="p-5"><Stat label="Received" value={cad(totals.receivedIn)} delta={`${cad(totals.invoicedIn)} invoiced · money in`} gold /></Card>
          <Card className="p-5"><Stat label="Contractor payouts" value={cad(totals.payoutsPaid)} delta={totals.payoutsOwed > 0 ? `${cad(totals.payoutsOwed)} owed` : "paid out"} /></Card>
          <Card className="p-5"><Stat label="Bills & expenses" value={cad(totals.billsExpensesPaid)} delta={totals.billsExpensesOutstanding > 0 ? `${cad(totals.billsExpensesOutstanding)} unpaid` : "paid"} /></Card>
          <Card className="p-5"><Stat label="Missing documents" value={String(totals.missingDocCount)} delta={totals.missingDocExposure > 0 ? `${cad(totals.missingDocExposure)} unbacked` : "all on file"} /></Card>
        </div>
        <Button variant="secondary" size="sm" onClick={onExport} disabled={exporting} className="self-start mt-1">
          <Download size={14} strokeWidth={1.5} />
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      {/* Exceptions — every payment should have an invoice/receipt; these don't */}
      {exceptions.length > 0 && (
        <Card>
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <h2 className="title-md flex items-center gap-2">
              <ShieldAlert size={15} strokeWidth={1.5} className="text-flag-red" />
              Needs a document
            </h2>
            <span className="label">{exceptions.length} flagged · {cad(exceptions.reduce((s, e) => s + e.amountCad, 0))}</span>
          </div>
          <div className="px-5 pb-2 text-[12px] text-bone-dim leading-relaxed">
            Money that left without an invoice or receipt on file. File the document (bills and expenses via Upload on the AP / AR tab), or link a contractor payout to its invoice (lands in Phase 2).
          </div>
          {exceptions.slice(0, 10).map((e) => (
            <div key={e.id} className="grid grid-cols-[84px_minmax(0,1.6fr)_minmax(0,1fr)_130px] gap-3 px-5 py-3 border-t border-graphite/40 items-center">
              <Badge tone="neutral">{LEDGER_TYPE_LABELS[e.sourceType]}</Badge>
              <span className="text-[13px] text-bone truncate">{e.party.name}</span>
              <span className="text-[12px] text-bone-mute truncate">{e.projectName ?? "Firm / unassigned"}</span>
              <span className="mono text-[13px] text-bone tabular-nums text-right">{cad(e.amountCad)}</span>
            </div>
          ))}
          {exceptions.length > 10 && (
            <div className="px-5 py-2.5 border-t border-graphite/40 text-[12px] text-bone-mute">
              + {exceptions.length - 10} more · use the “Missing docs” filter below to see all
            </div>
          )}
        </Card>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-[240px]">
          <SearchInput placeholder="Search party, number, project…" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="w-[150px]">
          <Select value={type} onChange={(e) => setType(e.target.value as LedgerSourceType | "all")}>
            <option value="all">All types</option>
            <option value="invoice">Invoices</option>
            <option value="bill">Bills</option>
            <option value="expense">Expenses</option>
            <option value="payout">Payouts</option>
          </Select>
        </div>
        <div className="w-[140px]">
          <Select value={direction} onChange={(e) => setDirection(e.target.value as LedgerDirection | "all")}>
            <option value="all">In &amp; out</option>
            <option value="in">Money in</option>
            <option value="out">Money out</option>
          </Select>
        </div>
        <div className="w-[130px]">
          <Select value={status} onChange={(e) => setStatus(e.target.value as LedgerStatusFilter)}>
            <option value="all">Any status</option>
            <option value="paid">Settled</option>
            <option value="unpaid">Outstanding</option>
          </Select>
        </div>
        <Button variant={missingOnly ? "primary" : "secondary"} size="sm" onClick={() => setMissingOnly((v) => !v)}>
          Missing docs
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <span className="label">Group</span>
          <div className="w-[140px]">
            <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value as LedgerGroupBy)}>
              <option value="none">None</option>
              <option value="project">Project</option>
              <option value="entity">Entity</option>
              <option value="month">Month</option>
            </Select>
          </div>
        </div>
      </div>

      {/* The ledger */}
      <Card>
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h2 className="title-md">General ledger</h2>
          <span className="label">{filtered.length} of {entries.length} entries</span>
        </div>
        {filtered.length === 0 ? (
          <EmptyState title="Nothing matches" hint="Clear a filter to see more of the ledger." compact />
        ) : (
          <>
            <div className={`${COLS} py-2`}>
              <span className="text-[11px] text-bone-dim">Date</span>
              <span className="text-[11px] text-bone-dim">Type</span>
              <span className="text-[11px] text-bone-dim">Party</span>
              <span className="text-[11px] text-bone-dim">Project</span>
              <span className="text-[11px] text-bone-dim text-right">Amount</span>
              <span className="text-[11px] text-bone-dim">Status</span>
              <span className="text-[11px] text-bone-dim text-right">Doc</span>
            </div>
            {groups.map((g) => (
              <div key={g.key}>
                {groupBy !== "none" && (
                  <div className="grid grid-cols-[1fr_auto] gap-3 px-5 py-2.5 bg-bitumen/40 border-t border-graphite/40 items-center">
                    <span className="text-[12px] text-bone font-medium truncate flex items-center gap-2">
                      {g.label}
                      {g.missingDocCount > 0 && <Badge tone="red">{g.missingDocCount} missing</Badge>}
                    </span>
                    <span className="mono text-[11px] tabular-nums text-bone-dim">
                      {g.subtotalIn > 0 && <span className="text-signal-fresh">+{cad(g.subtotalIn)} in</span>}
                      {g.subtotalIn > 0 && g.subtotalOut > 0 && " · "}
                      {g.subtotalOut > 0 && <span>−{cad(g.subtotalOut)} out</span>}
                    </span>
                  </div>
                )}
                {g.entries.map((e) => (
                  <LedgerRow key={e.id} e={e} />
                ))}
              </div>
            ))}
          </>
        )}
      </Card>
    </div>
  );
}

function LedgerRow({ e }: { e: LedgerEntry }) {
  const out = e.direction === "out";
  const settled = e.cashMoved;
  const statusTone = settled ? "steel" : e.status === "overdue" ? "red" : "neutral";
  const sub = e.number ?? e.description ?? e.categoryLabel ?? null;
  return (
    <div className={`${COLS} py-3.5 border-t border-graphite/40 items-center`}>
      <span className="mono text-[12px] text-bone-dim tabular-nums">{formatDate(e.date)}</span>
      <span><Badge tone={out ? "neutral" : "gold"}>{LEDGER_TYPE_LABELS[e.sourceType]}</Badge></span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[13px] text-bone truncate">{e.party.name}</span>
        {sub && <span className="text-[11px] text-bone-mute truncate">{sub}</span>}
      </div>
      <span className="text-[12px] text-bone-dim truncate">{e.projectName ?? "—"}</span>
      <span className="flex flex-col items-end leading-tight text-right">
        <span className={`mono text-[14px] tabular-nums ${out ? "text-bone" : "text-signal-fresh"}`}>
          {out ? "−" : "+"}{cad(e.amountCad)}
        </span>
        {e.origCurrency && e.origAmount != null && (
          <span className="mono text-[10px] text-bone-mute">{fxNote(e.origAmount, e.origCurrency)}</span>
        )}
      </span>
      <span><Badge tone={statusTone}>{e.statusLabel}</Badge></span>
      <span className="flex justify-end"><DocCell e={e} /></span>
    </div>
  );
}

function DocCell({ e }: { e: LedgerEntry }) {
  if (e.probablePairId) {
    return (
      <Badge tone="orange" title="Likely matches a contractor payout/bill — confirm the link in Phase 2">
        ≈ pair
      </Badge>
    );
  }
  if (isMissingDoc(e)) return <Badge tone="red">missing</Badge>;
  if (e.driveUrl) {
    return (
      <a href={e.driveUrl} target="_blank" rel="noreferrer" className="text-bone-mute hover:text-track-gold" title="Open document">
        <ExternalLink size={13} strokeWidth={1.5} />
      </a>
    );
  }
  return <span className="text-bone-mute text-[12px]">—</span>;
}
