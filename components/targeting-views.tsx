"use client";

import { useState, useTransition } from "react";
import { Crosshair, Plus, X, ShieldAlert, Pencil, Trash2, Power } from "lucide-react";
import { Card, Label, Badge, Button, Input, Textarea, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/format";
import {
  createSegment,
  updateSegment,
  toggleSegmentActive,
  deleteSegment,
} from "@/app/(app)/targeting/actions";

type SegmentProp = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  priority: number;
  industries: string[];
  revenueMin: number | null;
  revenueMax: number | null;
  employeeMin: number | null;
  employeeMax: number | null;
  geographies: string[];
  buyerPersonas: string[];
  buyingSignals: string[];
  disqualifiers: string[];
  anchorCompanies: string[];
  createdAt: string;
  updatedAt: string;
};

// Compact "$25M – $200M" style band; whole CAD in, abbreviated out.
function band(min: number | null, max: number | null, money: boolean): string | null {
  if (min === null && max === null) return null;
  const fmt = (n: number) => (money ? formatCAD(n) : n.toLocaleString());
  if (min !== null && max !== null) return `${fmt(min)} – ${fmt(max)}`;
  if (min !== null) return `${fmt(min)}+`;
  return `up to ${fmt(max as number)}`;
}

export function TargetingViews({ segments }: { segments: SegmentProp[] }) {
  const [editing, setEditing] = useState<SegmentProp | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="px-8 py-8 flex flex-col gap-8">
      <div className="flex items-start justify-between gap-6">
        <p className="text-[13px] text-bone-mute max-w-[640px] leading-relaxed">
          Define <span className="text-bone">who the Lead Agent hunts for</span> — the kinds of companies you want as
          clients. Each segment is a spec: industries, revenue and size bands, geographies, the buyers you sell to, the
          signals worth chasing, and the disqualifiers. Switch a segment on or off; every field is editable.
        </p>
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          <Plus size={13} strokeWidth={1.5} />
          New segment
        </Button>
      </div>

      {segments.length === 0 ? (
        <EmptyState
          icon={<Crosshair size={28} strokeWidth={1.5} />}
          title="No target segments yet"
          hint="Define the first ideal-customer spec."
          action={
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <Plus size={13} strokeWidth={1.5} />
              New segment
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {segments.map((s) => (
            <SegmentCard key={s.id} segment={s} onEdit={() => setEditing(s)} />
          ))}
        </div>
      )}

      {creating && <SegmentModal onClose={() => setCreating(false)} />}
      {editing && <SegmentModal segment={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ChipRow({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {items.map((t, i) => (
          <span
            key={i}
            className="text-[11px] text-bone-dim border border-graphite px-2 py-0.5 rounded-[var(--radius-pill)]"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function BulletList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <ul className="flex flex-col gap-1">
        {items.map((t, i) => (
          <li key={i} className="text-[12px] text-bone-dim flex items-start gap-2">
            <span className="text-track-gold mt-0.5">·</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SegmentCard({ segment, onEdit }: { segment: SegmentProp; onEdit: () => void }) {
  const [isPending, startTransition] = useTransition();
  const revenue = band(segment.revenueMin, segment.revenueMax, true);
  const headcount = band(segment.employeeMin, segment.employeeMax, false);

  function toggle() {
    startTransition(async () => {
      try {
        await toggleSegmentActive(segment.id, !segment.active);
      } catch {
        /* surfaced on reload */
      }
    });
  }

  function remove() {
    if (!confirm(`Delete the "${segment.name}" target segment?`)) return;
    startTransition(async () => {
      try {
        await deleteSegment(segment.id);
      } catch {
        /* surfaced on reload */
      }
    });
  }

  return (
    <Card className={cn("flex flex-col", isPending && "opacity-60", !segment.active && "opacity-75")}>
      <div className="px-5 py-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Crosshair size={15} strokeWidth={1.5} className="text-track-gold shrink-0" />
          <span className="title-md truncate">{segment.name}</span>
        </div>
        <Badge tone={segment.active ? "gold" : "neutral"}>{segment.active ? "active" : "paused"}</Badge>
      </div>
      <div className="px-5 py-4 flex flex-col gap-4 flex-1">
        <p className="text-[13px] text-bone-dim leading-relaxed">{segment.description}</p>

        {(revenue || headcount) && (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {revenue && (
              <div className="flex flex-col">
                <Label>Revenue</Label>
                <span className="text-[12px] text-bone-dim">{revenue}</span>
              </div>
            )}
            {headcount && (
              <div className="flex flex-col">
                <Label>Headcount</Label>
                <span className="text-[12px] text-bone-dim">{headcount}</span>
              </div>
            )}
          </div>
        )}

        <ChipRow label="Industries" items={segment.industries} />
        <ChipRow label="Geographies" items={segment.geographies} />
        <BulletList label="Buyer personas" items={segment.buyerPersonas} />
        <BulletList label="Buying signals" items={segment.buyingSignals} />
        <BulletList label="Disqualifiers" items={segment.disqualifiers} />
        <ChipRow label="Anchor companies" items={segment.anchorCompanies} />
      </div>
      <div className="px-5 py-3 flex items-center justify-between gap-2">
        <button
          onClick={toggle}
          disabled={isPending}
          className={cn(
            "mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 border rounded-[var(--radius-sm)] transition-colors flex items-center gap-1.5",
            segment.active
              ? "border-graphite text-bone-mute hover:text-bone hover:border-bone-mute"
              : "border-track-gold/40 text-track-gold bg-track-gold-dim/10",
          )}
          title={segment.active ? "Pause segment" : "Activate segment"}
        >
          <Power size={11} strokeWidth={1.5} />
          {segment.active ? "Pause" : "Activate"}
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} disabled={isPending} className="text-bone-mute hover:text-bone" title="Edit">
            <Pencil size={13} strokeWidth={1.5} />
          </button>
          <button onClick={remove} disabled={isPending} className="text-bone-mute hover:text-flag-red" title="Delete">
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </Card>
  );
}

function SegmentModal({ segment, onClose }: { segment?: SegmentProp; onClose: () => void }) {
  const [name, setName] = useState(segment?.name ?? "");
  const [description, setDescription] = useState(segment?.description ?? "");
  const [priority, setPriority] = useState(String(segment?.priority ?? 0));
  const [active, setActive] = useState(segment?.active ?? true);
  const [revenueMin, setRevenueMin] = useState(segment?.revenueMin?.toString() ?? "");
  const [revenueMax, setRevenueMax] = useState(segment?.revenueMax?.toString() ?? "");
  const [employeeMin, setEmployeeMin] = useState(segment?.employeeMin?.toString() ?? "");
  const [employeeMax, setEmployeeMax] = useState(segment?.employeeMax?.toString() ?? "");
  const [industries, setIndustries] = useState(segment?.industries.join("\n") ?? "");
  const [geographies, setGeographies] = useState(segment?.geographies.join("\n") ?? "");
  const [buyerPersonas, setBuyerPersonas] = useState(segment?.buyerPersonas.join("\n") ?? "");
  const [buyingSignals, setBuyingSignals] = useState(segment?.buyingSignals.join("\n") ?? "");
  const [disqualifiers, setDisqualifiers] = useState(segment?.disqualifiers.join("\n") ?? "");
  const [anchorCompanies, setAnchorCompanies] = useState(segment?.anchorCompanies.join("\n") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const payload = {
          name,
          description,
          active,
          priority,
          revenueMin,
          revenueMax,
          employeeMin,
          employeeMax,
          industries,
          geographies,
          buyerPersonas,
          buyingSignals,
          disqualifiers,
          anchorCompanies,
        };
        if (segment) await updateSegment(segment.id, payload);
        else await createSegment(payload);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save segment");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-bitumen/85 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Crosshair size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>{segment ? "Edit target segment" : "New target segment"}</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        <form onSubmit={submit} className="px-5 py-5 flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_120px] gap-4">
            <div className="flex flex-col gap-2">
              <Label>
                Name <span className="text-flag-red">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Automotive"
                required
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Priority</Label>
              <Input
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                placeholder="0"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>
              Description <span className="text-flag-red">*</span>
            </Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Who is this segment and why do we want them?"
              required
              disabled={isPending}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Revenue min (CAD)</Label>
              <Input
                type="number"
                value={revenueMin}
                onChange={(e) => setRevenueMin(e.target.value)}
                placeholder="25000000"
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Revenue max (CAD)</Label>
              <Input
                type="number"
                value={revenueMax}
                onChange={(e) => setRevenueMax(e.target.value)}
                placeholder="200000000"
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Employees min</Label>
              <Input
                type="number"
                value={employeeMin}
                onChange={(e) => setEmployeeMin(e.target.value)}
                placeholder="100"
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Employees max</Label>
              <Input
                type="number"
                value={employeeMax}
                onChange={(e) => setEmployeeMax(e.target.value)}
                placeholder="2000"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Industries (one per line)</Label>
              <Textarea
                rows={4}
                value={industries}
                onChange={(e) => setIndustries(e.target.value)}
                placeholder={"Automotive Manufacturing\nAuto Parts & Suppliers"}
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Geographies (one per line)</Label>
              <Textarea
                rows={4}
                value={geographies}
                onChange={(e) => setGeographies(e.target.value)}
                placeholder={"Ontario\nCanada"}
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Buyer personas (one per line)</Label>
              <Textarea
                rows={4}
                value={buyerPersonas}
                onChange={(e) => setBuyerPersonas(e.target.value)}
                placeholder={"VP Operations\nCOO"}
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Buying signals (one per line)</Label>
              <Textarea
                rows={4}
                value={buyingSignals}
                onChange={(e) => setBuyingSignals(e.target.value)}
                placeholder={"New ERP rollout\nPlant expansion"}
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Disqualifiers (one per line)</Label>
              <Textarea
                rows={4}
                value={disqualifiers}
                onChange={(e) => setDisqualifiers(e.target.value)}
                placeholder={"Under $25M revenue\nEnterprise procurement"}
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Anchor companies (one per line)</Label>
              <Textarea
                rows={4}
                value={anchorCompanies}
                onChange={(e) => setAnchorCompanies(e.target.value)}
                placeholder={"Magna International\nLinamar"}
                disabled={isPending}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-[12px] text-bone-dim cursor-pointer select-none">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              disabled={isPending}
              className="accent-track-gold"
            />
            Active — the Lead Agent hunts against this segment
          </label>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={isPending || !name.trim() || !description.trim()}
            >
              {isPending ? "Saving…" : segment ? "Save changes" : "Create segment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
