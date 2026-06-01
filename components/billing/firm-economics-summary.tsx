// Firm economics summary — the 10/15/75 internal allocation of labour revenue
// (firm-economics.md §3), plus the client price (labour + direct costs).
//
// Presentational only: the allocation is computed server-side via
// allocateLaborRevenue and passed in. The split is INTERNAL — never shown on a
// client invoice. No "use client": pure render, safe in a server component.

import { formatCAD } from "@/lib/format";
import type { LaborAllocation } from "@/lib/billing/economics";

const money = (n: number) => formatCAD(n).replace("CA$", "$");

export function FirmEconomicsSummary({ alloc }: { alloc: LaborAllocation }) {
  if (alloc.laborBillable === 0 && alloc.directCosts === 0) return null;

  const pct = (n: number) => (alloc.laborBillable > 0 ? Math.round((n / alloc.laborBillable) * 100) : 0);
  const balanced =
    alloc.takeHome + alloc.origination + alloc.firmReserve === alloc.laborBillable;

  return (
    <div className="rounded-[var(--radius)] border border-graphite bg-asphalt/40 flex flex-col">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h3 className="title-md">Firm economics</h3>
          <span className="text-[11px] text-bone-mute">
            Internal 10/15/75 split of labour revenue — never shown to the client
          </span>
        </div>
        <span className="label text-[10px]">
          {alloc.isFirstContract ? "First contract" : "Retainer / subsequent"}
        </span>
      </div>

      <div className="px-5 pb-3 grid grid-cols-2 gap-x-8 gap-y-2.5">
        <Row label="Client price" hint="labour + direct costs" value={money(alloc.clientPrice)} tone="gold" big />
        <Row label="Labour billable" value={money(alloc.laborBillable)} />
        <Row
          label={`Origination · ${Math.round(alloc.originationPct * 100)}%`}
          hint={alloc.isFirstContract ? "to the sourcer" : "rolled to firm pool"}
          value={money(alloc.origination)}
        />
        <Row label={`Firm pool · ${pct(alloc.firmPool)}%`} value={money(alloc.firmPool)} />
        <Row label="Labour budget · 75%" hint="pays the team" value={money(alloc.laborBudget)} />
        <Row label="Take-home (cost)" value={money(alloc.takeHome)} />
        <Row label="Labour surplus" hint="→ firm reserve" value={money(alloc.laborSurplus)} />
        <Row label="Firm reserve" hint="pool + surplus" value={money(alloc.firmReserve)} tone="reserve" />
        {alloc.directCosts > 0 && (
          <Row label="Direct costs" hint="pass-through, at cost" value={money(alloc.directCosts)} />
        )}
      </div>

      <div className="px-5 pb-4">
        <div className="text-[11px] text-bone-mute">
          {balanced ? (
            <span className="text-invoice-paid">
              ✓ Reconciles — take-home {money(alloc.takeHome)} + origination {money(alloc.origination)} + firm
              reserve {money(alloc.firmReserve)} = {money(alloc.laborBillable)}
            </span>
          ) : (
            <span className="text-flag-red">Reconciliation off — check the numbers.</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  value,
  tone = "default",
  big = false,
}: {
  label: string;
  hint?: string;
  value: string;
  tone?: "default" | "gold" | "reserve";
  big?: boolean;
}) {
  const valueTone =
    tone === "gold" ? "text-track-gold" : tone === "reserve" ? "text-signal-fresh" : "text-bone";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col min-w-0">
        <span className="text-[12px] text-bone-dim truncate">{label}</span>
        {hint && <span className="text-[10px] text-bone-mute truncate">{hint}</span>}
      </div>
      <span className={`mono tabular-nums shrink-0 ${big ? "text-[15px]" : "text-[13px]"} ${valueTone}`}>
        {value}
      </span>
    </div>
  );
}
