"use client";

// Project economics editor — the firm-economics breakdown for a project.
// One row per person/role: hours × pay rate (cost) and × bill rate (billable).
// Adding a roster consultant auto-fills the firm defaults (their pay rate; the
// firm default billable rate); editing a rate is an override. Footer shows the
// billable/cost/margin totals and the reconciliation against the project value.
//
// Self-contained Card so it mounts on the project page and in the Billing
// workspace. Mirrors billing-schedule-editor's inline-edit + add-row pattern.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Check, X, Trash2 } from "lucide-react";
import { Card, CardHeader, CardBody, Input, Select, Button, Badge, Label, EmptyState } from "@/components/ui";
import { formatCAD } from "@/lib/format";
import { economicsTotals, lineCostCAD, lineBillCAD } from "@/lib/billing/economics";
import { ReconciliationBanner } from "@/components/billing/reconciliation-banner";
import {
  createEconomicsLine,
  updateEconomicsLine,
  deleteEconomicsLine,
} from "@/app/(app)/projects/[id]/billing-actions";

export type EconLine = {
  id: string;
  role: string;
  hours: number;
  payRateCents: number;
  billRateCents: number;
  isExtra: boolean;
  fromFirmDefault: boolean;
  consultantId: string | null;
  consultantName: string | null;
  rateTierId: string | null;
};

export type EconConsultant = { id: string; name: string; role: string; payRateCents: number };
export type EconTier = { id: string; name: string; billRateCents: number; payRateCents: number };

const money = (n: number) => formatCAD(n).replace("CA$", "$");
const rate = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function EconomicsEditor({
  projectId,
  value,
  lines,
  consultants,
  tiers,
}: {
  projectId: string;
  value: number;
  lines: EconLine[];
  consultants: EconConsultant[];
  tiers: EconTier[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const totals = economicsTotals(lines);

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
          <h2 className="title-md">Economics</h2>
          <span className="text-[11px] text-bone-mute">What we bill vs. what we pay the team</span>
        </div>
        {!adding && (
          <Button variant="ghost" size="sm" onClick={() => { setAdding(true); setEditingId(null); }}>
            <Plus size={13} strokeWidth={1.5} />
            Add line
          </Button>
        )}
      </CardHeader>

      {adding && (
        <div className="px-5 pb-3">
          <LineForm
            consultants={consultants}
            tiers={tiers}
            isPending={isPending}
            onCancel={() => setAdding(false)}
            onSubmit={(v) => run(() => createEconomicsLine(projectId, v), () => setAdding(false))}
          />
        </div>
      )}

      {lines.length === 0 && !adding ? (
        <EmptyState
          title="No economics yet"
          hint="Add a line per person on the project — or ingest a scope-pricing doc — to track cost vs. billable."
          compact
        />
      ) : (
        <div className="flex flex-col">
          <div className="grid grid-cols-[1.5fr_60px_90px_90px_90px_90px_64px] gap-2 px-5 py-2">
            <span className="text-[11px] text-bone-dim">Who / role</span>
            <span className="text-[11px] text-bone-dim text-right">Hrs</span>
            <span className="text-[11px] text-bone-dim text-right">Pay</span>
            <span className="text-[11px] text-bone-dim text-right">Bill</span>
            <span className="text-[11px] text-bone-dim text-right">Cost</span>
            <span className="text-[11px] text-bone-dim text-right">Billable</span>
            <span className="text-[11px] text-bone-dim text-right">Edit</span>
          </div>

          {lines.map((l) =>
            editingId === l.id ? (
              <div key={l.id} className="px-5 py-3 border-t border-graphite/40">
                <LineForm
                  consultants={consultants}
                  tiers={tiers}
                  initial={l}
                  isPending={isPending}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(v) => run(() => updateEconomicsLine(l.id, v), () => setEditingId(null))}
                />
              </div>
            ) : (
              <div key={l.id} className="grid grid-cols-[1.5fr_60px_90px_90px_90px_90px_64px] gap-2 px-5 py-2.5 border-t border-graphite/40 items-center">
                <span className="text-[13px] text-bone truncate flex items-center gap-2">
                  {l.consultantName ?? l.role}
                  {l.consultantName && <span className="text-[11px] text-bone-mute truncate">· {l.role}</span>}
                  {l.isExtra && <Badge tone="gold">extra</Badge>}
                  {!l.fromFirmDefault && <Badge tone="neutral">override</Badge>}
                </span>
                <span className="mono text-[12px] text-bone-dim tabular-nums text-right">{l.hours}</span>
                <span className="mono text-[12px] text-bone-dim tabular-nums text-right">{rate(l.payRateCents)}</span>
                <span className="mono text-[12px] text-bone-dim tabular-nums text-right">{rate(l.billRateCents)}</span>
                <span className="mono text-[12px] text-bone-mute tabular-nums text-right">{money(lineCostCAD(l))}</span>
                <span className="mono text-[12px] text-track-gold tabular-nums text-right">{money(lineBillCAD(l))}</span>
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={() => { setEditingId(l.id); setAdding(false); }} className="text-bone-mute hover:text-track-gold" title="Edit">
                    <Pencil size={13} strokeWidth={1.5} />
                  </button>
                  <button onClick={() => run(() => deleteEconomicsLine(l.id))} disabled={isPending} className="text-bone-mute hover:text-flag-red disabled:opacity-40" title="Delete">
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            ),
          )}

          {/* Totals */}
          <div className="grid grid-cols-[1.5fr_60px_90px_90px_90px_90px_64px] gap-2 px-5 py-3 border-t border-graphite items-center">
            <span className="text-[12px] text-bone-dim">Totals (excl. extras)</span>
            <span className="mono text-[12px] text-bone-dim tabular-nums text-right">{totals.totalHours}</span>
            <span />
            <span />
            <span className="mono text-[13px] text-bone tabular-nums text-right">{money(totals.costTotal)}</span>
            <span className="mono text-[13px] text-track-gold tabular-nums text-right">{money(totals.billableTotal)}</span>
            <span />
          </div>
        </div>
      )}

      <CardBody className="pt-0 flex flex-col gap-2">
        <div className="flex items-center gap-6 text-[12px] flex-wrap">
          <span className="text-bone-dim">Gross margin <span className="mono text-bone tabular-nums">{money(totals.grossMargin)}</span></span>
          <span className="text-bone-dim">Margin <span className="mono text-bone tabular-nums">{Math.round(totals.marginPct * 100)}%</span></span>
          {(totals.extrasBillable > 0 || totals.extrasCost > 0) && (
            <span className="text-bone-dim">Extras <span className="mono text-track-gold tabular-nums">{money(totals.extrasBillable)}</span> bill / <span className="mono text-bone-mute tabular-nums">{money(totals.extrasCost)}</span> cost</span>
          )}
        </div>
        <ReconciliationBanner billableTotal={totals.billableTotal} value={value} />
        {error && <span className="text-[12px] text-flag-red">{error}</span>}
      </CardBody>
    </Card>
  );
}

