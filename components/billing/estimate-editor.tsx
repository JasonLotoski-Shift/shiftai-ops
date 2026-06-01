"use client";

// Estimate editor (Phase 5) — pre-proposal scoping on a Deal. Build a
// hours-by-tier estimate that defaults to the firm rate card; the headline
// total is Σ non-extra billable. Lifecycle: draft → sent → accepted. The
// accepted estimate's lines convert into project economics when the deal is won.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, X, Trash2, Pencil, Calculator } from "lucide-react";
import { Card, CardHeader, CardBody, Input, Select, Button, Badge, EmptyState } from "@/components/ui";
import { formatCAD } from "@/lib/format";
import { economicsTotals, lineCostCAD, lineBillCAD } from "@/lib/billing/economics";
import {
  ensureEstimate,
  addEstimateLine,
  updateEstimateLine,
  deleteEstimateLine,
  setEstimateStatus,
} from "@/app/(app)/pipeline/[id]/estimate-actions";

export type EstimateLineRow = {
  id: string;
  role: string;
  hours: number;
  payRateCents: number;
  billRateCents: number;
  isExtra: boolean;
  rateTierId: string | null;
};
export type EstimateData = {
  id: string;
  version: number;
  status: "draft" | "sent" | "accepted" | "superseded";
  totalValue: number;
  lines: EstimateLineRow[];
};
export type EstimateTier = { id: string; name: string; billRateCents: number; payRateCents: number };

const money = (n: number) => formatCAD(n).replace("CA$", "$");
const rate = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const statusTone = { draft: "neutral", sent: "gold", accepted: "steel", superseded: "bone" } as const;

