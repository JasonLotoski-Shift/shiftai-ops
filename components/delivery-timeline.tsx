// Feature 4 — Delivery timeline.
//
// Pure presentational: a horizontal date-based progress bar with a "today"
// marker and milestone ticks colored by status. No server calls, no state —
// safe to render directly inside the server-component project page.

import { formatDate, formatCAD } from "@/lib/format";

type MilestoneStatus = "pending" | "in_progress" | "complete" | "at_risk";

export type TimelineMilestone = {
  id: string;
  title: string;
  dueDate: string | Date;
  status: MilestoneStatus;
};

export type TimelineInstallment = {
  id: string;
  label: string;
  amount: number;
  dueDate: string | Date | null;
  status: string; // planned | invoiced | paid
};

interface DeliveryTimelineProps {
  startDate: string | Date;
  targetEndDate: string | Date;
  milestones: TimelineMilestone[];
  budgetFee?: number;
  installments?: TimelineInstallment[];
}

const cad = (n: number) => formatCAD(n).replace("CA$", "$");

function toTime(d: string | Date): number {
  return (typeof d === "string" ? new Date(d) : d).getTime();
}

// Position 0..100 along the [start, end] span, clamped at the edges.
function positionPct(at: number, start: number, end: number): number {
  if (end <= start) return at <= start ? 0 : 100;
  const raw = ((at - start) / (end - start)) * 100;
  return Math.max(0, Math.min(100, raw));
}

// Tick color per status — matches the milestone list palette on the page.
const STATUS_DOT: Record<MilestoneStatus, string> = {
  complete: "bg-diagnostic-steel border-diagnostic-steel",
  in_progress: "bg-track-gold border-track-gold",
  at_risk: "bg-flag-red border-flag-red",
  pending: "bg-graphite-2 border-graphite-2",
};

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  complete: "complete",
  in_progress: "in-progress",
  at_risk: "at-risk",
  pending: "pending",
};

const LEGEND: { status: MilestoneStatus; label: string }[] = [
  { status: "complete", label: "complete" },
  { status: "in_progress", label: "in-progress" },
  { status: "at_risk", label: "at-risk" },
  { status: "pending", label: "pending" },
];

export function DeliveryTimeline({ startDate, targetEndDate, milestones, budgetFee, installments }: DeliveryTimelineProps) {
  const start = toTime(startDate);
  const end = toTime(targetEndDate);
  const now = Date.now();

  const todayPct = positionPct(now, start, end);
  const elapsed = Math.round(todayPct);

  const scheduled = (installments ?? []).reduce((s, i) => s + i.amount, 0);
  const dated = (installments ?? []).filter((i) => i.dueDate);

  return (
    <div className="flex flex-col gap-4">
      {/* Fee summary */}
      {budgetFee !== undefined && (
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-bone-dim">
            Fee <span className="mono text-bone tabular-nums">{cad(budgetFee)}</span>
          </span>
          {installments && installments.length > 0 && (
            <span className="text-bone-mute">
              Scheduled <span className="mono tabular-nums">{cad(scheduled)}</span> of{" "}
              <span className="mono tabular-nums">{cad(budgetFee)}</span>
            </span>
          )}
        </div>
      )}

      {/* Heading row: dates + elapsed */}
      <div className="flex items-center justify-between">
        <span className="label">{formatDate(startDate)}</span>
        <span className="mono text-[11px] text-bone-mute tabular-nums">{elapsed}% elapsed</span>
        <span className="label">{formatDate(targetEndDate)}</span>
      </div>

      {/* Bar */}
      <div className="relative h-2 rounded-[var(--radius-pill)] bg-graphite mt-1 mb-1">
        {/* Elapsed fill */}
        <div
          className="absolute top-0 left-0 h-full rounded-[var(--radius-pill)] bg-track-gold-dim/40"
          style={{ width: `${todayPct}%` }}
        />

        {/* Today marker */}
        <div
          className="absolute -top-1.5 z-10 flex flex-col items-center"
          style={{ left: `${todayPct}%`, transform: "translateX(-50%)" }}
        >
          <div className="w-[2px] h-5 bg-track-gold rounded-[var(--radius-pill)]" />
        </div>

        {/* Milestone ticks */}
        {milestones.map((m) => {
          const pct = positionPct(toTime(m.dueDate), start, end);
          return (
            <div
              key={m.id}
              className="group absolute top-1/2 z-20"
              style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }}
            >
              <div
                className={`w-3 h-3 rounded-[var(--radius-pill)] border ${STATUS_DOT[m.status]}`}
                aria-label={`${m.title} — ${STATUS_LABEL[m.status]}`}
              />
              {/* Hover tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-bitumen border border-graphite px-2 py-1 text-[11px] text-bone shadow-[var(--shadow-sm)] group-hover:block">
                <span className="text-bone">{m.title}</span>
                <span className="text-bone-mute"> · {formatDate(m.dueDate)} · {STATUS_LABEL[m.status]}</span>
              </div>
            </div>
          );
        })}

        {/* Installment markers — below the bar, positioned by due date */}
        {dated.map((inst) => {
          const pct = positionPct(toTime(inst.dueDate as string | Date), start, end);
          const tone =
            inst.status === "paid" ? "bg-diagnostic-steel"
              : inst.status === "invoiced" ? "bg-track-gold"
                : "bg-bone-mute";
          return (
            <div
              key={inst.id}
              className="group absolute top-full mt-1 z-20"
              style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
            >
              <div className={`w-[2px] h-2 ${tone} rounded-[var(--radius-pill)] mx-auto`} aria-label={`${inst.label} — ${cad(inst.amount)}`} />
              <div className="pointer-events-none absolute top-full left-1/2 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-bitumen border border-graphite px-2 py-1 text-[11px] shadow-[var(--shadow-sm)] group-hover:block">
                <span className="text-bone">{inst.label}</span>
                <span className="text-bone-mute"> · </span>
                <span className="mono text-bone tabular-nums">{cad(inst.amount)}</span>
                <span className="text-bone-mute"> · {formatDate(inst.dueDate as string | Date)} · {inst.status}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        {LEGEND.map((l) => (
          <span key={l.status} className="flex items-center gap-1.5 text-[11px] text-bone-mute">
            <span className={`w-2.5 h-2.5 rounded-[var(--radius-pill)] border ${STATUS_DOT[l.status]}`} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
