"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Crosshair,
  Plus,
  X,
  ShieldAlert,
  Trash2,
  Archive,
  RotateCcw,
  Search,
  Sparkles,
  Radar,
  ArrowRight,
  Wand2,
} from "lucide-react";
import { Card, Label, Button, Input, Textarea, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/format";
import {
  createSegment,
  updateSegment,
  toggleSegmentActive,
  deleteSegment,
  draftSegmentAction,
  suggestSegmentTweaks,
} from "@/app/(app)/targeting/actions";
import { runSegmentSearch, getSegmentRunStatus } from "@/app/(app)/targeting/run-actions";
import { ApolloCreditsBox } from "@/components/apollo-credits-box";
import type { ApolloCreditUsage } from "@/lib/apollo-credits";
import { TargetingStatsPanel, type StatsSegmentOption, type TargetingStats } from "@/components/targeting-stats-panel";
import { Section } from "@/components/targeting-builder/section";
import { TagInput } from "@/components/targeting-builder/tag-input";
import { GeographyPicker } from "@/components/targeting-builder/geography-picker";
import { PersonaRows, type Persona } from "@/components/targeting-builder/persona-rows";
import { AnchorRows, type Anchor } from "@/components/targeting-builder/anchor-rows";
import { RevenueBand, EmployeeBand } from "@/components/targeting-builder/firmographics";
import { SearchIntentPreview } from "@/components/targeting-builder/search-intent-preview";

// Suggestion sets for the chip inputs.
const INDUSTRY_SUGGESTIONS = [
  "Automotive Manufacturing",
  "Auto Parts & Suppliers",
  "Industrial Manufacturing",
  "Logistics & Distribution",
  "SaaS",
  "Professional Services",
  "Healthcare",
  "Financial Services",
  "Construction",
  "Energy",
];

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
  buyingSignals: string[];
  disqualifiers: string[];
  personas: Persona[];
  anchors: Anchor[];
  priorityLocation: string | null;
  revealAtDiscovery: "primary" | "all";
  lastOptimizedAt: string | null;
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

type ViewMode = "active" | "archived";

// ── Non-blocking run polling hook (FIX #2) ───────────────────────────────────
// Drives a "Searching…" → "Found N → View" lifecycle for one segment WITHOUT
// blocking the UI. `running` seeds from the server (a running LeadRun on first
// paint) so the indicator survives navigation. While running, it polls
// getSegmentRunStatus every 4s; on "done" it stops, exposes foundCount, and
// refreshes so leadCounts update; on "error" it stops and surfaces the error.
type RunResult = {
  found: number;
  rescued: number;
  ghost: number;
  rejudged: number;
  remaining: number;
};

// Plain, partner-facing one-liner for a finished run, e.g.
// "5 new + 2 rescued · 33 filtered · ~70 left". Falls back to the legacy
// foundCount when the audit breakdown isn't available.
function runResultSummary(r: RunResult): string {
  const parts: string[] = [];
  parts.push(`${r.found} new${r.rescued ? ` + ${r.rescued} rescued` : ""}`);
  const filtered = r.ghost + r.rejudged;
  if (filtered) parts.push(`${filtered} filtered`);
  if (r.remaining) parts.push(`~${r.remaining} left`);
  return parts.join(" · ");
}

function useSegmentRun(
  segmentId: string,
  initiallyRunning: boolean,
  initialResult: RunResult | null = null,
  initialError: string | null = null,
) {
  const router = useRouter();
  const [running, setRunning] = useState(initiallyRunning);
  const [runResult, setRunResult] = useState<RunResult | null>(initialResult);
  const [runError, setRunError] = useState<string | null>(initialError);

  // Keep local `running` in sync if the server prop flips (e.g. router.refresh
  // surfaces a newly-running run after a navigation back).
  useEffect(() => {
    if (initiallyRunning) setRunning(true);
  }, [initiallyRunning]);

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const status = await getSegmentRunStatus(segmentId);
        if (cancelled || !status) return;
        if (status.status === "done") {
          setRunning(false);
          // Prefer the stage-aware breakdown (audit row); fall back to the legacy
          // aggregate columns if it isn't available.
          setRunResult({
            found: status.found ?? status.foundCount,
            rescued: status.rescued ?? 0,
            ghost: status.ghost ?? status.ghostCount,
            rejudged: status.rejudged ?? 0,
            remaining: status.remaining ?? 0,
          });
          router.refresh();
        } else if (status.status === "error") {
          setRunning(false);
          setRunError("Search failed");
        }
      } catch {
        /* transient poll failure — keep polling */
      }
    };
    const id = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [running, segmentId, router]);

  // Fire the (non-blocking) run, then start polling. Awaits only the {runId}
  // return to confirm the run was created — NOT the discovery itself.
  async function start() {
    setRunError(null);
    setRunResult(null);
    try {
      await runSegmentSearch(segmentId);
      setRunning(true);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Search failed");
    }
  }

  return { running, runResult, runError, start };
}