type LineFormValue = {
  consultantId: string | null;
  rateTierId: string | null;
  role: string;
  hours: number;
  payRateCents?: number;
  billRateCents?: number;
  isExtra: boolean;
};

function LineForm({
  consultants,
  tiers,
  initial,
  isPending,
  onCancel,
  onSubmit,
}: {
  consultants: EconConsultant[];
  tiers: EconTier[];
  initial?: EconLine;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (v: LineFormValue) => void;
}) {
  const [consultantId, setConsultantId] = useState(initial?.consultantId ?? "");
  const [rateTierId, setRateTierId] = useState(initial?.rateTierId ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [hours, setHours] = useState(initial ? String(initial.hours) : "");
  const [pay, setPay] = useState(initial ? String(initial.payRateCents / 100) : "");
  const [bill, setBill] = useState(initial ? String(initial.billRateCents / 100) : "");
  const [isExtra, setIsExtra] = useState(initial?.isExtra ?? false);

  // Picking a consultant fills the role + pay rate from the roster (unless the
  // partner has typed their own).
  function pickConsultant(id: string) {
    setConsultantId(id);
    const c = consultants.find((x) => x.id === id);
    if (c) {
      if (!role.trim()) setRole(c.role);
      if (!pay.trim()) setPay(String(c.payRateCents / 100));
    }
  }

  // Picking a rate tier sets BOTH default rates from the rate card (overridable).
  function pickTier(id: string) {
    setRateTierId(id);
    const t = tiers.find((x) => x.id === id);
    if (t) {
      setBill(String(t.billRateCents / 100));
      setPay(String(t.payRateCents / 100));
      if (!role.trim()) setRole(t.name);
    }
  }

  function submit() {
    onSubmit({
      consultantId: consultantId || null,
      rateTierId: rateTierId || null,
      role,
      hours: Number(hours || 0),
      payRateCents: pay.trim() === "" ? undefined : Math.round(Number(pay) * 100),
      billRateCents: bill.trim() === "" ? undefined : Math.round(Number(bill) * 100),
      isExtra,
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-[1fr_1fr_1fr_60px_80px_80px] gap-2">
        <Select value={consultantId} onChange={(e) => pickConsultant(e.target.value)} className="h-8 text-[13px]">
          <option value="">No consultant</option>
          {consultants.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Select value={rateTierId} onChange={(e) => pickTier(e.target.value)} className="h-8 text-[13px]">
          <option value="">No tier</option>
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
        <Input placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} className="h-8 text-[13px]" />
        <Input type="number" min={0} step="0.5" placeholder="Hrs" value={hours} onChange={(e) => setHours(e.target.value)} className="h-8 text-[13px]" />
        <Input type="number" min={0} step="1" placeholder="$/hr pay" value={pay} onChange={(e) => setPay(e.target.value)} className="h-8 text-[13px]" />
        <Input type="number" min={0} step="1" placeholder="$/hr bill" value={bill} onChange={(e) => setBill(e.target.value)} className="h-8 text-[13px]" />
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-[12px] text-bone-dim cursor-pointer">
          <input type="checkbox" checked={isExtra} onChange={(e) => setIsExtra(e.target.checked)} className="accent-track-gold" />
          Out-of-scope extra
        </label>
        <div className="flex items-center gap-2">
          <button onClick={submit} disabled={isPending} className="inline-flex items-center gap-1.5 text-[12px] text-track-gold hover:text-bone disabled:opacity-40">
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
