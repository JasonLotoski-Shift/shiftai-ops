// Firm-wide deal-source commission flow-through (server-safe presentational).
// The one-time build slice (payable now) + recurring buckets (projected / accrued
// / paid via effective status), with the partner-vs-external-payee split. Firm
// money — mounted only behind the managing-partner gate on /financials.

import { Card, Stat, Badge } from "@/components/ui";
import { formatCAD } from "@/lib/format";

const cad = (n: number) => formatCAD(n).replace("CA$", "$");

export type CommissionFlowRow = {
  label: string; // engagement / project name
  recipient: string;
  isExternal: boolean;
  buildAmount: number;
  recurringPerMonth: number;
  coveredMonths: number;
};

export function CommissionSummary({
  buildTotal,
  recurringProjected,
  recurringAccrued,
  recurringPaid,
  partnerShare,
  externalShare,
  rows,
}: {
  buildTotal: number;
  recurringProjected: number;
  recurringAccrued: number;
  recurringPaid: number;
  partnerShare: number;
  externalShare: number;
  rows: CommissionFlowRow[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-5">
          <Stat label="Build commission" value={cad(buildTotal)} delta="payable now" />
        </Card>
        <Card className="p-5">
          <Stat label="Recurring earned" value={cad(recurringAccrued + recurringPaid)} delta={`${cad(recurringPaid)} paid`} gold />
        </Card>
        <Card className="p-5">
          <Stat label="Recurring projected" value={cad(recurringProjected)} delta="future months" />
        </Card>
      </div>
      <Card>
        <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-3">
          <h2 className="title-md">Deal-source commission</h2>
          <span className="label">
            Partners {cad(partnerShare)} · External {cad(externalShare)}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 pb-4 text-[12px] text-bone-mute">No deal-source commission recorded yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-[1.4fr_1fr_110px_110px_80px] gap-3 px-5 py-2">
              <span className="text-[11px] text-bone-dim">Engagement</span>
              <span className="text-[11px] text-bone-dim">Recipient</span>
              <span className="text-[11px] text-bone-dim text-right">Build</span>
              <span className="text-[11px] text-bone-dim text-right">Per month</span>
              <span className="text-[11px] text-bone-dim text-right">Months</span>
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1.4fr_1fr_110px_110px_80px] gap-3 px-5 py-2.5 border-t border-graphite/40 items-center">
                <span className="text-[13px] text-bone truncate">{r.label}</span>
                <span className="text-[12px] text-bone-dim truncate flex items-center gap-1.5">
                  {r.recipient}
                  {r.isExternal && <Badge tone="neutral">external</Badge>}
                </span>
                <span className="mono text-[13px] text-bone tabular-nums text-right">{r.buildAmount ? cad(r.buildAmount) : "—"}</span>
                <span className="mono text-[13px] text-track-gold tabular-nums text-right">{r.recurringPerMonth ? cad(r.recurringPerMonth) : "—"}</span>
                <span className="mono text-[12px] text-bone-mute tabular-nums text-right">{r.coveredMonths || "—"}</span>
              </div>
            ))}
          </>
        )}
      </Card>
    </div>
  );
}
