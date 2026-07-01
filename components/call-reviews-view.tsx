"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, SearchInput, EmptyState, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import {
  MessagesSquare,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  ChevronRight,
  ShieldAlert,
  BrainCircuit,
  CheckCircle2,
  Loader2,
  Repeat,
} from "lucide-react";
import { promoteLesson, approveCallReview } from "@/app/(app)/call-reviews/actions";

export type CallReviewRow = {
  id: string;
  title: string;
  callDate: string; // ISO
  whatWorked: string[];
  whatDidnt: string[];
  lessons: string[];
  coachingNotes: string | null;
  lane: string | null; // "client_records" | "intro"
  status: string; // "draft" | "approved"
  sensitivity: string; // "firm_wide" | "managing_partner"
  promoted: boolean; // a lesson from this review already promoted
  createdBy: string;
  scope: string | null; // client / deal / contact heading, if any
};

// The two meeting lanes that carry a review. Null lane still renders (labelled
// "Unfiled") so no row disappears — the same defensive default the ingest
// dispatch uses.
const LANE_LABEL: Record<string, string> = {
  client_records: "Client",
  intro: "Intro",
};

function laneLabel(lane: string | null): string {
  return (lane && LANE_LABEL[lane]) || "Unfiled";
}

function laneTone(lane: string | null): "gold" | "steel" | "neutral" {
  if (lane === "client_records") return "gold";
  if (lane === "intro") return "steel";
  return "neutral";
}

// Recurring = a point (case/space-insensitive) that shows up in 2+ reviews.
// Surfaces the pattern the team keeps hitting, which is the whole reason the
// surface aggregates rather than just listing.
function recurring(rows: CallReviewRow[], pick: (r: CallReviewRow) => string[]): { text: string; count: number }[] {
  const byKey = new Map<string, { text: string; count: number }>();
  for (const r of rows) {
    // One review contributes at most once per distinct point, so a single
    // review repeating a phrase doesn't fake a pattern.
    const seen = new Set<string>();
    for (const raw of pick(r)) {
      const text = raw.trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const hit = byKey.get(key);
      if (hit) hit.count += 1;
      else byKey.set(key, { text, count: 1 });
    }
  }
  return [...byKey.values()]
    .filter((e) => e.count >= 2)
    .sort((a, b) => b.count - a.count);
}

