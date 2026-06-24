// Per-partner economics (server-safe presentational). Take-home owed/paid (from
// ConsultantPayout), origination earnings, and deal-source commission, one row
// per partner + a firm-total footer. The most sensitive money view — mounted only
// inside the managing-partner-gated /financials/partners sub-route.

import { Card } from "@/components/ui";
import { formatCAD } from "@/lib/format";

const cad = (n: number) => formatCAD(n).replace("CA$", "$");

export type PartnerEconomicsRow = {
  partnerId: string;
  partnerName: string;
  takeHomeOwed: number;
  takeHomePaid: number;
  originationEarned: number;
  commissionBuildEarned: number;
  commissionRecurring: number;
  totalEarned: number;
};

const GRID = "grid grid-cols-[1.2fr_110px_100px_110px_110px_120px] gap-3 px-5";

export function PartnerEconomicsTable({ rows }: { rows: PartnerEconomicsRow[] }) {
  const sum = (f: (r: PartnerEconomicsRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  return (
    <Card>
      <div className="px-5 pt-4 pb-2">
        <h2 className="title-md">Per-partner economics</h2>
      </div>
      <div className={`${GRID} py-2`}>
        <span className="text-[11px] text-bone-dim">Partner</span>
        <span className="text-[11px] text-bone-dim text-right">Take-home owed</span>
        <span className="text-[11px] text-bone-dim text-right">Paid</span>
        <span className="text-[11px] text-bone-dim text-right">Origination</span>
        <span className="text-[11px] text-bone-dim text-right">Commission</span>
        <span className="text-[11px] text-bone-dim text-right">Total earned</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-4 text-[12px] text-bone-mute">No partner economics yet.</p>
      ) : (
        rows.map((r) => (
          <div key={r.partnerId} className={`${GRID} py-2.5 border-t border-graphite/40 items-center`}>
            <span className="text-[13px] text-bone truncate">{r.partnerName}</span>
            <span className="mono text-[13px] text-bone-dim tabular-nums text-right">{cad(r.takeHomeOwed)}</span>
            <span className={`mono text-[13px] tabular-nums text-right ${r.takeHomePaid > 0 ? "text-signal-fresh" : "text-bone-mute"}`}>
              {cad(r.takeHomePaid)}
            </span>
            <span className="mono text-[13px] text-bone-dim tabular-nums text-right">{cad(r.originationEarned)}</span>
            <span className="mono text-[13px] text-track-gold tabular-nums text-right">{cad(r.commissionBuildEarned + r.commissionRecurring)}</span>
            <span className="mono text-[13px] text-bone tabular-nums text-right">{cad(r.totalEarned)}</span>
          </div>
        ))
      )}
      {rows.length > 0 && (
        <div className={`${GRID} py-2.5 border-t border-graphite`}>
          <span className="text-[12px] text-bone-dim">Firm total</span>
          <span className="mono text-[13px] text-bone-dim tabular-nums text-right">{cad(sum((r) => r.takeHomeOwed))}</span>
          <span className="mono text-[13px] text-bone-dim tabular-nums text-right">{cad(sum((r) => r.takeHomePaid))}</span>
          <span className="mono text-[13px] text-bone-dim tabular-nums text-right">{cad(sum((r) => r.originationEarned))}</span>
          <span className="mono text-[13px] text-track-gold tabular-nums text-right">{cad(sum((r) => r.commissionBuildEarned + r.commissionRecurring))}</span>
          <span className="mono text-[13px] text-bone tabular-nums text-right">{cad(sum((r) => r.totalEarned))}</span>
        </div>
      )}
    </Card>
  );
}
