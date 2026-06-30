"use client";

// Unified commission editor (Phase 4 cutover) — ONE card that replaces the old
// "Commission & billing settings" (OriginationEditor) and "Deal-source
// commission" (ProjectSourceCommissionEditor). Reads CommissionLine rows.
//
// Top: billing settings (origination rate, first-contract toggle, schedule type).
// Then two payee groups:
//   Origination — partners only, each a SHARE of the origination pool (rate ×
//     share). Shares sum to 100; the remainder stays in firm reserve. Paid only
//     on a first contract.
//   Source — partner OR external referrer, each 1-10% of the build value, plus an
//     optional recurring % when the engagement has an on-going service contract.
// A deficit banner fires when promised source commission exceeds firm reserve.
//
// Firm money — the page mounts this for managing partners only; every action is
// also MP-gated server-side.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, X, Trash2, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardBody, Input, Select } from "@/components/ui";
import { formatCAD } from "@/lib/format";
import {
  setProjectBillingMeta,
  addCommissionLine,
  updateCommissionLine,
  deleteCommissionLine,
} from "@/app/(app)/projects/[id]/billing-actions";

export type CommissionLineView = {
  id: string;
  kind: "origination" | "source";
  partnerId: string | null;
  externalName: string | null;
  payeeName: string;
  sharePct: number | null; // origination only (buildPct ÷ rate × 100)
  pct: number; // origination → share; source → its 1-10%
  recurringPct: number | null;
  buildAmount: number;
  recurringAmount: number;
};

export type CommissionPartner = { id: string; name: string };

export type CommissionSummary = {
  originationFromLabour: number;
  sourceCommissionTotal: number;
  firmReserve: number;
  firmReserveDeficit: number;
  overCommitted: boolean;
};

const SCHEDULE_LABELS: Record<string, string> = {
  fifty_twenty_five: "50 / 25 / 25 (pilots & projects)",
  monthly_even: "Monthly even (fixed-term recurring)",
  custom: "Custom (leave my schedule alone)",
};

const cad = (n: number) => formatCAD(n).replace("CA$", "$");

