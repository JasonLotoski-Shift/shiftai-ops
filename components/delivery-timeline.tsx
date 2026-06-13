// Delivery timeline — presentational, shared-axis marker bar.
//
// Pure: no server calls, no state. Takes a single flat list of markers
// (milestones, installments, invoice-sent, invoice-paid) already placed on
// the [startDate, targetEndDate] span, and lays them out with a today marker,
// collision-stacking, and hover tooltips. The interactive wrapper that builds
// the marker list + the edit legend lives in project-timeline.tsx.

import { Check } from "lucide-react";
import { formatDate } from "@/lib/format";

export type TimelineMarkerKind = "milestone" | "installment" | "invoice-sent" | "invoice-paid";

// Tone keys map to the brand palette below — kept abstract so the wrapper
// doesn't hard-code colour classes.
export type TimelineMarkerTone =
  | "steel" // diagnostic-steel — complete / paid
  | "gold" // track-gold — milestones
  | "red" // flag-red — at-risk
  | "bone-mute" // muted — planned
  | "neutral" // graphite — pending
  | "orange" // signal-warming — installments
  | "green-light" // invoice-sent — invoice sent
  | "green-deep"; // invoice-paid — invoice paid

export type TimelineMarker = {
  id: string;
  kind: TimelineMarkerKind;
  date: Date;
  numberLabel?: string; // "M1" / "B1" — milestone & installment only
  title: string;
  detail?: string;
  tone: TimelineMarkerTone;
};

interface DeliveryTimelineProps {
  startDate: string | Date;
  targetEndDate: string | Date;
  markers: TimelineMarker[];
  // Compact mode (list rows): drops the date heading + kind legend, keeps the
  // axis, today-marker, dots and hover tooltips. The full detail-page view
  // omits this prop and renders everything.
  compact?: boolean;
}

// ── geometry ───────────────────────────────────────────────────────────
// Markers within THRESHOLD_PCT of a bucket anchor stack vertically instead
// of overlapping. Each stack level drops the marker by ROW_HEIGHT px; the
// band height grows to fit the deepest bucket.
const THRESHOLD_PCT = 4;
const ROW_HEIGHT = 26; // px per stacked level
const BASE_BAND = 56; // px — single-row band height (room for label + dot)

function toTime(d: string | Date): number {
  return (typeof d === "string" ? new Date(d) : d).getTime();
}

// Position 0..100 along the [start, end] span, clamped at the edges.
function positionPct(at: number, start: number, end: number): number {
  if (end <= start) return at <= start ? 0 : 100;
  const raw = ((at - start) / (end - start)) * 100;
  return Math.max(0, Math.min(100, raw));
}

// Dot / glyph colour per tone — light+dark safe via tokens.
const TONE_DOT: Record<TimelineMarkerTone, string> = {
  steel: "bg-diagnostic-steel border-diagnostic-steel",
  gold: "bg-track-gold border-track-gold",
  red: "bg-flag-red border-flag-red",
  "bone-mute": "bg-bone-mute border-bone-mute",
  neutral: "bg-graphite-2 border-graphite-2",
  orange: "bg-signal-warming border-signal-warming",
  "green-light": "bg-invoice-sent border-invoice-sent",
  "green-deep": "bg-invoice-paid border-invoice-paid",
};

const TONE_TEXT: Record<TimelineMarkerTone, string> = {
  steel: "text-diagnostic-steel",
  gold: "text-track-gold",
  red: "text-flag-red",
  "bone-mute": "text-bone-mute",
  neutral: "text-bone-mute",
  orange: "text-signal-warming",
  "green-light": "text-invoice-sent",
  "green-deep": "text-invoice-paid",
};

type PlacedMarker = TimelineMarker & { pct: number; stackIndex: number };

// Greedy left-to-right bucketing: sort by pct, open a new bucket whenever the
// next marker sits more than THRESHOLD_PCT past the current bucket's anchor.
// Within a bucket each marker gets an incrementing stack index.
function placeMarkers(markers: TimelineMarker[], start: number, end: number): { placed: PlacedMarker[]; maxStack: number } {
  const sorted = markers
    .map((m) => ({ ...m, pct: positionPct(toTime(m.date), start, end), stackIndex: 0 }))
    .sort((a, b) => a.pct - b.pct);

  let anchorPct = -Infinity;
  let stack = 0;
  let maxStack = 0;

  for (const m of sorted) {
    if (m.pct - anchorPct > THRESHOLD_PCT) {
      anchorPct = m.pct; // open a new bucket
      stack = 0;
    } else {
      stack += 1;
    }
    m.stackIndex = stack;
    if (stack > maxStack) maxStack = stack;
  }

  return { placed: sorted, maxStack };
}

