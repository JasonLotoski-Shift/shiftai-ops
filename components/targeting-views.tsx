"use client";

import { useEffect, useState, useTransition } from "react";
import { Crosshair, Plus, X, ShieldAlert, Trash2, Power, Search } from "lucide-react";
import { Card, Label, Button, Input, Textarea, EmptyState } from "@/components/ui";
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
  // `open` is the segment being viewed/edited in the slide-over, or "new".
  const [open, setOpen] = useState<SegmentProp | "new" | null>(null);

  return (
    <div className="px-8 py-8 flex flex-col gap-8">
      <div className="flex items-start justify-between gap-6">
        <p className="text-[13px] text-bone-mute max-w-[640px] leading-relaxed">
          Define <span className="text-bone">who the Lead Agent hunts for</span> — the kinds of companies you want as
          clients. Each segment is a spec the agent searches and rates against. Click a segment to open its builder; run
          a search when you&apos;re ready.
        </p>
        <Button variant="primary" size="sm" onClick={() => setOpen("new")}>
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
            <Button variant="primary" size="sm" onClick={() => setOpen("new")}>
              <Plus size={13} strokeWidth={1.5} />
              New segment
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {segments.map((s) => (
            <SegmentCard key={s.id} segment={s} onOpen={() => setOpen(s)} />
          ))}
        </div>
      )}

      {open && (
        <SegmentPanel
          segment={open === "new" ? undefined : open}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
// Clean: name + one-line summary + status + run. The whole card opens the
// builder; the inline controls (enable toggle, run) stop propagation.
function SegmentCard({ segment, onOpen }: { segment: SegmentProp; onOpen: () => void }) {
  const [isPending, startTransition] = useTransition();
  const revenue = band(segment.revenueMin, segment.revenueMax, true);
  const summary = [
    segment.industries.length
      ? `${segment.industries.length} ${segment.industries.length === 1 ? "industry" : "industries"}`
      : null,
    revenue,
    segment.geographies[0] ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  function toggleEnabled(e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      try {
        await toggleSegmentActive(segment.id, !segment.active);
      } catch {
        /* surfaced on reload */
      }
    });
  }

  return (
    <Card
      onClick={onOpen}
      className={cn(
        "flex flex-col cursor-pointer transition-colors hover:border-bone-mute",
        (isPending || !segment.active) && "opacity-60",
      )}
    >
      <div className="px-5 py-4 flex flex-col gap-3 min-h-[124px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Crosshair size={15} strokeWidth={1.5} className="text-track-gold shrink-0" />
            <span className="title-md truncate">{segment.name}</span>
          </div>
          <button
            onClick={toggleEnabled}
            disabled={isPending}
            title={segment.active ? "Disable segment" : "Enable segment"}
            className={cn(
              "mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded-[var(--radius-sm)] border flex items-center gap-1.5 shrink-0 transition-colors",
              segment.active
                ? "border-track-gold/30 text-track-gold/90 bg-track-gold-dim/5"
                : "border-graphite text-bone-mute hover:text-bone",
            )}
          >
            <Power size={10} strokeWidth={1.5} />
            {segment.active ? "Enabled" : "Disabled"}
          </button>
        </div>

        <p className="text-[12px] text-bone-mute leading-relaxed flex-1">{summary || "No criteria yet"}</p>

        <div className="flex items-center justify-between gap-2 pt-1">
          {/* Idle by default; becomes a live "Searching…" pulse during a run (Phase C). */}
          <span className="mono text-[9px] uppercase tracking-[0.12em] text-bone-mute flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-graphite" />
            Idle · never run
          </span>
          <button
            onClick={(e) => e.stopPropagation()}
            disabled
            title="Discovery wiring lands in Phase C"
            className="mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded-[var(--radius-sm)] border border-graphite text-bone-mute flex items-center gap-1.5 opacity-60 cursor-not-allowed"
          >
            <Search size={11} strokeWidth={1.5} />
            Run search
          </button>
        </div>
      </div>
    </Card>
  );
}

// ── Slide-over builder ───────────────────────────────────────────────────────
function SegmentPanel({ segment, onClose }: { segment?: SegmentProp; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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

  function remove() {
    if (!segment) return;
    if (!confirm(`Delete the "${segment.name}" target segment?`)) return;
    startTransition(async () => {
      try {
        await deleteSegment(segment.id);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete segment");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-bitumen/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(
          "h-full w-full max-w-[560px] bg-asphalt shadow-[var(--shadow-lg)] overflow-y-auto flex flex-col transition-transform duration-200 ease-out",
          mounted ? "translate-x-0" : "translate-x-full",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-graphite/60 sticky top-0 bg-asphalt z-10">
          <div className="flex items-center gap-3 min-w-0">
            <Crosshair size={15} strokeWidth={1.5} className="text-track-gold shrink-0" />
            <span className="title-md truncate">{segment ? segment.name : "New target segment"}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              disabled
              title="Discovery wiring lands in Phase C"
              className="mono text-[9px] uppercase tracking-[0.1em] px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-graphite text-bone-mute flex items-center gap-1.5 opacity-60 cursor-not-allowed"
            >
              <Search size={12} strokeWidth={1.5} />
              Run search
            </button>
            <button onClick={onClose} className="text-bone-mute hover:text-bone">
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <form onSubmit={submit} className="px-6 py-5 flex flex-col gap-4 flex-1">
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
            Enabled — available to run searches against
          </label>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1 mt-auto">
            {segment ? (
              <button
                type="button"
                onClick={remove}
                disabled={isPending}
                className="text-[12px] text-bone-mute hover:text-flag-red flex items-center gap-1.5"
              >
                <Trash2 size={13} strokeWidth={1.5} />
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex justify-end gap-2">
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
          </div>
        </form>
      </div>
    </div>
  );
}
