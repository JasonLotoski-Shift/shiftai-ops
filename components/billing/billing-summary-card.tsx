// Billing summary card — the high-level billing view on the project Overview
// tab (Phase 3). Shows project value + received and a per-stage "invoice sent /
// not sent" glance, then links into the full Financials tab. Deliberately
// shallow: the breakdown (economics, payouts, commission) lives on Financials.
//
// No "use client": pure render. The link is a plain anchor to ?tab=financials.

import Link from "next/link";
import { ArrowRight, Check, Circle } from "lucide-react";
import { Card, CardHeader, Label } from "@/components/ui";
import { formatCAD } from "@/lib/format";

const money = (n: number) => formatCAD(n).replace("CA$", "$");

type StageGlance = { id: string; label: string; amount: number; invoiced: boolean; paid: boolean };

export function BillingSummaryCard({
  projectId,
  budgetFee,
  received,
  stages,
}: {
  projectId: string;
  budgetFee: number;
  received: number;
  stages: StageGlance[];
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <h2 className="title-md">Billing</h2>
        <Link
          href={`/projects/${projectId}?tab=financials`}
          className="inline-flex items-center gap-1.5 text-[12px] text-track-gold hover:text-bone"
        >
          More information
          <ArrowRight size={13} strokeWidth={1.5} />
        </Link>
      </CardHeader>

      <div className="px-5 pb-4 flex items-center gap-10">
        <div className="flex flex-col gap-1.5">
          <Label>Project value</Label>
          <span className="mono text-[22px] text-bone tabular-nums leading-none">{money(budgetFee)}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Received</Label>
          <span className={`mono text-[22px] tabular-nums leading-none ${received > 0 ? "text-signal-fresh" : "text-bone-mute"}`}>
            {money(received)}
          </span>
        </div>
      </div>

      {stages.length > 0 && (
        <div className="border-t border-graphite flex flex-col">
          {stages.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-graphite/30 last:border-b-0">
              <div className="flex items-center gap-2 min-w-0">
                {s.paid ? (
                  <Check size={13} strokeWidth={2} className="text-invoice-paid shrink-0" />
                ) : s.invoiced ? (
                  <Check size={13} strokeWidth={2} className="text-track-gold shrink-0" />
                ) : (
                  <Circle size={11} strokeWidth={1.5} className="text-bone-mute shrink-0" />
                )}
                <span className="text-[13px] text-bone-dim truncate">{s.label}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="mono text-[12px] text-bone-dim tabular-nums">{money(s.amount)}</span>
                <span className="text-[10px] text-bone-mute w-20 text-right">
                  {s.paid ? "paid" : s.invoiced ? "invoice sent" : "not sent"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