export function DeliveryTimeline({ startDate, targetEndDate, markers, compact = false }: DeliveryTimelineProps) {
  const start = toTime(startDate);
  const end = toTime(targetEndDate);
  const now = Date.now();

  const todayPct = positionPct(now, start, end);
  const elapsed = Math.round(todayPct);
  const todayInRange = now >= start && now <= end;

  const { placed, maxStack } = placeMarkers(markers, start, end);
  const bandHeight = BASE_BAND + maxStack * ROW_HEIGHT;

  return (
    <div className={compact ? "flex flex-col gap-2" : "flex flex-col gap-4"}>
      {/* Heading row: dates + elapsed */}
      {!compact && (
        <div className="flex items-center justify-between">
          <span className="label">{formatDate(startDate)}</span>
          <span className="mono text-[11px] text-bone-mute tabular-nums">{elapsed}% elapsed</span>
          <span className="label">{formatDate(targetEndDate)}</span>
        </div>
      )}

      {/* Marker band — markers float above a thin axis line */}
      <div className="relative w-full" style={{ height: bandHeight }}>
        {/* Axis line, vertically centred on the band's first row */}
        <div
          className="absolute left-0 right-0 h-2 rounded-[var(--radius-pill)] bg-graphite"
          style={{ top: BASE_BAND - 22 }}
        >
          {/* Elapsed fill */}
          <div
            className="absolute top-0 left-0 h-full rounded-[var(--radius-pill)] bg-track-gold-dim/40"
            style={{ width: `${todayPct}%` }}
          />
        </div>

        {/* Today marker — spans the full band so stacked rows read against it */}
        {todayInRange && (
          <div
            className="group absolute z-10"
            style={{ left: `${todayPct}%`, top: 0, height: bandHeight, transform: "translateX(-50%)" }}
          >
            <div className="w-[2px] h-full bg-track-gold/60 rounded-[var(--radius-pill)]" />
            <div className="pointer-events-none absolute -top-1 left-1/2 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[var(--radius-sm)] bg-bitumen border border-graphite px-2 py-1 text-[11px] text-bone shadow-[var(--shadow-sm)] group-hover:block">
              Today · {formatDate(new Date())}
            </div>
          </div>
        )}

        {/* Markers */}
        {placed.map((m) => {
          const rowTop = BASE_BAND - 22 + 4 + m.stackIndex * ROW_HEIGHT; // align dot to axis on row 0
          return (
            <div
              key={m.id}
              className="group absolute z-20"
              style={{ left: `${m.pct}%`, top: rowTop, transform: "translate(-50%, -50%)" }}
            >
              <div className="flex items-center gap-1.5">
                {/* number tag (M#/B#) for milestone & installment */}
                {m.numberLabel && (
                  <span className={`mono text-[10px] tabular-nums leading-none ${TONE_TEXT[m.tone]}`}>
                    {m.numberLabel}
                  </span>
                )}
                {/* glyph — milestone = filled gold dot; installment = orange tick;
                    invoice-sent = light-green ring; invoice-paid = deep-green
                    disc with a check inside */}
                {m.kind === "milestone" && (
                  <span className={`w-3 h-3 rounded-[var(--radius-pill)] border ${TONE_DOT[m.tone]}`} />
                )}
                {m.kind === "installment" && (
                  <span className={`w-[3px] h-3.5 rounded-[var(--radius-pill)] ${TONE_DOT[m.tone]}`} />
                )}
                {m.kind === "invoice-sent" && (
                  <span className={`w-3 h-3 rounded-[var(--radius-pill)] border-2 bg-transparent ${TONE_DOT[m.tone].split(" ")[1]}`} />
                )}
                {m.kind === "invoice-paid" && (
                  <span className={`flex items-center justify-center w-4 h-4 rounded-[var(--radius-pill)] text-bone ${TONE_DOT[m.tone]}`}>
                    <Check size={10} strokeWidth={2.5} />
                  </span>
                )}
              </div>

              {/* Hover tooltip */}
              <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-bitumen border border-graphite px-2 py-1 text-[11px] shadow-[var(--shadow-sm)] group-hover:block z-30">
                <span className="text-bone">{m.title}</span>
                {m.detail && <span className="text-bone-mute"> · {m.detail}</span>}
                <span className="text-bone-mute"> · {formatDate(m.date)}</span>
              </div>
            </div>
          );
        })}

        {/* Marker-kind legend */}
      </div>

      {!compact && (
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5 text-[11px] text-bone-mute">
            <span className="w-2.5 h-2.5 rounded-[var(--radius-pill)] border bg-track-gold border-track-gold" />
            milestone
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-bone-mute">
            <span className="w-[3px] h-3 rounded-[var(--radius-pill)] bg-signal-warming" />
            installment
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-bone-mute">
            <span className="w-2.5 h-2.5 rounded-[var(--radius-pill)] border-2 border-invoice-sent" />
            invoice sent
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-bone-mute">
            <span className="flex items-center justify-center w-3.5 h-3.5 rounded-[var(--radius-pill)] bg-invoice-paid text-bone">
              <Check size={9} strokeWidth={2.5} />
            </span>
            invoice paid
          </span>
        </div>
      )}
    </div>
  );
}
