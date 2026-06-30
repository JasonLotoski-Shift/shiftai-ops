// Phase 2 — Project P&L (rebuild §3.3). One project's plan reconciled against
// actuals pulled from the deduped ledger filtered to this projectId. Replaces the
// "revenue by project is recomputed in two places" gap: this is the single place a
// project's true cost, realization, and margin are shown. Presentational only
// (computed server-side, passed in). MP-only — the project page gates the render.

import { formatCAD } from "@/lib/format";

const cad = (n: number) => formatCAD(n).replace("CA$", "$");
const cadSigned = (n: number) => (n < 0 ? `-${cad(-n)}` : cad(n));

export type ProjectPnlProps = {
  budgetFee: number; // contract value
  billed: number; // invoiced (non-draft)
  collected: number; // received
  plannedCost: number; // planned take-home + direct costs
  actualCostPaid: number; // deduped cash actually out for this project
  takeHomePlanned: number; // planned labour cost
  takeHomePaid: number; // labour actually paid out
  plannedFirmReserve: number; // planned keep (old 10/15/75 model)
  commissionPlanned: number; // origination + source build, planned
  missingDocCount: number; // project money-out without a backing doc
  isBuyout: boolean;
};

export function ProjectPnl(p: ProjectPnlProps) {
  const realization = p.billed > 0 ? Math.round((p.collected / p.billed) * 100) : 0;
  const overrun = p.actualCostPaid - p.plannedCost; // >0 = over budget
  const trueMargin = p.budgetFee - p.actualCostPaid - p.commissionPlanned;
  const atRisk = overrun > 0 || trueMargin < 0;

  return (
    <div className="rounded-[var(--radius)] border border-graphite bg-asphalt/40 flex flex-col">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="title-md">Project P&L</h2>
          <span className="text-[11px] text-bone-mute">Plan reconciled against actuals from the deduped ledger.</span>
        </div>
        {atRisk && <span className="label text-[10px] text-flag-red">At risk</span>}
      </div>

      <div className="px-5 pb-4 grid grid-cols-2 gap-x-8 gap-y-3">
        <Row label="Contract value" value={cad(p.budgetFee)} tone="gold" big />
        <Row label="Realization" hint={`${cad(p.collected)} of ${cad(p.billed)} billed`} value={`${realization}%`} />

        {!p.isBuyout && (
          <>
            <Pair
              label="Cost · planned vs actual"
              planned={cad(p.plannedCost)}
              actual={cad(p.actualCostPaid)}
              flag={overrun > 0 ? `over ${cad(overrun)}` : overrun < 0 ? `under ${cad(-overrun)}` : "on budget"}
              flagTone={overrun > 0 ? "red" : "fresh"}
            />
            <Pair label="Take-home · planned vs paid" planned={cad(p.takeHomePlanned)} actual={cad(p.takeHomePaid)} />
            <Row label="Planned firm reserve" hint="old 10/15/75 keep" value={cad(p.plannedFirmReserve)} tone="reserve" />
            <Row label="Commission (planned)" hint="origination + source" value={cad(p.commissionPlanned)} />
          </>
        )}
        {p.isBuyout && (
          <Pair
            label="Cost · planned vs actual"
            planned={cad(p.plannedCost)}
            actual={cad(p.actualCostPaid)}
            flag={overrun > 0 ? `over ${cad(overrun)}` : "on budget"}
            flagTone={overrun > 0 ? "red" : "fresh"}
          />
        )}

        <Row
          label="True margin"
          hint="value − actual cost − commission"
          value={cadSigned(trueMargin)}
          tone={trueMargin < 0 ? "red" : "reserve"}
          big
        />
        <Row label="vs planned margin" hint="planned firm reserve" value={cad(p.plannedFirmReserve)} />
      </div>

      {p.missingDocCount > 0 && (
        <div className="px-5 pb-4">
          <span className="text-[11px] text-flag-red">
            {p.missingDocCount} money-out {p.missingDocCount === 1 ? "record is" : "records are"} missing a backing
            document.
          </span>
        </div>
      )}
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
  tone?: "default" | "gold" | "reserve" | "red";
  big?: boolean;
}) {
  const valueTone =
    tone === "gold" ? "text-track-gold" : tone === "reserve" ? "text-signal-fresh" : tone === "red" ? "text-flag-red" : "text-bone";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col min-w-0">
        <span className="text-[12px] text-bone-dim truncate">{label}</span>
        {hint && <span className="text-[10px] text-bone-mute truncate">{hint}</span>}
      </div>
      <span className={`mono tabular-nums shrink-0 ${big ? "text-[15px]" : "text-[13px]"} ${valueTone}`}>{value}</span>
    </div>
  );
}

function Pair({
  label,
  planned,
  actual,
  flag,
  flagTone = "fresh",
}: {
  label: string;
  planned: string;
  actual: string;
  flag?: string;
  flagTone?: "red" | "fresh";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col min-w-0">
        <span className="text-[12px] text-bone-dim truncate">{label}</span>
        {flag && <span className={`text-[10px] truncate ${flagTone === "red" ? "text-flag-red" : "text-signal-fresh"}`}>{flag}</span>}
      </div>
      <span className="mono tabular-nums shrink-0 text-[13px] text-bone">
        {planned} <span className="text-bone-mute">→</span> {actual}
      </span>
    </div>
  );
}