export function CommissionEditor({
  projectId,
  originationPct,
  isFirstContract,
  scheduleType,
  hasServiceContract,
  lines,
  partners,
  summary,
}: {
  projectId: string;
  originationPct: number;
  isFirstContract: boolean;
  scheduleType: string;
  hasServiceContract: boolean;
  lines: CommissionLineView[];
  partners: CommissionPartner[];
  summary: CommissionSummary;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pct, setPct] = useState(String(originationPct));
  const [addingKind, setAddingKind] = useState<null | "origination" | "source">(null);

  const origLines = lines.filter((l) => l.kind === "origination");
  const sourceLines = lines.filter((l) => l.kind === "source");
  const totalShare = origLines.reduce((s, l) => s + (l.sharePct ?? 0), 0);

  function run(fn: () => Promise<unknown>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        onDone?.();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="title-md">Commission</h2>
          <span className="text-[11px] text-bone-mute">Origination + deal-source payees, and how the schedule is built</span>
        </div>
      </CardHeader>

      <CardBody className="flex flex-col gap-5 pt-0">
        {/* Settings row */}
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="label text-[10px]">Origination %</span>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              onBlur={() => run(() => setProjectBillingMeta(projectId, { originationPct: Number(pct || 0) }))}
              className="h-8 text-[13px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label text-[10px]">Contract</span>
            <Select
              value={isFirstContract ? "first" : "subsequent"}
              onChange={(e) => run(() => setProjectBillingMeta(projectId, { isFirstContract: e.target.value === "first" }))}
              className="h-8 text-[13px]"
            >
              <option value="first">First for client</option>
              <option value="subsequent">Retainer / subsequent</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="label text-[10px]">Schedule</span>
            <Select
              value={scheduleType}
              onChange={(e) => run(() => setProjectBillingMeta(projectId, { scheduleType: e.target.value }))}
              className="h-8 text-[13px]"
            >
              {Object.entries(SCHEDULE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </label>
        </div>

        {!isFirstContract && (
          <p className="text-[11px] text-bone-mute">
            Retainer / subsequent contract: the origination slot rolls into firm reserve and no origination is paid.
          </p>
        )}

        {summary.overCommitted && (
          <div className="flex items-start gap-2 p-2.5 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
            <AlertTriangle size={14} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
            <span className="text-[11px] text-flag-red">
              This engagement promises {cad(summary.sourceCommissionTotal)} of source commission against {cad(summary.firmReserve + summary.sourceCommissionTotal)} of reserve.
              It runs {cad(summary.firmReserveDeficit)} short. Payouts are still generated at full value; review before signing.
            </span>
          </div>
        )}

        {/* Origination payees */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="label text-[10px]">Origination {origLines.length > 0 && `· ${Math.round(totalShare)}% allocated`}</span>
            {isFirstContract && addingKind !== "origination" && origLines.length < 2 && (
              <button onClick={() => setAddingKind("origination")} className="inline-flex items-center gap-1 text-[12px] text-track-gold hover:text-bone">
                <Plus size={12} strokeWidth={1.5} /> Add partner
              </button>
            )}
          </div>

          {origLines.length === 0 && addingKind !== "origination" && (
            <p className="text-[11px] text-bone-mute">No one attributed. Brand / referral origin, so the slot stays in firm reserve.</p>
          )}

          {origLines.map((l) => (
            <LineRow key={l.id} line={l} isPending={isPending} onDelete={() => run(() => deleteCommissionLine(l.id))} />
          ))}

          {addingKind === "origination" && (
            <OriginationForm
              partners={partners.filter((p) => !origLines.some((l) => l.partnerId === p.id))}
              isPending={isPending}
              onCancel={() => setAddingKind(null)}
              onSubmit={(v) => run(() => addCommissionLine(projectId, { kind: "origination", partnerId: v.partnerId, pct: v.sharePct }), () => setAddingKind(null))}
            />
          )}
        </div>

        {/* Source payees */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="label text-[10px]">Deal-source {sourceLines.length > 0 && `· ${cad(summary.sourceCommissionTotal)}`}</span>
            {addingKind !== "source" && sourceLines.length < 2 && (
              <button onClick={() => setAddingKind("source")} className="inline-flex items-center gap-1 text-[12px] text-track-gold hover:text-bone">
                <Plus size={12} strokeWidth={1.5} /> Add payee
              </button>
            )}
          </div>

          {sourceLines.length === 0 && addingKind !== "source" && (
            <p className="text-[11px] text-bone-mute">No deal-source commission. Add a partner or outside referrer who earns a cut for sourcing this work.</p>
          )}

          {sourceLines.map((l) => (
            <LineRow key={l.id} line={l} isPending={isPending} onDelete={() => run(() => deleteCommissionLine(l.id))} />
          ))}

          {addingKind === "source" && (
            <SourceForm
              partners={partners}
              hasServiceContract={hasServiceContract}
              isPending={isPending}
              onCancel={() => setAddingKind(null)}
              onSubmit={(v) =>
                run(
                  () => addCommissionLine(projectId, { kind: "source", partnerId: v.partnerId, externalName: v.externalName, pct: v.pct, recurringPct: v.recurringPct }),
                  () => setAddingKind(null),
                )
              }
            />
          )}
        </div>

        {error && <span className="text-[12px] text-flag-red">{error}</span>}
      </CardBody>
    </Card>
  );
}

function LineRow({ line, isPending, onDelete }: { line: CommissionLineView; isPending: boolean; onDelete: () => void }) {
  const sub =
    line.kind === "origination"
      ? `${Math.round(line.sharePct ?? 0)}% share`
      : line.recurringPct
        ? `${line.pct}% build · ${line.recurringPct}% recurring`
        : `${line.pct}% of build`;
  const amount = line.kind === "origination" ? line.buildAmount : line.buildAmount + line.recurringAmount;
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="flex flex-col min-w-0">
        <span className="text-[13px] text-bone truncate">{line.payeeName}</span>
        <span className="text-[11px] text-bone-mute">{sub}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="mono text-[12px] text-track-gold tabular-nums">{cad(amount)}</span>
        <button onClick={onDelete} disabled={isPending} className="text-bone-mute hover:text-flag-red disabled:opacity-40" title="Remove">
          <Trash2 size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

function OriginationForm({
  partners,
  isPending,
  onCancel,
  onSubmit,
}: {
  partners: CommissionPartner[];
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (v: { partnerId: string; sharePct: number }) => void;
}) {
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? "");
  const [share, setShare] = useState("100");
  return (
    <div className="flex items-center gap-2">
      <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="h-8 text-[13px] flex-1">
        {partners.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </Select>
      <Input type="number" min={1} max={100} step="1" value={share} onChange={(e) => setShare(e.target.value)} className="h-8 text-[13px] w-20" title="Share of the origination pool (%)" />
      <button
        onClick={() => partnerId && onSubmit({ partnerId, sharePct: Number(share || 0) })}
        disabled={isPending || !partnerId}
        className="inline-flex items-center gap-1 text-[12px] text-track-gold hover:text-bone disabled:opacity-40"
        title="Save"
      >
        <Check size={14} strokeWidth={1.5} />
      </button>
      <button onClick={onCancel} disabled={isPending} className="inline-flex items-center gap-1 text-[12px] text-bone-mute hover:text-bone">
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

function SourceForm({
  partners,
  hasServiceContract,
  isPending,
  onCancel,
  onSubmit,
}: {
  partners: CommissionPartner[];
  hasServiceContract: boolean;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (v: { partnerId?: string; externalName?: string; pct: number; recurringPct?: number }) => void;
}) {
  const [payeeKind, setPayeeKind] = useState<"partner" | "external">("partner");
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? "");
  const [externalName, setExternalName] = useState("");
  const [pct, setPct] = useState("5");
  const [recurring, setRecurring] = useState("");

  const canSubmit = payeeKind === "partner" ? !!partnerId : !!externalName.trim();

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      partnerId: payeeKind === "partner" ? partnerId : undefined,
      externalName: payeeKind === "external" ? externalName.trim() : undefined,
      pct: Number(pct || 0),
      recurringPct: hasServiceContract && recurring ? Number(recurring) : undefined,
    });
  }

  return (
    <div className="flex flex-col gap-2 p-3 border border-graphite rounded-[var(--radius)]">
      <div className="flex items-center gap-1">
        {(["partner", "external"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setPayeeKind(k)}
            className={`px-2.5 py-1 border text-[11px] rounded-[var(--radius-pill)] transition-colors ${
              payeeKind === k ? "border-track-gold/40 text-track-gold bg-track-gold-dim/10" : "border-graphite-2 text-bone-mute hover:text-bone-dim"
            }`}
          >
            {k === "partner" ? "Partner" : "External"}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {payeeKind === "partner" ? (
          <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="h-8 text-[13px] flex-1">
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        ) : (
          <Input value={externalName} onChange={(e) => setExternalName(e.target.value)} placeholder="External referrer name" className="h-8 text-[13px] flex-1" />
        )}
        <Input type="number" min={1} max={10} step="0.5" value={pct} onChange={(e) => setPct(e.target.value)} className="h-8 text-[13px] w-16" title="Build commission % (1-10)" />
      </div>

      <div className="flex items-center gap-2">
        {hasServiceContract ? (
          <Input
            type="number"
            min={1}
            max={10}
            step="0.5"
            value={recurring}
            onChange={(e) => setRecurring(e.target.value)}
            placeholder="Recurring % (optional)"
            className="h-8 text-[13px] flex-1"
            title="Monthly recurring commission % on the service contract (1-10)"
          />
        ) : (
          <span className="text-[11px] text-bone-mute flex-1">Recurring % applies once an on-going service contract exists.</span>
        )}
        <button onClick={submit} disabled={isPending || !canSubmit} className="inline-flex items-center gap-1 text-[12px] text-track-gold hover:text-bone disabled:opacity-40" title="Save">
          <Check size={14} strokeWidth={1.5} />
        </button>
        <button onClick={onCancel} disabled={isPending} className="inline-flex items-center gap-1 text-[12px] text-bone-mute hover:text-bone">
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