const PERIODS = [
  { key: "all", label: "All time", days: 0 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
] as const;

export function CallReviewsView({ rows }: { rows: CallReviewRow[] }) {
  const [q, setQ] = useState("");
  const [lane, setLane] = useState<string | null>(null); // "client_records" | "intro" | null
  const [partner, setPartner] = useState<string | null>(null);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("all");

  // Partner picker options — every distinct author across the visible set.
  const partners = useMemo(
    () => Array.from(new Set(rows.map((r) => r.createdBy))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const cutoff =
      period === "all" ? 0 : Date.now() - Number(period) * 86_400_000;
    return rows.filter((r) => {
      if (lane && r.lane !== lane) return false;
      if (partner && r.createdBy !== partner) return false;
      if (cutoff && new Date(r.callDate).getTime() < cutoff) return false;
      if (!needle) return true;
      return (
        r.title.toLowerCase().includes(needle) ||
        (r.scope?.toLowerCase().includes(needle) ?? false) ||
        r.whatWorked.some((s) => s.toLowerCase().includes(needle)) ||
        r.whatDidnt.some((s) => s.toLowerCase().includes(needle)) ||
        r.lessons.some((s) => s.toLowerCase().includes(needle))
      );
    });
  }, [rows, q, lane, partner, period]);

  const recurringWorked = useMemo(() => recurring(filtered, (r) => r.whatWorked), [filtered]);
  const recurringDidnt = useMemo(() => recurring(filtered, (r) => r.whatDidnt), [filtered]);
  // The lessons shortlist — every lesson across the filtered set, newest first,
  // deduped so the same phrasing lands once. The read-path the team scans.
  const lessonShortlist = useMemo(() => {
    const seen = new Set<string>();
    const out: { text: string; from: string }[] = [];
    for (const r of filtered) {
      for (const raw of r.lessons) {
        const text = raw.trim();
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ text, from: r.title });
      }
    }
    return out;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-8">
      {/* Aggregate spine — the patterns across the filtered reviews. */}
      {(recurringWorked.length > 0 || recurringDidnt.length > 0 || lessonShortlist.length > 0) && (
        <div className="grid grid-cols-3 gap-4">
          <PatternCard
            icon={<ThumbsUp size={14} strokeWidth={1.5} />}
            title="Keeps working"
            tone="green"
            empty="No repeated wins yet."
            items={recurringWorked}
          />
          <PatternCard
            icon={<ThumbsDown size={14} strokeWidth={1.5} />}
            title="Keeps tripping us"
            tone="orange"
            empty="No repeated snags yet."
            items={recurringDidnt}
          />
          <Card className="p-5 flex flex-col gap-3">
            <span className="flex items-center gap-2 label-gold">
              <Lightbulb size={14} strokeWidth={1.5} />
              Lessons shortlist
            </span>
            {lessonShortlist.length === 0 ? (
              <p className="text-[12px] text-bone-mute">No lessons captured yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {lessonShortlist.slice(0, 6).map((l, i) => (
                  <li key={i} className="text-[13px] text-bone-dim leading-snug">
                    {l.text}
                  </li>
                ))}
                {lessonShortlist.length > 6 && (
                  <li className="text-[11px] text-bone-mute">+{lessonShortlist.length - 6} more below</li>
                )}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-[320px]">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reviews…" />
        </div>

        {/* Lane chips */}
        <div className="flex items-center gap-1.5">
          {(["client_records", "intro"] as const).map((l) => (
            <FilterChip key={l} active={lane === l} onClick={() => setLane(lane === l ? null : l)}>
              {LANE_LABEL[l]}
            </FilterChip>
          ))}
        </div>

        {/* Period chips */}
        <div className="flex items-center gap-1.5">
          {PERIODS.map((p) => (
            <FilterChip key={p.key} active={period === p.key} onClick={() => setPeriod(p.key)}>
              {p.label}
            </FilterChip>
          ))}
        </div>

        {/* Partner picker — only when more than one author exists. */}
        {partners.length > 1 && (
          <select
            value={partner ?? ""}
            onChange={(e) => setPartner(e.target.value || null)}
            className="h-8 px-2.5 bg-bitumen border border-graphite text-bone text-[12px] rounded-[var(--radius)] focus:border-track-gold focus:outline-none"
          >
            <option value="">All partners</option>
            {partners.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}

        <span className="ml-auto label">
          {filtered.length} review{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Review list */}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MessagesSquare size={28} strokeWidth={1.5} />}
            title={rows.length === 0 ? "No call reviews yet" : "Nothing matches that filter"}
            hint={
              rows.length === 0
                ? "A retro is distilled from each meeting at ingest. Approve one and it shows up here."
                : "Try a different lane, period, or search term."
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function PatternCard({
  icon,
  title,
  tone,
  empty,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "green" | "orange";
  empty: string;
  items: { text: string; count: number }[];
}) {
  return (
    <Card className="p-5 flex flex-col gap-3">
      <span className={cn("flex items-center gap-2 label", tone === "green" ? "text-signal-fresh" : "text-signal-warming")}>
        {icon}
        {title}
      </span>
      {items.length === 0 ? (
        <p className="text-[12px] text-bone-mute">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.slice(0, 6).map((e, i) => (
            <li key={i} className="flex items-start justify-between gap-2 text-[13px] text-bone-dim leading-snug">
              <span className="min-w-0">{e.text}</span>
              <Badge tone={tone} className="gap-1 shrink-0">
                <Repeat size={10} strokeWidth={1.5} />
                {e.count}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-[12px] px-3 h-8 inline-flex items-center gap-1.5 rounded-full border transition-colors",
        active ? "border-track-gold text-bone" : "border-graphite text-bone-mute hover:text-bone",
      )}
    >
      {children}
    </button>
  );
}

// One review, expandable. Collapsed shows the header + counts; expanded shows the
// chips and the per-lesson promote control.
function ReviewCard({ review }: { review: CallReviewRow }) {
  const [open, setOpen] = useState(false);
  const hasBody =
    review.whatWorked.length > 0 ||
    review.whatDidnt.length > 0 ||
    review.lessons.length > 0 ||
    !!review.coachingNotes;

  return (
    <Card>
      <button
        type="button"
        onClick={() => hasBody && setOpen((v) => !v)}
        className={cn(
          "w-full text-left px-5 py-4 flex items-center gap-4",
          hasBody && "hover:bg-[var(--color-row-hover)] transition-colors",
        )}
      >
        <span className="flex flex-col gap-1.5 min-w-0 flex-1">
          <span className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-[14px] text-bone truncate">{review.title}</span>
            {review.sensitivity === "managing_partner" && (
              <Badge tone="gold" className="gap-1 shrink-0">
                <ShieldAlert size={11} strokeWidth={1.5} />
                MP only
              </Badge>
            )}
            {review.status === "draft" && <Badge tone="neutral">Draft</Badge>}
            {review.promoted && (
              <Badge tone="green" className="gap-1">
                <BrainCircuit size={11} strokeWidth={1.5} />
                In brain
              </Badge>
            )}
          </span>
          <span className="flex items-center gap-2 flex-wrap text-[11px] text-bone-mute">
            <Badge tone={laneTone(review.lane)}>{laneLabel(review.lane)}</Badge>
            {review.scope && <span className="truncate">{review.scope}</span>}
            <span>·</span>
            <span>{formatDate(review.callDate)}</span>
            <span>·</span>
            <span>{review.createdBy}</span>
          </span>
        </span>

        {/* Collapsed counts */}
        <span className="flex items-center gap-3 shrink-0 text-[11px]">
          {review.whatWorked.length > 0 && (
            <span className="flex items-center gap-1 text-signal-fresh">
              <ThumbsUp size={12} strokeWidth={1.5} />
              {review.whatWorked.length}
            </span>
          )}
          {review.whatDidnt.length > 0 && (
            <span className="flex items-center gap-1 text-signal-warming">
              <ThumbsDown size={12} strokeWidth={1.5} />
              {review.whatDidnt.length}
            </span>
          )}
          {review.lessons.length > 0 && (
            <span className="flex items-center gap-1 text-track-gold">
              <Lightbulb size={12} strokeWidth={1.5} />
              {review.lessons.length}
            </span>
          )}
        </span>

        {hasBody && (
          <ChevronRight
            size={16}
            strokeWidth={1.5}
            className={cn("text-bone-mute shrink-0 transition-transform", open && "rotate-90")}
          />
        )}
      </button>

      {open && hasBody && (
        <div className="px-5 pb-5 pt-1 flex flex-col gap-5 border-t border-graphite/60">
          {review.whatWorked.length > 0 && (
            <PointList
              icon={<ThumbsUp size={13} strokeWidth={1.5} />}
              title="What worked"
              toneClass="text-signal-fresh"
              points={review.whatWorked}
            />
          )}
          {review.whatDidnt.length > 0 && (
            <PointList
              icon={<ThumbsDown size={13} strokeWidth={1.5} />}
              title="What didn't"
              toneClass="text-signal-warming"
              points={review.whatDidnt}
            />
          )}
          {review.lessons.length > 0 && (
            <LessonList review={review} />
          )}
          {review.coachingNotes && (
            <div className="flex flex-col gap-1.5">
              <span className="label">Coaching notes</span>
              <p className="text-[13px] text-bone-dim leading-relaxed whitespace-pre-wrap">{review.coachingNotes}</p>
            </div>
          )}

          {review.status === "draft" && <ApproveReviewRow id={review.id} />}
        </div>
      )}
    </Card>
  );
}

function PointList({
  icon,
  title,
  toneClass,
  points,
}: {
  icon: React.ReactNode;
  title: string;
  toneClass: string;
  points: string[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className={cn("flex items-center gap-2 label", toneClass)}>
        {icon}
        {title}
      </span>
      <ul className="flex flex-col gap-1.5 pl-1">
        {points.map((p, i) => (
          <li key={i} className="text-[13px] text-bone-dim leading-snug flex gap-2">
            <span className="text-bone-mute shrink-0">•</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The lessons block. Each lesson gets a Promote-to-brain control; a review
// promotes one lesson (Step-0 links a single promotedKnowledgeItemId, not a
// specific lesson index), so once any lesson is promoted every button locks and
// a review-level explainer says where it went.
function LessonList({ review }: { review: CallReviewRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onPromote(index: number, text: string) {
    setError(null);
    setBusyIndex(index);
    start(async () => {
      const res = await promoteLesson(review.id, text);
      setBusyIndex(null);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-2 label-gold">
        <Lightbulb size={13} strokeWidth={1.5} />
        Lessons
      </span>
      <ul className="flex flex-col gap-2 pl-1">
        {review.lessons.map((lesson, i) => (
          <li key={i} className="flex items-start justify-between gap-3">
            <span className="text-[13px] text-bone-dim leading-snug flex gap-2 min-w-0">
              <span className="text-bone-mute shrink-0">•</span>
              <span>{lesson}</span>
            </span>
            {!review.promoted && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onPromote(i, lesson)}
                disabled={pending}
                className="gap-1.5 shrink-0"
              >
                {pending && busyIndex === i ? (
                  <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
                ) : (
                  <BrainCircuit size={13} strokeWidth={1.5} />
                )}
                Promote to brain
              </Button>
            )}
          </li>
        ))}
      </ul>
      {review.promoted && (
        <p className="text-[11px] text-bone-mute pl-1">
          A lesson from this review is drafted into the firm brain. Approve it on the Firm knowledge page to make it skill-readable.
        </p>
      )}
      {error && <span className="text-[12px] text-flag-red pl-1">{error}</span>}
    </div>
  );
}

function ApproveReviewRow({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    start(async () => {
      const res = await approveCallReview(id);
      if (!res.ok) setError(res.error ?? "Could not approve.");
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3 pt-1">
      <Button size="sm" onClick={onClick} disabled={pending} className="gap-1.5">
        {pending ? (
          <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
        ) : (
          <CheckCircle2 size={14} strokeWidth={1.5} />
        )}
        Approve review
      </Button>
      <span className="text-[11px] text-bone-mute">Marks the retro as team-settled.</span>
      {error && <span className="text-[12px] text-flag-red">{error}</span>}
    </div>
  );
}
