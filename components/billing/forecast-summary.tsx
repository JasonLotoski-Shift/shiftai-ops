// Forecast summary (server-safe presentational; no "use client"). Pipeline-weighted
// revenue, subscription run-rate (MRR/ARR), and a 12-month projected cash-in
// calendar. Same sensitivity as the firm rollup it sits beside on /financials.

import { Card, Stat } from "@/components/ui";
import { formatCAD } from "@/lib/format";

const cad = (n: number) => formatCAD(n).replace("CA$", "$");

export type PipelineDealRow = { company: string; value: number; weighted: number; probability: number | null };
export type CashRow = { monthLabel: string; installments: number; ongoingFees: number; total: number };

export function ForecastSummary({
  weightedPipeline,
  unweightedCount,
  mrr,
  arr,
  pipelineDeals,
  cashCalendar,
}: {
  weightedPipeline: number;
  unweightedCount: number;
  mrr: number;
  arr: number;
  pipelineDeals: PipelineDealRow[];
  cashCalendar: CashRow[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-5">
          <Stat
            label="Weighted pipeline"
            value={cad(weightedPipeline)}
            delta={unweightedCount > 0 ? `${unweightedCount} unweighted (no probability)` : "value × probability"}
            gold
          />
        </Card>
        <Card className="p-5">
          <Stat label="MRR (run-rate)" value={cad(mrr)} delta="active subscriptions" />
        </Card>
        <Card className="p-5">
          <Stat label="ARR" value={cad(arr)} delta="MRR × 12" />
        </Card>
      </div>

      <Card>
        <div className="px-5 pt-4 pb-2">
          <h2 className="title-md">Weighted pipeline</h2>
        </div>
        {pipelineDeals.length === 0 ? (
          <p className="px-5 pb-4 text-[12px] text-bone-mute">No open deals to forecast.</p>
        ) : (
          <>
            <div className="grid grid-cols-[1.6fr_110px_90px_120px] gap-3 px-5 py-2">
              <span className="text-[11px] text-bone-dim">Deal</span>
              <span className="text-[11px] text-bone-dim text-right">Value</span>
              <span className="text-[11px] text-bone-dim text-right">Prob.</span>
              <span className="text-[11px] text-bone-dim text-right">Weighted</span>
            </div>
            {pipelineDeals.map((d, i) => (
              <div key={i} className="grid grid-cols-[1.6fr_110px_90px_120px] gap-3 px-5 py-2.5 border-t border-graphite/40">
                <span className="text-[13px] text-bone truncate">{d.company}</span>
                <span className="mono text-[13px] text-bone-dim tabular-nums text-right">{cad(d.value)}</span>
                <span className="mono text-[12px] text-bone-mute tabular-nums text-right">{d.probability == null ? "—" : `${d.probability}%`}</span>
                <span className="mono text-[13px] text-track-gold tabular-nums text-right">{cad(d.weighted)}</span>
              </div>
            ))}
          </>
        )}
      </Card>

      <Card>
        <div className="px-5 pt-4 pb-2">
          <h2 className="title-md">Projected cash-in · next 12 months</h2>
        </div>
        <div className="grid grid-cols-[1fr_120px_120px_120px] gap-3 px-5 py-2">
          <span className="text-[11px] text-bone-dim">Month</span>
          <span className="text-[11px] text-bone-dim text-right">Billings</span>
          <span className="text-[11px] text-bone-dim text-right">Ongoing fees</span>
          <span className="text-[11px] text-bone-dim text-right">Total</span>
        </div>
        {cashCalendar.map((m) => (
          <div key={m.monthLabel} className="grid grid-cols-[1fr_120px_120px_120px] gap-3 px-5 py-2 border-t border-graphite/40">
            <span className="text-[13px] text-bone-dim">{m.monthLabel}</span>
            <span className="mono text-[13px] text-bone-dim tabular-nums text-right">{m.installments ? cad(m.installments) : "—"}</span>
            <span className="mono text-[13px] text-bone-dim tabular-nums text-right">{m.ongoingFees ? cad(m.ongoingFees) : "—"}</span>
            <span className={`mono text-[13px] tabular-nums text-right ${m.total > 0 ? "text-signal-fresh" : "text-bone-mute"}`}>
              {m.total ? cad(m.total) : "—"}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}
