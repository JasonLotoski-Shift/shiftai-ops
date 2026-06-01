"use client";

// Reconciliation banner — does the summed billable economics match the project
// value? Green when balanced, amber when it drifts. Warn-only (never blocks).

import { Check, TriangleAlert } from "lucide-react";
import { reconcile } from "@/lib/billing/economics";
import { formatCAD } from "@/lib/format";

const money = (n: number) => formatCAD(Math.abs(n)).replace("CA$", "$");

export function ReconciliationBanner({
  billableTotal,
  value,
}: {
  billableTotal: number;
  value: number;
}) {
  // Nothing to reconcile yet.
  if (billableTotal === 0 && value === 0) return null;

  const { delta, balanced } = reconcile(billableTotal, value);

  if (balanced) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] border border-invoice-paid/40 bg-invoice-paid/10">
        <Check size={13} strokeWidth={2} className="text-invoice-paid shrink-0" />
        <span className="text-[12px] text-bone-dim">
          Economics balanced — billable {money(billableTotal)} ≈ project value {money(value)}.
        </span>
      </div>
    );
  }

  const over = delta > 0;
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] border border-signal-warming/40 bg-signal-warming/10">
      <TriangleAlert size={13} strokeWidth={2} className="text-signal-warming shrink-0" />
      <span className="text-[12px] text-bone-dim">
        Billable economics {money(billableTotal)} {over ? "exceed" : "fall short of"} the project
        value {money(value)} by {money(delta)}.
      </span>
    </div>
  );
}
