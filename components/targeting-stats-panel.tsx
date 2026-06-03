"use client";

// TargetingStatsPanel (D38) — a collapsible Statistics panel that sits above the
// segment grid on the Targeting page. A filter bar (segment selector + time
// range) drives a server action (getTargetingStats); the panel renders four
// metric groups: leads & score spread (with a histogram), the conversion funnel
// (with a proportional bar), run performance, and outreach response rate.
//
// First paint uses the `initialStats` payload from the page (All segments ·
// Last 30d) so there's no fetch flash; changing a filter refetches in a
// transition.

import { useState, useTransition } from "react";
import { ChevronDown, BarChart3 } from "lucide-react";
import { Label } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { getTargetingStats, type TargetingStats } from "@/app/(app)/targeting/stats-actions";

export type { TargetingStats } from "@/app/(app)/targeting/stats-actions";
export type StatsSegmentOption = { id: string; name: string };

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "7", label: "7d", days: 7 },
  { key: "30", label: "30d", days: 30 },
  { key: "90", label: "90d", days: 90 },
  { key: "all", label: "All", days: null },
];

const INITIAL_RANGE = "30"; // page seeds initialStats at Last 30d

function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 100);
}

export function TargetingStatsPanel({
  initialStats,
  segments = [],
}: {
  initialStats?: TargetingStats;
  segments?: StatsSegmentOption[];
}) {
  const [openPanel, setOpenPanel] = useState(false);
  const [segmentId, setSegmentId] = useState<string>(""); // "" = All segments
  const [range, setRange] = useState<string>(INITIAL_RANGE);
  const [stats, setStats] = useState<TargetingStats | undefined>(initialStats);
  const [isPending, startTransition] = useTransition();

  function refetch(nextSegment: string, nextRange: string) {
    const days = RANGES.find((r) => r.key === nextRange)?.days ?? null;
    startTransition(async () => {
      try {
        const next = await getTargetingStats(nextSegment || null, days);
        setStats(next);
      } catch {
        /* leaves the prior payload in place */
      }
    });
  }

  function onSegment(v: string) {
    setSegmentId(v);
    refetch(v, range);
  }
  function onRange(v: string) {
    setRange(v);
    refetch(segmentId, v);
  }

  return (
    <div className="border border-graphite/60 bg-asphalt rounded-[var(--radius)]">
      {/* Header — click to collapse/expand. */}
      <button
        type="button"
        onClick={() => setOpenPanel((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5"
      >
        <div className="flex items-center gap-2.5">
          <BarChart3 size={15} strokeWidth={1.5} className="text-track-gold" />
          <span className="title-md">Statistics</span>
          <span className="mono text-[9px] uppercase tracking-[0.12em] text-bone-mute">Targeting performance</span>
        </div>
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          className={cn("text-bone-mute transition-transform", openPanel && "rotate-180")}
        />
      </button>

      {openPanel && (
        <div className="px-5 pb-5 flex flex-col gap-6 border-t border-graphite/60 pt-5">
          {/* Filter bar. */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Label>Segment</Label>
              <select
                value={segmentId}
                onChange={(e) => onSegment(e.target.value)}
                disabled={isPending}
                className="bg-bitumen border border-graphite-2 text-bone text-[12px] rounded-[var(--radius-sm)] px-2.5 py-1.5 focus:outline-none focus:border-track-gold/50 disabled:opacity-50"
              >
                <option value="">All segments</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Time range</Label>
              <div className="flex items-center gap-1">
                {RANGES.map((r) => {
                  const on = range === r.key;
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => onRange(r.key)}
                      disabled={isPending}
                      className={cn(
                        "px-2.5 py-1 border font-mono text-[9px] uppercase tracking-wide rounded-[var(--radius-pill)] transition-colors disabled:opacity-50",
                        on
                          ? "border-track-gold/40 text-track-gold bg-track-gold-dim/10"
                          : "border-graphite-2 text-bone-mute hover:text-bone-dim",
                      )}
                    >
                      Last {r.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {stats && (
            <div className={cn("flex flex-col gap-6 transition-opacity", isPending && "opacity-50")}>
              {/* Group 1 — Leads & score spread. */}
              <Group title="Leads & score spread">
                <div className="flex flex-wrap gap-8">
                  <Tile label="Leads found" value={stats.leads.total} />
                  <Tile label="Avg fit score" value={stats.leads.total ? `${stats.leads.avgScore}` : 0} gold />
                  <Tile label="High-fit (8+)" value={stats.leads.highFit} gold />
                  <Histogram data={stats.leads.histogram} />
                </div>
              </Group>

              {/* Group 2 — Conversion funnel. */}
              <Group title="Conversion funnel">
                <FunnelBar funnel={stats.funnel} />
              </Group>

              {/* Group 3 — Run performance. */}
              <Group title="Run performance">
                <div className="flex flex-wrap gap-8">
                  <Tile label="Runs" value={stats.runs.count} />
                  <Tile label="Candidates evaluated" value={stats.runs.evaluated} />
                  <Tile label="Found" value={stats.runs.found} gold />
                  <Tile label="Filtered out" value={stats.runs.filtered} />
                  <Tile
                    label="Last run"
                    value={stats.runs.lastRunAt ? formatDate(stats.runs.lastRunAt) : "—"}
                  />
                </div>
              </Group>

              {/* Group 4 — Outreach response rate. */}
              <Group title="Outreach response rate">
                <div className="flex flex-wrap items-end gap-8">
                  <Tile label="Emails sent" value={stats.outreach.emailsSent} />
                  <Tile label="Replies" value={stats.outreach.replies} gold />
                  <Tile
                    label="Reply rate"
                    value={`${pct(stats.outreach.replies, stats.outreach.emailsSent)}%`}
                  />
                </div>
                <p className="text-[11px] text-bone-mute leading-relaxed">
                  Reply tracking is manual until the Gmail integration lands — replies are counted from deals marked
                  replied.
                </p>
              </Group>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="mono text-[9px] uppercase tracking-[0.14em] text-bone-dim">{title}</span>
      {children}
    </div>
  );
}

function Tile({ label, value, gold = false }: { label: string; value: string | number; gold?: boolean }) {
  const isZero = /^(\$?0|0|—|0%)$/.test(String(value).trim());
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div
        className={cn(
          "font-mono font-medium tabular-nums text-[24px] leading-none",
          isZero ? "text-bone-mute" : gold ? "text-track-gold" : "text-bone",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Histogram({ data }: { data: TargetingStats["leads"]["histogram"] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex flex-col gap-2">
      <Label>Score spread</Label>
      <div className="flex items-end gap-2 h-[48px]">
        {data.map((d) => (
          <div key={d.bucket} className="flex flex-col items-center gap-1 justify-end">
            <span className="mono text-[9px] tabular-nums text-bone-mute">{d.count}</span>
            <div
              className="w-6 rounded-[2px] bg-track-gold/70"
              style={{ height: `${Math.max(2, (d.count / max) * 36)}px` }}
            />
            <span className="mono text-[8px] tabular-nums text-bone-mute">{d.bucket}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FunnelBar({ funnel }: { funnel: TargetingStats["funnel"] }) {
  const steps: { label: string; value: number }[] = [
    { label: "Found", value: funnel.found },
    { label: "Added", value: funnel.added },
    { label: "Qualified", value: funnel.qualified },
    { label: "Won", value: funnel.won },
  ];
  const max = Math.max(1, funnel.found);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-3">
        {steps.map((s, i) => {
          // Step conversion % relative to the previous step.
          const prev = i === 0 ? null : steps[i - 1].value;
          const stepPct = prev === null ? null : pct(s.value, prev);
          const isZero = s.value === 0;
          return (
            <div key={s.label} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-1">
                <span className="mono text-[9px] uppercase tracking-[0.1em] text-bone-mute">{s.label}</span>
                {stepPct !== null && (
                  <span className="mono text-[9px] tabular-nums text-bone-mute">{stepPct}%</span>
                )}
              </div>
              <span
                className={cn(
                  "font-mono font-medium tabular-nums text-[22px] leading-none",
                  isZero ? "text-bone-mute" : i === steps.length - 1 ? "text-track-gold" : "text-bone",
                )}
              >
                {s.value}
              </span>
              <div className="h-1.5 rounded-[var(--radius-pill)] bg-bitumen overflow-hidden">
                <div
                  className="h-full rounded-[var(--radius-pill)] bg-track-gold/70"
                  style={{ width: `${Math.max(2, (s.value / max) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
