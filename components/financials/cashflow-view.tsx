"use client";

// Phase 2 — the Money-home Cashflow lens (rebuild §3.2). The one ledger seen as a
// forward cash projection: period rows (13-week weekly default, 12-month toggle)
// with Opening | In | Out | Net | Closing, the closing seeding the next opening,
// negative periods flagged red, a closing-balance bar chart above, and the
// due-in-window worklist (every committed obligation in the horizon, by date).
// Committed-only — weighted pipeline is a later opt-in. Reads OLD data via the
// cashflow engine; mutates nothing.

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui";
import { formatCAD, formatDate } from "@/lib/format";
import type { CashLensMode, CashPeriod, ExpectedCashItem, CashItemKind } from "@/lib/billing/cashflow";

const cad = (n: number) => formatCAD(n).replace("CA$", "$");
const cadSigned = (n: number) => (n < 0 ? `-${cad(-n)}` : cad(n));

const KIND_LABELS: Record<CashItemKind, string> = {
  installment: "Installment",
  invoice: "Invoice",
  contract: "Recurring fee",
  bill: "Bill",
  payout: "Payout",
  reimbursement: "Reimbursement",
  subscription: "Subscription",
  commission: "Commission",
};

export function CashflowView({
  weekly,
  monthly,
  items,
  hasOpening,
}: {
  weekly: CashPeriod[];
  monthly: CashPeriod[];
  items: ExpectedCashItem[];
  hasOpening: boolean;
}) {
  const [mode, setMode] = useState<CashLensMode>("weekly");
  const periods = mode === "weekly" ? weekly : monthly;

  // Closing-balance bars: baseline at 0, scaled by the largest magnitude so a dip
  // below zero is obvious. When no opening is set, closings are seeded at 0 and the
  // bars read as cumulative net (the banner says so).
  const maxMag = Math.max(1, ...periods.map((p) => Math.abs(p.closing)));

  return (
    <div className="px-8 py-8 flex flex-col gap-8">
      <Card className="p-5 flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 className="title-md">Cashflow</h2>
            <span className="text-[11px] text-bone-mute">
              Committed money in and out, period by period. Closing carries into the next opening.
            </span>
          </div>
          <div className="flex items-center gap-1 rounded-[var(--radius)] bg-asphalt p-0.5">
            {(["weekly", "monthly"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 h-7 rounded-[var(--radius)] text-[12px] transition-colors ${
                  mode === m ? "bg-graphite text-bone" : "text-bone-mute hover:text-bone"
                }`}
              >
                {m === "weekly" ? "13 weeks" : "12 months"}
              </button>
            ))}
          </div>
        </div>

        {!hasOpening && (
          <div className="rounded-[var(--radius)] border border-graphite/60 bg-asphalt/40 px-4 py-2.5 text-[12px] text-bone-mute">
            No opening balance set. Opening and closing read from zero, so the bars show cumulative net. Set the cash
            balance above to see true running balances.
          </div>
        )}

        {/* Closing-balance bars */}
        <div className="flex items-end gap-1 h-28 border-b border-graphite/50">
          {periods.map((p) => {
            const h = Math.round((Math.abs(p.closing) / maxMag) * 100);
            return (
              <div key={p.key} className="flex-1 flex flex-col justify-end items-center h-full" title={`${p.label}: ${cad(p.closing)}`}>
                <div
                  className={`w-full rounded-sm ${p.negative ? "bg-flag-red/70" : "bg-track-gold/60"}`}
                  style={{ height: `${Math.max(2, h)}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* Period table */}
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-[1.2fr_repeat(5,1fr)] gap-3 px-1 py-2">
              <span className="text-[11px] text-bone-dim">Period</span>
              <span className="text-[11px] text-bone-dim text-right">Opening</span>
              <span className="text-[11px] text-bone-dim text-right">In</span>
              <span className="text-[11px] text-bone-dim text-right">Out</span>
              <span className="text-[11px] text-bone-dim text-right">Net</span>
              <span className="text-[11px] text-bone-dim text-right">Closing</span>
            </div>
            {periods.map((p) => (
              <div
                key={p.key}
                className="grid grid-cols-[1.2fr_repeat(5,1fr)] gap-3 px-1 py-2.5 border-t border-graphite/40 items-center"
              >
                <span className="text-[12px] text-bone">{p.label}</span>
                <span className="mono text-[12px] text-bone-dim tabular-nums text-right">{cad(p.opening)}</span>
                <span className={`mono text-[12px] tabular-nums text-right ${p.cashIn > 0 ? "text-signal-fresh" : "text-bone-mute"}`}>
                  {p.cashIn > 0 ? cad(p.cashIn) : "—"}
                </span>
                <span className={`mono text-[12px] tabular-nums text-right ${p.cashOut > 0 ? "text-bone-dim" : "text-bone-mute"}`}>
                  {p.cashOut > 0 ? cad(p.cashOut) : "—"}
                </span>
                <span className={`mono text-[12px] tabular-nums text-right ${p.net < 0 ? "text-flag-red" : "text-bone-dim"}`}>
                  {cadSigned(p.net)}
                </span>
                <span className={`mono text-[13px] tabular-nums text-right ${p.negative ? "text-flag-red" : "text-bone"}`}>
                  {cadSigned(p.closing)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Due-in-window worklist */}
      <Card>
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h2 className="title-md">Due in window</h2>
          <span className="label">{items.length} obligations</span>
        </div>
        {items.length === 0 ? (
          <div className="px-5 py-8 text-[13px] text-bone-mute">Nothing committed in the next 12 months.</div>
        ) : (
          <>
            <div className="grid grid-cols-[110px_120px_1fr_130px] gap-4 px-5 py-2">
              <span className="text-[11px] text-bone-dim">Date</span>
              <span className="text-[11px] text-bone-dim">Type</span>
              <span className="text-[11px] text-bone-dim">Detail</span>
              <span className="text-[11px] text-bone-dim text-right">Amount</span>
            </div>
            {items.map((it) => (
              <div key={it.id} className="grid grid-cols-[110px_120px_1fr_130px] gap-4 px-5 py-3 border-t border-graphite/40 items-center">
                <span className={`mono text-[12px] tabular-nums ${it.overdue ? "text-flag-red" : "text-bone-dim"}`}>
                  {it.undated ? "undated" : formatDate(it.date)}
                </span>
                <span className="text-[12px] text-bone-mute">{KIND_LABELS[it.kind]}</span>
                <span className="text-[13px] text-bone truncate">
                  {it.label}
                  {it.party && <span className="text-bone-mute"> · {it.party}</span>}
                  {it.overdue && <span className="text-flag-red"> · overdue</span>}
                </span>
                <span
                  className={`mono text-[13px] tabular-nums text-right inline-flex items-center justify-end gap-1 ${
                    it.direction === "in" ? "text-signal-fresh" : "text-bone-dim"
                  }`}
                >
                  {it.direction === "in" ? <ArrowUpRight size={12} strokeWidth={1.5} /> : <ArrowDownRight size={12} strokeWidth={1.5} />}
                  {cad(it.amount)}
                </span>
              </div>
            ))}
          </>
        )}
      </Card>
    </div>
  );
}