export function EstimateEditor({
  dealId,
  estimate,
  tiers,
}: {
  dealId: string;
  estimate: EstimateData | null;
  tiers: EstimateTier[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  if (!estimate) {
    return (
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 className="title-md">Estimate</h2>
            <span className="text-[11px] text-bone-mute">Scope the contract value before the proposal</span>
          </div>
        </CardHeader>
        <CardBody>
          <EmptyState
            icon={<Calculator size={22} strokeWidth={1.5} />}
            title="No estimate yet"
            hint="Build a pre-proposal estimate — hours by tier at standard rates — to size the contract."
            compact
          />
          <div className="mt-3">
            <Button variant="primary" size="sm" disabled={isPending} onClick={() => run(() => ensureEstimate(dealId))}>
              <Calculator size={13} strokeWidth={1.5} />
              Build estimate
            </Button>
          </div>
          {error && <span className="text-[12px] text-flag-red">{error}</span>}
        </CardBody>
      </Card>
    );
  }

  const totals = economicsTotals(estimate.lines);
  const locked = estimate.status === "accepted" || estimate.status === "superseded";

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h2 className="title-md">Estimate</h2>
            <Badge tone={statusTone[estimate.status]}>{estimate.status}</Badge>
            <span className="text-[11px] text-bone-mute">v{estimate.version}</span>
          </div>
          <span className="text-[11px] text-bone-mute">Defaults to standard rates · accepted converts to project economics on win</span>
        </div>
        {!adding && !locked && (
          <Button variant="ghost" size="sm" onClick={() => { setAdding(true); setEditingId(null); }}>
            <Plus size={13} strokeWidth={1.5} />
            Add line
          </Button>
        )}
      </CardHeader>

      {adding && (
        <div className="px-5 pb-3">
          <LineForm
            tiers={tiers}
            isPending={isPending}
            onCancel={() => setAdding(false)}
            onSubmit={(v) => run(() => addEstimateLine(estimate.id, v), () => setAdding(false))}
          />
        </div>
      )}

      {estimate.lines.length === 0 && !adding ? (
        <EmptyState title="No lines yet" hint="Add a line per tier — hours × the standard rate." compact />
      ) : (
        <div className="flex flex-col">
          <div className="grid grid-cols-[1.4fr_56px_84px_84px_84px_84px_56px] gap-2 px-5 py-2">
            <span className="text-[11px] text-bone-dim">Role / tier</span>
            <span className="text-[11px] text-bone-dim text-right">Hrs</span>
            <span className="text-[11px] text-bone-dim text-right">Pay</span>
            <span className="text-[11px] text-bone-dim text-right">Bill</span>
            <span className="text-[11px] text-bone-dim text-right">Cost</span>
            <span className="text-[11px] text-bone-dim text-right">Billable</span>
            <span className="text-[11px] text-bone-dim text-right">Edit</span>
          </div>
          {estimate.lines.map((l) =>
            editingId === l.id ? (
              <div key={l.id} className="px-5 py-3 border-t border-graphite/40">
                <LineForm
                  tiers={tiers}
                  initial={l}
                  isPending={isPending}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(v) => run(() => updateEstimateLine(l.id, v), () => setEditingId(null))}
                />
              </div>
            ) : (
              <div key={l.id} className="grid grid-cols-[1.4fr_56px_84px_84px_84px_84px_56px] gap-2 px-5 py-2.5 border-t border-graphite/40 items-center">
                <span className="text-[13px] text-bone truncate flex items-center gap-2">
                  {l.role}
                  {l.isExtra && <Badge tone="gold">extra</Badge>}
                </span>
                <span className="mono text-[12px] text-bone-dim tabular-nums text-right">{l.hours}</span>
                <span className="mono text-[12px] text-bone-dim tabular-nums text-right">{rate(l.payRateCents)}</span>
                <span className="mono text-[12px] text-bone-dim tabular-nums text-right">{rate(l.billRateCents)}</span>
                <span className="mono text-[12px] text-bone-mute tabular-nums text-right">{money(lineCostCAD(l))}</span>
                <span className="mono text-[12px] text-track-gold tabular-nums text-right">{money(lineBillCAD(l))}</span>
                <div className="flex items-center justify-end gap-1.5">
                  {!locked && (
                    <>
                      <button onClick={() => { setEditingId(l.id); setAdding(false); }} className="text-bone-mute hover:text-track-gold" title="Edit">
                        <Pencil size={13} strokeWidth={1.5} />
                      </button>
                      <button onClick={() => run(() => deleteEstimateLine(l.id))} disabled={isPending} className="text-bone-mute hover:text-flag-red disabled:opacity-40" title="Delete">
                        <Trash2 size={13} strokeWidth={1.5} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ),
          )}
          <div className="grid grid-cols-[1.4fr_56px_84px_84px_84px_84px_56px] gap-2 px-5 py-3 border-t border-graphite items-center">
            <span className="text-[12px] text-bone-dim">Estimated contract value</span>
            <span className="mono text-[12px] text-bone-dim tabular-nums text-right">{totals.totalHours}</span>
            <span /><span />
            <span className="mono text-[13px] text-bone tabular-nums text-right">{money(totals.costTotal)}</span>
            <span className="mono text-[13px] text-track-gold tabular-nums text-right">{money(totals.billableTotal)}</span>
            <span />
          </div>
        </div>
      )}

      <CardBody className="pt-3 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[12px] text-bone-dim">
          Margin <span className="mono text-bone tabular-nums">{Math.round(totals.marginPct * 100)}%</span>
        </span>
        <div className="flex items-center gap-2">
          {estimate.status === "draft" && (
            <Button variant="ghost" size="sm" disabled={isPending} onClick={() => run(() => setEstimateStatus(estimate.id, "sent"))}>
              Mark sent
            </Button>
          )}
          {(estimate.status === "draft" || estimate.status === "sent") && (
            <Button variant="primary" size="sm" disabled={isPending || estimate.lines.length === 0} onClick={() => run(() => setEstimateStatus(estimate.id, "accepted"))}>
              <Check size={13} strokeWidth={1.5} />
              Mark accepted
            </Button>
          )}
          {estimate.status === "accepted" && (
            <span className="text-[12px] text-invoice-paid">Accepted — converts to project economics on win.</span>
          )}
        </div>
      </CardBody>
      {error && <CardBody className="pt-0"><span className="text-[12px] text-flag-red">{error}</span></CardBody>}
    </Card>
  );
}

type LineFormValue = {
  rateTierId: string | null;
  role: string;
  hours: number;
  payRateCents?: number;
  billRateCents?: number;
  isExtra: boolean;
};

function LineForm({
  tiers,
  initial,
  isPending,
  onCancel,
  onSubmit,
}: {
  tiers: EstimateTier[];
  initial?: EstimateLineRow;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (v: LineFormValue) => void;
}) {
  const [rateTierId, setRateTierId] = useState(initial?.rateTierId ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [hours, setHours] = useState(initial ? String(initial.hours) : "");
  const [pay, setPay] = useState(initial ? String(initial.payRateCents / 100) : "");
  const [bill, setBill] = useState(initial ? String(initial.billRateCents / 100) : "");
  const [isExtra, setIsExtra] = useState(initial?.isExtra ?? false);

  function pickTier(id: string) {
    setRateTierId(id);
    const t = tiers.find((x) => x.id === id);
    if (t) {
      setBill(String(t.billRateCents / 100));
      setPay(String(t.payRateCents / 100));
      if (!role.trim()) setRole(t.name);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-[1.2fr_1.2fr_60px_80px_80px] gap-2">
        <Select value={rateTierId} onChange={(e) => pickTier(e.target.value)} className="h-8 text-[13px]">
          <option value="">No tier</option>
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
        <Input placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} className="h-8 text-[13px]" />
        <Input type="number" min={0} step="0.5" placeholder="Hrs" value={hours} onChange={(e) => setHours(e.target.value)} className="h-8 text-[13px]" />
        <Input type="number" min={0} step="1" placeholder="$ pay" value={pay} onChange={(e) => setPay(e.target.value)} className="h-8 text-[13px]" />
        <Input type="number" min={0} step="1" placeholder="$ bill" value={bill} onChange={(e) => setBill(e.target.value)} className="h-8 text-[13px]" />
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-[12px] text-bone-dim cursor-pointer">
          <input type="checkbox" checked={isExtra} onChange={(e) => setIsExtra(e.target.checked)} className="accent-track-gold" />
          Out-of-scope extra
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSubmit({
              rateTierId: rateTierId || null,
              role,
              hours: Number(hours || 0),
              payRateCents: pay.trim() === "" ? undefined : Math.round(Number(pay) * 100),
              billRateCents: bill.trim() === "" ? undefined : Math.round(Number(bill) * 100),
              isExtra,
            })}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 text-[12px] text-track-gold hover:text-bone disabled:opacity-40"
          >
            <Check size={14} strokeWidth={1.5} />
            {initial ? "Save" : "Add"}
          </button>
          <button onClick={onCancel} disabled={isPending} className="inline-flex items-center gap-1.5 text-[12px] text-bone-mute hover:text-bone">
            <X size={14} strokeWidth={1.5} />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