export function TargetingViews({
  segments,
  leadCounts = {},
  hasSuggestions = {},
  runningSegments = {},
  lastRuns = {},
  initialStats,
  statsSegments = [],
  apolloCredits,
}: {
  segments: SegmentProp[];
  leadCounts?: Record<string, number>;
  /** Per-segment id → true when Claude has fresh tuning suggestions (D39). */
  hasSuggestions?: Record<string, boolean>;
  /** Per-segment id → true when a LeadRun is in progress (FIX #2). */
  runningSegments?: Record<string, boolean>;
  /** Per-segment id → latest LeadRun outcome, so a finished run seeds the card. */
  lastRuns?: Record<string, { status: string; found: number; ghost: number }>;
  /** First-paint stats payload (All segments · Last 30d). */
  initialStats?: TargetingStats;
  /** Slim {id,name} list for the stats segment selector. */
  statsSegments?: StatsSegmentOption[];
  /** Apollo email-reveal usage this month (Part E credit box). */
  apolloCredits?: ApolloCreditUsage;
}) {
  // `open` is the segment being viewed/edited in the slide-over, or "new".
  const [open, setOpen] = useState<SegmentProp | "new" | null>(null);
  const [view, setView] = useState<ViewMode>("active");

  const { active, archived } = useMemo(() => {
    const a: SegmentProp[] = [];
    const r: SegmentProp[] = [];
    for (const s of segments) (s.active ? a : r).push(s);
    return { active: a, archived: r };
  }, [segments]);

  const shown = view === "active" ? active : archived;

  const views: { key: ViewMode; label: string; count: number }[] = [
    { key: "active", label: "Active", count: active.length },
    { key: "archived", label: "Archived", count: archived.length },
  ];

  return (
    <div className="px-8 py-8 flex flex-col gap-8">
      <div className="flex items-start justify-between gap-6">
        <p className="text-[13px] text-bone-mute max-w-[640px] leading-relaxed">
          Define <span className="text-bone">who the Lead Agent hunts for</span> — the kinds of companies you want as
          clients. Each segment is a spec the agent searches and rates against. Click a segment to open its builder; run
          a search when you&apos;re ready.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/pipeline?tab=found"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-graphite-2 text-bone-dim hover:text-track-gold hover:border-track-gold/40 font-mono text-[9px] uppercase tracking-wide rounded-[var(--radius-pill)] transition-colors"
          >
            <Radar size={12} strokeWidth={1.5} />
            View AI Found Leads
            <ArrowRight size={12} strokeWidth={1.5} />
          </Link>
          <Button variant="primary" size="sm" onClick={() => setOpen("new")}>
            <Plus size={13} strokeWidth={1.5} />
            New segment
          </Button>
        </div>
      </div>

      {apolloCredits && <ApolloCreditsBox usage={apolloCredits} />}

      <TargetingStatsPanel initialStats={initialStats} segments={statsSegments} />

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
        <>
          {/* Active / Archived switcher (D37). */}
          <div className="flex items-center gap-1 -mb-2">
            {views.map((v) => {
              const on = view === v.key;
              return (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className={cn(
                    "px-3 py-1.5 border font-mono text-[9px] uppercase tracking-wide rounded-[var(--radius-pill)] transition-colors flex items-center gap-1.5",
                    on
                      ? "border-track-gold/40 text-track-gold bg-track-gold-dim/10"
                      : "border-graphite-2 text-bone-mute hover:text-bone-dim",
                  )}
                >
                  {v.label}
                  <span className="tabular-nums opacity-70">{v.count}</span>
                </button>
              );
            })}
          </div>

          {shown.length === 0 ? (
            view === "active" ? (
              <EmptyState
                icon={<Crosshair size={28} strokeWidth={1.5} />}
                title="No active segments"
                hint="Restore one from Archived, or define a new ideal-customer spec."
                action={
                  <Button variant="primary" size="sm" onClick={() => setOpen("new")}>
                    <Plus size={13} strokeWidth={1.5} />
                    New segment
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<Archive size={28} strokeWidth={1.5} />}
                title="Nothing archived"
                hint="Segments you archive collect here. Restore one to return it to Active."
              />
            )
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {shown.map((s) => (
                <SegmentCard
                  key={s.id}
                  segment={s}
                  leadCount={leadCounts[s.id] ?? 0}
                  hasSuggestions={hasSuggestions[s.id] ?? false}
                  initiallyRunning={runningSegments[s.id] ?? false}
                  lastRun={lastRuns[s.id]}
                  onOpen={() => setOpen(s)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {open && (
        <SegmentPanel
          segment={open === "new" ? undefined : open}
          hasSuggestions={open !== "new" && (hasSuggestions[open.id] ?? false)}
          initiallyRunning={open !== "new" && (runningSegments[open.id] ?? false)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
// Clean: name + one-line summary + status + run. The whole card opens the
// builder; the inline controls (enable toggle, run) stop propagation.
function SegmentCard({
  segment,
  leadCount,
  hasSuggestions,
  initiallyRunning,
  lastRun,
  onOpen,
}: {
  segment: SegmentProp;
  leadCount: number;
  hasSuggestions: boolean;
  initiallyRunning: boolean;
  lastRun?: { status: string; found: number; ghost: number };
  onOpen: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Run-search live state (D17/D18 → FIX #2). Non-blocking: the run is kicked off
  // and a LeadRun-driven poll surfaces "Searching…" → "Found N → View". The
  // indicator survives navigation because `running` seeds from the server.
  const initialRunResult: RunResult | null =
    lastRun && lastRun.status === "done"
      ? { found: lastRun.found, rescued: 0, ghost: lastRun.ghost, rejudged: 0, remaining: 0 }
      : null;
  const initialRunError = lastRun && lastRun.status === "error" ? "Last run failed" : null;
  const { running: searching, runResult, runError, start: startSearch } = useSegmentRun(
    segment.id, initiallyRunning, initialRunResult, initialRunError,
  );
  const revenue = band(segment.revenueMin, segment.revenueMax, true);
  const summary = [
    segment.industries.length
      ? `${segment.industries.length} ${segment.industries.length === 1 ? "industry" : "industries"}`
      : null,
    revenue,
    segment.priorityLocation ?? segment.geographies[0] ?? null,
    segment.personas.length
      ? `${segment.personas.length} ${segment.personas.length === 1 ? "persona" : "personas"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function toggleArchive(e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      try {
        await toggleSegmentActive(segment.id, !segment.active);
        router.refresh();
      } catch {
        /* surfaced on reload */
      }
    });
  }

  function runSearch(e: React.MouseEvent) {
    e.stopPropagation();
    void startSearch();
  }

  return (
    <Card
      onClick={onOpen}
      className={cn(
        "flex flex-col cursor-pointer transition-colors hover:border-bone-mute",
        isPending && "opacity-60",
      )}
    >
      <div className="px-5 py-4 flex flex-col gap-3 min-h-[124px]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Crosshair size={15} strokeWidth={1.5} className="text-track-gold shrink-0" />
            <span className="title-md truncate">{segment.name}</span>
          </div>
          {segment.active ? (
            <button
              onClick={toggleArchive}
              disabled={isPending}
              title="Archive segment"
              className="mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded-[var(--radius-sm)] border border-graphite text-bone-mute hover:text-bone flex items-center gap-1.5 shrink-0 transition-colors"
            >
              <Archive size={10} strokeWidth={1.5} />
              Archive
            </button>
          ) : (
            <button
              onClick={toggleArchive}
              disabled={isPending}
              title="Restore segment"
              className="mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded-[var(--radius-sm)] border border-track-gold/30 text-track-gold/90 bg-track-gold-dim/5 hover:bg-track-gold-dim/10 flex items-center gap-1.5 shrink-0 transition-colors"
            >
              <RotateCcw size={10} strokeWidth={1.5} />
              Restore
            </button>
          )}
        </div>

        {hasSuggestions && (
          <span className="mono text-[9px] uppercase tracking-[0.12em] text-track-gold/90 flex items-center gap-1.5 self-start">
            <Wand2 size={10} strokeWidth={1.5} />
            Claude has suggestions
          </span>
        )}

        <p className="text-[12px] text-bone-mute leading-relaxed flex-1">{summary || "No criteria yet"}</p>

        <div className="flex items-center justify-between gap-2 pt-1">
          {/* Status / live "Searching…" pulse / run result, then found-lead link. */}
          {searching ? (
            <span className="mono text-[9px] uppercase tracking-[0.12em] text-track-gold/90 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-track-gold animate-pulse" />
              Searching…
            </span>
          ) : runResult ? (
            <Link
              href={`/pipeline?tab=found&segment=${segment.id}`}
              onClick={(e) => e.stopPropagation()}
              title={`${runResultSummary(runResult)} — view this segment's found leads`}
              className="mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded-[var(--radius-sm)] border border-track-gold/30 text-track-gold/90 bg-track-gold-dim/5 hover:bg-track-gold-dim/10 flex items-center gap-1.5 transition-colors"
            >
              <Radar size={10} strokeWidth={1.5} />
              {runResultSummary(runResult)} → View
            </Link>
          ) : runError ? (
            <span className="mono text-[9px] uppercase tracking-[0.12em] text-flag-red flex items-center gap-1.5" title={runError}>
              <span className="w-1.5 h-1.5 rounded-full bg-flag-red" />
              Search failed
            </span>
          ) : leadCount > 0 ? (
            // Found-lead count → deep-link into the AI Found Leads tab, filtered.
            <Link
              href={`/pipeline?tab=found&segment=${segment.id}`}
              onClick={(e) => e.stopPropagation()}
              title="View this segment's found leads"
              className="mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded-[var(--radius-sm)] border border-track-gold/30 text-track-gold/90 bg-track-gold-dim/5 hover:bg-track-gold-dim/10 flex items-center gap-1.5 transition-colors"
            >
              <Radar size={10} strokeWidth={1.5} />
              {leadCount} {leadCount === 1 ? "lead" : "leads"}
            </Link>
          ) : (
            <span className="mono text-[9px] uppercase tracking-[0.12em] text-bone-mute flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-graphite" />
              Idle · never run
            </span>
          )}
          <button
            onClick={runSearch}
            disabled={searching}
            title="Run the Discovery Engine for this segment (runs in the background — you can navigate away)"
            className="mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded-[var(--radius-sm)] border border-graphite text-bone-dim hover:text-track-gold hover:border-track-gold/40 flex items-center gap-1.5 transition-colors disabled:opacity-60 disabled:cursor-wait"
          >
            <Search size={11} strokeWidth={1.5} />
            {searching ? "Searching…" : "Run search"}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ── Slide-over builder ───────────────────────────────────────────────────────
function SegmentPanel({
  segment,
  hasSuggestions = false,
  initiallyRunning = false,
  onClose,
}: {
  segment?: SegmentProp;
  hasSuggestions?: boolean;
  initiallyRunning?: boolean;
  onClose: () => void;
}) {
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
  const [industries, setIndustries] = useState<string[]>(segment?.industries ?? []);
  const [geographies, setGeographies] = useState<string[]>(segment?.geographies ?? []);
  const [priorityLocation, setPriorityLocation] = useState<string | null>(
    segment?.priorityLocation ?? null,
  );
  const [personas, setPersonas] = useState<Persona[]>(segment?.personas ?? []);
  const [buyingSignals, setBuyingSignals] = useState<string[]>(segment?.buyingSignals ?? []);
  const [disqualifiers, setDisqualifiers] = useState<string[]>(segment?.disqualifiers ?? []);
  const [anchors, setAnchors] = useState<Anchor[]>(segment?.anchors ?? []);
  const [revealAtDiscovery, setRevealAtDiscovery] = useState<"primary" | "all">(
    segment?.revealAtDiscovery ?? "primary",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Run-search from the panel header (existing segments only, D17/D18 → FIX #2).
  // Non-blocking: kicks off the run and polls the LeadRun for "Searching…" →
  // "Found N → View". `segment.id` is "" for the new-segment panel (the header
  // run button only renders when `segment` exists, so the poll never fires).
  const {
    running: searching,
    runResult,
    runError: searchError,
    start: startSearch,
  } = useSegmentRun(segment?.id ?? "", initiallyRunning);

  function runSearch() {
    if (!segment) return;
    void startSearch();
  }

  // ── Draft with Claude (panel-local; NEVER saved to the segment) ──
  const [brief, setBrief] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [highlight, setHighlight] = useState(false);

  // ── Suggested tweaks (Segment Optimizer, D39 — existing segments only) ──
  const [tweaking, setTweaking] = useState(false);
  const [tweakResult, setTweakResult] = useState<Awaited<ReturnType<typeof suggestSegmentTweaks>> | null>(null);
  // Which suggestions are checked for "Apply selected" (defaults to all).
  const [picked, setPicked] = useState<Set<number>>(new Set());
  // FIX #1: count of tweaks just applied (null = no confirmation banner). Set at
  // the two tweak Apply call sites (NOT inside applyDraftFields, so "Draft with
  // Claude" never triggers it). Drives an explicit "Applied N tweak(s)" banner.
  const [appliedTweaks, setAppliedTweaks] = useState<number | null>(null);

  // Auto-clear the AI-filled ring after a few seconds.
  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(false), 4000);
    return () => clearTimeout(t);
  }, [highlight]);

  // Auto-clear the "Applied N tweak(s)" confirmation after a few seconds (lingers
  // slightly past the field ring so the explicit confirmation reads last).
  useEffect(() => {
    if (appliedTweaks === null) return;
    const t = setTimeout(() => setAppliedTweaks(null), 5000);
    return () => clearTimeout(t);
  }, [appliedTweaks]);

  // Removing a starred geography elsewhere clears priority; keep it consistent
  // if geographies no longer contain the starred value.
  function handleGeographies(next: string[]) {
    setGeographies(next);
    if (priorityLocation && !next.includes(priorityLocation)) setPriorityLocation(null);
  }

  // Merge proposed values into the form. `only` (a set of proposed keys) limits
  // which fields are applied; omit it to apply everything. NEVER blanks a field
  // the partner already filled when the model returns empty for it.
  function applyDraftFields(
    d: Awaited<ReturnType<typeof draftSegmentAction>>,
    only?: Set<string>,
  ) {
    const want = (k: string) => !only || only.has(k);
    if (want("description") && d.description) setDescription(d.description);
    if (want("industries") && d.industries.length) setIndustries(d.industries);
    if (want("buyingSignals") && d.buyingSignals.length) setBuyingSignals(d.buyingSignals);
    if (want("disqualifiers") && d.disqualifiers.length) setDisqualifiers(d.disqualifiers);
    if (want("personas") && d.personas.length) setPersonas(d.personas);
    if (want("anchors") && d.anchors.length) setAnchors(d.anchors);
    if (want("revenueMin") && d.revenueMin != null) setRevenueMin(String(d.revenueMin));
    if (want("revenueMax") && d.revenueMax != null) setRevenueMax(String(d.revenueMax));
    if (want("employeeMin") && d.employeeMin != null) setEmployeeMin(String(d.employeeMin));
    if (want("employeeMax") && d.employeeMax != null) setEmployeeMax(String(d.employeeMax));

    // Geographies first, then priority — validated against the NEW list, and
    // routed so the priority-consistency invariant runs.
    if (want("geographies") || want("priorityLocation")) {
      const nextGeo = want("geographies") && d.geographies.length ? d.geographies : geographies;
      setGeographies(nextGeo);
      const nextPriority =
        want("priorityLocation") && d.priorityLocation && nextGeo.includes(d.priorityLocation)
          ? d.priorityLocation
          : priorityLocation && nextGeo.includes(priorityLocation)
            ? priorityLocation
            : null;
      setPriorityLocation(nextPriority);
    }

    setHighlight(true);
  }

  // The drafter applies the whole draft.
  const applyDraft = (d: Awaited<ReturnType<typeof draftSegmentAction>>) => applyDraftFields(d);

  // Map a suggestion's free-text `field` to the proposed keys it touches, so
  // "Apply selected" only writes the fields for the checked suggestions.
  function proposedKeysForField(field: string): string[] {
    const f = field.toLowerCase();
    const ks: string[] = [];
    if (/industr/.test(f)) ks.push("industries");
    if (/geograph|location|region|countr|provinc|\bstate\b|\bgeo\b/.test(f)) ks.push("geographies", "priorityLocation");
    if (/persona|seniorit|department|title|buyer|decision/.test(f)) ks.push("personas");
    if (/revenue/.test(f)) ks.push("revenueMin", "revenueMax");
    if (/employee|headcount|\bsize\b|staff/.test(f)) ks.push("employeeMin", "employeeMax");
    if (/signal|trigger/.test(f)) ks.push("buyingSignals");
    if (/disqualif|exclu/.test(f)) ks.push("disqualifiers");
    if (/anchor|example|reference/.test(f)) ks.push("anchors");
    if (/descript/.test(f)) ks.push("description");
    return ks;
  }

  async function draft() {
    if (!name.trim() || !brief.trim()) {
      setError("Add a name and a short brief first");
      return;
    }
    setError(null);
    setDrafting(true);
    try {
      const d = await draftSegmentAction({
        name,
        brief,
        current: {
          description,
          industries,
          revenueMin,
          revenueMax,
          employeeMin,
          employeeMax,
          geographies,
          priorityLocation,
          personas,
          buyingSignals,
          disqualifiers,
          anchors,
        },
      });
      applyDraft(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft failed");
    } finally {
      setDrafting(false);
    }
  }

  async function tweak() {
    if (!segment) return;
    setError(null);
    setTweaking(true);
    try {
      const r = await suggestSegmentTweaks(segment.id);
      setTweakResult(r);
      setPicked(new Set(r.suggestions.map((_, i) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get suggestions");
    } finally {
      setTweaking(false);
    }
  }

  const intentState = useMemo(
    () => ({
      industries,
      geographies,
      priorityLocation,
      revenueMin,
      revenueMax,
      employeeMin,
      employeeMax,
      personas,
    }),
    [industries, geographies, priorityLocation, revenueMin, revenueMax, employeeMin, employeeMax, personas],
  );

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
          buyingSignals,
          disqualifiers,
          personas,
          anchors,
          priorityLocation,
          revealAtDiscovery,
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
            {segment &&
              (searching ? (
                <span className="mono text-[9px] uppercase tracking-[0.12em] text-track-gold/90 flex items-center gap-1.5 px-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-track-gold animate-pulse" />
                  Searching…
                </span>
              ) : runResult ? (
                <Link
                  href={`/pipeline?tab=found&segment=${segment.id}`}
                  title={`${runResultSummary(runResult)} — view this segment's found leads`}
                  className="mono text-[9px] uppercase tracking-[0.1em] px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-track-gold/30 text-track-gold/90 bg-track-gold-dim/5 hover:bg-track-gold-dim/10 flex items-center gap-1.5 transition-colors"
                >
                  <Radar size={12} strokeWidth={1.5} />
                  {runResultSummary(runResult)} → View
                </Link>
              ) : searchError ? (
                <button
                  type="button"
                  onClick={runSearch}
                  title={searchError}
                  className="mono text-[9px] uppercase tracking-[0.1em] px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-flag-red/40 text-flag-red bg-flag-red/5 flex items-center gap-1.5 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-flag-red" />
                  Search failed · Retry
                </button>
              ) : (
                <button
                  type="button"
                  onClick={runSearch}
                  title="Run the Discovery Engine for this segment (runs in the background — you can navigate away)"
                  className="mono text-[9px] uppercase tracking-[0.1em] px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-graphite text-bone-dim hover:text-track-gold hover:border-track-gold/40 flex items-center gap-1.5 transition-colors"
                >
                  <Search size={12} strokeWidth={1.5} />
                  Run search
                </button>
              ))}
            <button onClick={onClose} className="text-bone-mute hover:text-bone">
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <form
          onSubmit={submit}
          onFocusCapture={() => {
            if (highlight) setHighlight(false);
            if (appliedTweaks !== null) setAppliedTweaks(null);
          }}
          className="px-6 py-3 flex flex-col flex-1"
        >
          <Section title="Identity" defaultOpen>
            {/* Draft with Claude — type a name + brief, Claude fills the rest. */}
            <div className="flex flex-col gap-2 p-3 border border-graphite/60 bg-bitumen/40 rounded-[var(--radius)]">
              <Label>Describe who you want — Claude drafts the rest</Label>
              <Textarea
                rows={2}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="e.g. mid-market Ontario auto-parts manufacturers modernizing their ERP"
                disabled={drafting}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-bone-mute leading-relaxed">
                  Fills the form below. Nothing is saved — review, then Save.
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={draft}
                  disabled={drafting || !name.trim() || !brief.trim()}
                >
                  <Sparkles size={13} strokeWidth={1.5} />
                  {drafting ? "Drafting…" : "Draft with Claude"}
                </Button>
              </div>
            </div>

            {highlight && (
              <div className="flex items-center gap-2 px-3 py-2 border border-track-gold/40 bg-track-gold-dim/5 rounded-[var(--radius)]">
                <Sparkles size={13} strokeWidth={1.5} className="text-track-gold shrink-0" />
                <span className="mono text-[9px] uppercase tracking-[0.12em] text-track-gold/90">
                  Drafted — review &amp; Save
                </span>
              </div>
            )}

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

            <div
              className={cn(
                "flex flex-col gap-2 transition-shadow duration-300",
                highlight && "ring-1 ring-track-gold/40 rounded-[var(--radius)]",
              )}
            >
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

            <label className="flex items-center gap-2 text-[12px] text-bone-dim cursor-pointer select-none">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                disabled={isPending}
                className="accent-track-gold"
              />
              Active (uncheck to archive)
            </label>
          </Section>

          <Section title="Firmographics">
            <div
              className={cn(
                "flex flex-col gap-2 transition-shadow duration-300",
                highlight && "ring-1 ring-track-gold/40 rounded-[var(--radius)]",
              )}
            >
              <Label>Industries</Label>
              <TagInput
                value={industries}
                onChange={setIndustries}
                placeholder="Type an industry, press Enter…"
                suggestions={INDUSTRY_SUGGESTIONS}
                disabled={isPending}
              />
            </div>

            <RevenueBand
              min={revenueMin}
              max={revenueMax}
              onMin={setRevenueMin}
              onMax={setRevenueMax}
              disabled={isPending}
            />

            <EmployeeBand
              min={employeeMin}
              max={employeeMax}
              onMin={setEmployeeMin}
              onMax={setEmployeeMax}
              disabled={isPending}
            />

            <div
              className={cn(
                "flex flex-col gap-2 transition-shadow duration-300",
                highlight && "ring-1 ring-track-gold/40 rounded-[var(--radius)]",
              )}
            >
              <Label>Geographies</Label>
              <GeographyPicker
                value={geographies}
                priorityLocation={priorityLocation}
                onChange={handleGeographies}
                onPriorityChange={setPriorityLocation}
                disabled={isPending}
              />
            </div>
          </Section>

          <Section title="Who we sell to">
            <div
              className={cn(
                "flex flex-col gap-2 transition-shadow duration-300",
                highlight && "ring-1 ring-track-gold/40 rounded-[var(--radius)]",
              )}
            >
              <Label>Personas</Label>
              <PersonaRows value={personas} onChange={setPersonas} disabled={isPending} />
            </div>

            {/* Reveal-email policy at discovery (PART B). "All" reveals every found
                contact's email — 1 Apollo credit each — so it can burn the monthly
                budget faster than "Primary only". */}
            <div className="flex flex-col gap-2">
              <Label>Reveal emails at discovery</Label>
              <div className="flex items-center gap-1.5 p-1 border border-graphite/60 bg-bitumen/40 rounded-[var(--radius)] w-fit">
                {(
                  [
                    { key: "primary" as const, label: "Primary only" },
                    { key: "all" as const, label: "All contacts" },
                  ]
                ).map((opt) => {
                  const on = revealAtDiscovery === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setRevealAtDiscovery(opt.key)}
                      disabled={isPending}
                      className={cn(
                        "mono text-[9px] uppercase tracking-[0.1em] px-2.5 py-1.5 rounded-[var(--radius-sm)] transition-colors",
                        on
                          ? "bg-track-gold-dim/15 text-track-gold border border-track-gold/40"
                          : "text-bone-mute hover:text-bone border border-transparent",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] text-bone-mute leading-relaxed">
                {revealAtDiscovery === "all"
                  ? "Reveals every found contact's email — spends 1 Apollo credit per contact, per company."
                  : "Reveals only the best-fit contact's email per company (1 credit each)."}
              </span>
            </div>
          </Section>

          <Section title="Signals & references">
            <div
              className={cn(
                "flex flex-col gap-2 transition-shadow duration-300",
                highlight && "ring-1 ring-track-gold/40 rounded-[var(--radius)]",
              )}
            >
              <Label>Buying signals</Label>
              <TagInput
                value={buyingSignals}
                onChange={setBuyingSignals}
                placeholder="e.g. New ERP rollout"
                disabled={isPending}
              />
            </div>
            <div
              className={cn(
                "flex flex-col gap-2 transition-shadow duration-300",
                highlight && "ring-1 ring-track-gold/40 rounded-[var(--radius)]",
              )}
            >
              <Label>Disqualifiers</Label>
              <TagInput
                value={disqualifiers}
                onChange={setDisqualifiers}
                placeholder="e.g. Under $25M revenue"
                disabled={isPending}
              />
            </div>
            <div
              className={cn(
                "flex flex-col gap-2 transition-shadow duration-300",
                highlight && "ring-1 ring-track-gold/40 rounded-[var(--radius)]",
              )}
            >
              <Label>Anchor companies</Label>
              <AnchorRows value={anchors} onChange={setAnchors} disabled={isPending} />
            </div>
          </Section>

          <div className="pt-4">
            <SearchIntentPreview state={intentState} />
          </div>

          {/* Suggested tweaks (Segment Optimizer, D39) — existing segments only. */}
          {segment && (
            <div className="flex flex-col gap-3 p-3 mt-4 border border-graphite/60 bg-bitumen/40 rounded-[var(--radius)]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <Label>Suggested tweaks</Label>
                  <span className="text-[11px] text-bone-mute leading-relaxed">
                    Claude reads this segment&apos;s run results and proposes refinements.
                  </span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={tweak}
                  disabled={tweaking}
                  className={cn(hasSuggestions && !tweakResult && "ring-1 ring-track-gold/50")}
                >
                  <Wand2 size={13} strokeWidth={1.5} />
                  {tweaking ? "Analyzing…" : "Suggest tweaks"}
                </Button>
              </div>

              {tweakResult && (
                <div className="flex flex-col gap-3">
                  <p className="text-[12px] text-bone-dim leading-relaxed">{tweakResult.summary}</p>

                  {tweakResult.suggestions.length > 0 && (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-bone-mute">Pick the tweaks to apply, then Save.</span>
                        <button
                          type="button"
                          onClick={() =>
                            setPicked((prev) =>
                              prev.size === tweakResult.suggestions.length
                                ? new Set()
                                : new Set(tweakResult.suggestions.map((_, i) => i)),
                            )
                          }
                          className="mono text-[9px] uppercase tracking-[0.1em] text-bone-mute hover:text-bone shrink-0"
                        >
                          {picked.size === tweakResult.suggestions.length ? "Clear all" : "Select all"}
                        </button>
                      </div>
                      <ul className="flex flex-col gap-2">
                        {tweakResult.suggestions.map((s, i) => {
                          const on = picked.has(i);
                          return (
                            <li key={i}>
                              <label
                                className={cn(
                                  "flex gap-2.5 px-3 py-2 border rounded-[var(--radius-sm)] cursor-pointer transition-colors",
                                  on
                                    ? "border-track-gold/40 bg-track-gold-dim/5"
                                    : "border-graphite/60 bg-asphalt hover:border-bone-mute",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() =>
                                    setPicked((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(i)) next.delete(i);
                                      else next.add(i);
                                      return next;
                                    })
                                  }
                                  className="accent-track-gold mt-0.5 shrink-0"
                                />
                                <div className="flex flex-col gap-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="mono text-[9px] uppercase tracking-[0.12em] text-track-gold/90">
                                      {s.field}
                                    </span>
                                    <span className="text-[12px] text-bone">{s.change}</span>
                                  </div>
                                  <span className="text-[11px] text-bone-mute leading-relaxed">{s.reason}</span>
                                </div>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => {
                        applyDraftFields(tweakResult.proposed);
                        setAppliedTweaks(tweakResult.suggestions.length);
                      }}
                    >
                      Apply all
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      disabled={picked.size === 0}
                      onClick={() => {
                        const count = picked.size;
                        const keys = new Set<string>();
                        tweakResult.suggestions.forEach((s, i) => {
                          if (picked.has(i)) proposedKeysForField(s.field).forEach((k) => keys.add(k));
                        });
                        applyDraftFields(tweakResult.proposed, keys);
                        setAppliedTweaks(count);
                      }}
                    >
                      <Sparkles size={13} strokeWidth={1.5} />
                      Apply selected ({picked.size})
                    </Button>
                  </div>

                  {/* FIX #1: explicit confirmation banner — nothing is saved until Save. */}
                  {appliedTweaks !== null && (
                    <div className="flex items-start gap-2 px-3 py-2 border border-track-gold/40 bg-track-gold-dim/5 rounded-[var(--radius)]">
                      <Wand2 size={13} strokeWidth={1.5} className="text-track-gold shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-0.5">
                        <span className="mono text-[9px] uppercase tracking-[0.12em] text-track-gold/90">
                          Applied {appliedTweaks} tweak{appliedTweaks === 1 ? "" : "s"}
                        </span>
                        <span className="text-[11px] text-bone-mute leading-relaxed">
                          Review the highlighted fields below — nothing is saved until you press Save.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 mt-3 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-4 mt-auto">
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
