"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, Label, Badge, Button, Textarea, Input, Avatar } from "@/components/ui";
import { formatCAD, daysSince, stageAgeTier, dealLabel, type StageAgeTier } from "@/lib/format";
import { stageOrder, stageLabels } from "@/lib/data/seed";
import { industryLabels, INDUSTRY_VERTICALS } from "@/lib/industries";
import type { Industry } from "@/lib/types";
import { updateDealStage } from "@/app/(app)/pipeline/actions";
import { createTask } from "@/app/(app)/tasks/actions";
import { cn } from "@/lib/cn";
import { AlertCircle, X, Mail } from "lucide-react";
import type {
  DealModel as Deal,
  ContactModel as Contact,
  PartnerModel as Partner,
} from "@/lib/generated/prisma/models";
import type { DealStage, LeadSource } from "@/lib/generated/prisma/enums";

// Narrowed shape mirroring the `select` in app/(app)/pipeline/page.tsx — must
// match PipelineTabs' DealWithRel (tsc enforces it at the call boundary).
type DealWithRel = Pick<
  Deal,
  | "id"
  | "company"
  | "name"
  | "stage"
  | "valueEstimate"
  | "industry"
  | "subIndustry"
  | "stageEnteredAt"
  | "partnerLeadId"
  | "coldOutreachAt"
  | "outreachRepliedAt"
> & {
  contact: Pick<Contact, "name" | "sourceCategory">;
  partnerLead: Pick<Partner, "initials" | "name">;
};

// Stages a card can be dropped into. "signed" is the convert flow, not a drop.
const DROP_STAGES = stageOrder.filter((s) => s !== "signed");

// Stage a deal just landed in → the obvious next move. Title + a context
// scaffold so the task carries real intent into the agent layer (Phase 4+).
const NEXT_ACTION: Record<string, (company: string) => { title: string; context: string }> = {
  lead: (c) => ({
    title: `Qualify ${c} — confirm fit, budget, authority`,
    context: `Goal: decide whether ${c} is worth a discovery call.\nConfirm: budget range, decision-maker, timeline, the pain we'd solve.`,
  }),
  qualified: (c) => ({
    title: `Book a discovery call with ${c}`,
    context: `Goal: get a scoping call on the calendar with ${c}.\nBring: the pain we heard, two example outcomes, a proposed agenda.`,
  }),
  discovery: (c) => ({
    title: `Run the discovery call with ${c}, then book the discussion call`,
    context: `Goal: get to know ${c} — their pain, what they know about AI, who decides.\nQualify hard, then earn a discussion call. Prep the internal discovery doc first.`,
  }),
  discussion: (c) => ({
    title: `Send survey + follow-up, then move ${c} to proposal`,
    context: `Goal: turn discovery + discussion into a scoped proposal for ${c}.\nSend the post-call survey, a follow-up email, and book the next step. Include: phased plan, success measures, fee, timeline.`,
  }),
  proposal: (c) => ({
    title: `Follow up on the ${c} proposal`,
    context: `Goal: move ${c} toward a yes.\nCheck: open questions, redlines, who else needs to sign off.`,
  }),
  negotiation: (c) => ({
    title: `Prep contract & convert ${c}`,
    context: `Goal: get ${c} signed and ready to convert.\nConfirm: final scope, fee, start date, paper status.`,
  }),
};

function dueInDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Status-dot color by time-in-stage — green (fresh) → orange (warming) → red (stale).
const AGE_DOT: Record<StageAgeTier, string> = {
  fresh: "bg-signal-fresh",
  warming: "bg-signal-warming",
  stale: "bg-flag-red",
};

// Lead-source accent — a left border on each card colored by where the lead
// came from (from contact.sourceCategory). CSS vars (not Tailwind classes) so
// the color always renders regardless of safelisting. null → graphite.
// The four common sources — intro, referral, AI Found, Imported — get distinct
// hues; the rarer ones (outbound, inbound) intentionally share with AI Found /
// Imported since the firm's "found" leads now come through the agent (AI Found)
// and its inbound/network leads through Imported.
const SOURCE_ACCENT: Record<LeadSource, string> = {
  intro: "var(--color-track-gold)",       // gold — personal intro
  referral: "var(--color-signal-fresh)",  // green — referral
  ai_found: "var(--color-signal-warming)",// amber — surfaced by the agent
  imported: "var(--color-diagnostic-steel)", // steel-blue — your imported network
  outbound: "var(--color-signal-warming)",
  inbound: "var(--color-diagnostic-steel)",
  event: "var(--color-bone)",
  other: "var(--color-graphite)",
};
const SOURCE_FALLBACK = "var(--color-graphite)";

// Legend rows for the board header (label + the same color).
const SOURCE_LEGEND: { source: LeadSource; label: string }[] = [
  { source: "intro", label: "Intro" },
  { source: "referral", label: "Referral" },
  { source: "ai_found", label: "AI Found" },
  { source: "imported", label: "Imported" },
  { source: "outbound", label: "Outbound" },
  { source: "inbound", label: "Inbound" },
  { source: "event", label: "Event" },
  { source: "other", label: "Other" },
];

interface PipelineBoardProps {
  initialDeals: DealWithRel[];
}

type NextTaskCtx = { deal: DealWithRel; stage: DealStage };

export function PipelineBoard({ initialDeals }: PipelineBoardProps) {
  const router = useRouter();
  const [deals, setDeals] = useState(initialDeals);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // Next-task pop-up after a successful move.
  const [nextTask, setNextTask] = useState<NextTaskCtx | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskContext, setTaskContext] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vertical / sub-industry filter chips (refine the board without touching the
  // drag flow — filtering is purely a render concern over `deals`).
  const [vertical, setVertical] = useState<Industry | "all">("all");
  const [sub, setSub] = useState<string | "all">("all");

  // Resync when the server component re-renders (after a move revalidates).
  useEffect(() => {
    setDeals(initialDeals);
  }, [initialDeals]);

  const verticalsPresent = useMemo(() => {
    const seen = new Set(deals.map((d) => d.industry));
    return INDUSTRY_VERTICALS.filter((v) => seen.has(v));
  }, [deals]);

  const subsPresent = useMemo(() => {
    if (vertical === "all") return [];
    const seen = new Set<string>();
    for (const d of deals) {
      if (d.industry === vertical && d.subIndustry) seen.add(d.subIndustry);
    }
    return [...seen].sort();
  }, [deals, vertical]);

  const visibleDeals = useMemo(
    () =>
      deals.filter((d) => {
        if (vertical !== "all" && d.industry !== vertical) return false;
        if (sub !== "all" && d.subIndustry !== sub) return false;
        return true;
      }),
    [deals, vertical, sub],
  );

  function pickVertical(v: Industry | "all") {
    setVertical(v);
    setSub("all");
  }

  function onDragStart(e: DragEvent, dealId: string) {
    setDraggingId(dealId);
    e.dataTransfer.setData("text/plain", dealId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragEnd() {
    setDraggingId(null);
    setDragOverStage(null);
  }

  async function onDrop(e: DragEvent, stage: DealStage) {
    e.preventDefault();
    setDragOverStage(null);
    const dealId = e.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    if (!dealId) return;

    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === stage) return;

    const previous = deals;
    // Optimistic move — reset stageEnteredAt so the card flips back to fresh/green.
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stage, stageEnteredAt: new Date() } : d)),
    );

    try {
      await updateDealStage(dealId, stage);
      // Prompt the next action with a stage-appropriate suggestion.
      const suggestion = NEXT_ACTION[stage]?.(deal.company);
      if (suggestion) {
        setTaskTitle(suggestion.title);
        setTaskContext(suggestion.context);
        setError(null);
        setNextTask({ deal: { ...deal, stage }, stage });
      } else {
        router.refresh();
      }
    } catch (err) {
      console.error("updateDealStage failed:", err);
      setDeals(previous); // revert
    }
  }

  function closeModal() {
    setNextTask(null);
    setTaskTitle("");
    setTaskContext("");
    setError(null);
    router.refresh();
  }

  async function createNextTask() {
    if (!nextTask) return;
    if (!taskTitle.trim()) {
      setError("Task title is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createTask({
        title: taskTitle,
        // Default the next step to the deal's partner lead.
        ownerId: nextTask.deal.partnerLeadId,
        priority: "medium",
        due: dueInDays(3),
        context: taskContext.trim() || undefined,
        relatedTo: nextTask.deal.company,
      });
      closeModal();
    } catch (err) {
      console.error("createTask failed:", err);
      setError(err instanceof Error ? err.message : "Failed to create task");
      setSaving(false);
    }
  }

  return (
    <>
      {/* Lead-source legend — the left-border color on each card. */}
      <div className="px-8 pt-5 flex items-center gap-4 flex-wrap">
        <span className="label text-[10px] text-bone-mute">Lead source</span>
        {SOURCE_LEGEND.map(({ source, label }) => (
          <span key={source} className="inline-flex items-center gap-1.5 text-[11px] text-bone-dim">
            <span
              className="inline-block w-2.5 h-2.5 rounded-[2px] shrink-0"
              style={{ backgroundColor: SOURCE_ACCENT[source] }}
            />
            {label}
          </span>
        ))}
      </div>

      {/* Vertical / sub-industry filter chips. */}
      {verticalsPresent.length > 1 && (
        <div className="px-8 pt-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="label text-[10px] text-bone-mute mr-1">Industry</span>
            <FilterChip label="All" active={vertical === "all"} onClick={() => pickVertical("all")} />
            {verticalsPresent.map((v) => (
              <FilterChip
                key={v}
                label={industryLabels[v]}
                active={vertical === v}
                onClick={() => pickVertical(v)}
              />
            ))}
          </div>
          {subsPresent.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="label text-[10px] text-bone-mute mr-1">Sub</span>
              <FilterChip label="All" active={sub === "all"} onClick={() => setSub("all")} small />
              {subsPresent.map((s) => (
                <FilterChip key={s} label={s} active={sub === s} onClick={() => setSub(s)} small />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-x-auto px-8 py-6">
        {/* Fixed-width, content-height lanes: empty lanes stay short instead of
            stretching into tall channels. Only the deal cards float. */}
        <div className="flex gap-5 items-start">
          {DROP_STAGES.map((stage) => {
            const stageDeals = visibleDeals.filter((d) => d.stage === stage);
            const stageValue = stageDeals.reduce((s, d) => s + d.valueEstimate, 0);
            const isOver = dragOverStage === stage;
            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverStage !== stage) setDragOverStage(stage);
                }}
                onDragLeave={(e) => {
                  // Only clear when the pointer actually leaves the column.
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverStage((s) => (s === stage ? null : s));
                  }
                }}
                onDrop={(e) => onDrop(e, stage)}
                className="w-[280px] shrink-0 flex flex-col"
              >
                <div className="sticky top-0 z-10 bg-bitumen/85 backdrop-blur px-1 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-bone">{stageLabels[stage]}</span>
                    <span className="text-[12px] text-bone-mute tabular-nums">{stageDeals.length}</span>
                  </div>
                  <span className="mono text-[12px] text-bone-dim tabular-nums">
                    {formatCAD(stageValue).replace("CA$", "$")}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {stageDeals.map((deal) => {
                    const tier = stageAgeTier(deal.stageEnteredAt);
                    const daysInStage = daysSince(deal.stageEnteredAt);
                    const dragging = draggingId === deal.id;
                    return (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, deal.id)}
                        onDragEnd={onDragEnd}
                        onClick={() => router.push(`/pipeline/${deal.id}`)}
                        style={{
                          borderLeftWidth: 2,
                          borderLeftStyle: "solid",
                          borderLeftColor: deal.contact.sourceCategory
                            ? SOURCE_ACCENT[deal.contact.sourceCategory]
                            : SOURCE_FALLBACK,
                        }}
                        className={cn(
                          "block bg-asphalt rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-3 transition-all cursor-grab active:cursor-grabbing hover:shadow-[var(--shadow)] hover:-translate-y-px",
                          dragging && "opacity-40",
                        )}
                      >
                        <div className="flex justify-between items-start mb-2 gap-2">
                          <span className="flex items-center gap-1.5 text-[13px] text-bone leading-snug min-w-0">
                            {tier !== "fresh" && (
                              <span className={cn("inline-block w-1.5 h-1.5 rounded-full shrink-0", AGE_DOT[tier])} />
                            )}
                            <span className="flex flex-col min-w-0">
                              <span className="truncate">{dealLabel(deal)}</span>
                              {deal.name && (
                                <span className="text-[10px] text-bone-mute truncate">{deal.company}</span>
                              )}
                            </span>
                          </span>
                          <span className="mono text-[12px] text-track-gold tabular-nums shrink-0">
                            {formatCAD(deal.valueEstimate).replace("CA$", "$").replace(",000", "k")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          <Badge tone="bone">{industryLabels[deal.industry]}</Badge>
                          {deal.subIndustry && (
                            <span className="text-[10px] text-bone-mute truncate max-w-[140px]">
                              {deal.subIndustry}
                            </span>
                          )}
                          {tier !== "fresh" && (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 mono text-[10px] uppercase tracking-[0.08em]",
                                tier === "stale" ? "text-flag-red" : "text-signal-warming",
                              )}
                            >
                              <AlertCircle size={9} strokeWidth={2} />
                              {daysInStage}d in stage
                            </span>
                          )}
                          {deal.stage === "lead" && deal.coldOutreachAt && !deal.outreachRepliedAt && (
                            <span className="inline-flex items-center gap-1 mono text-[10px] uppercase tracking-[0.08em] text-signal-warming">
                              <Mail size={9} strokeWidth={2} />
                              awaiting reply
                            </span>
                          )}
                        </div>
                        <div className="flex justify-between items-center pt-2">
                          <span className="text-[11px] text-bone-mute">{deal.contact.name}</span>
                          <Avatar initials={deal.partnerLead.initials} size="sm" />
                        </div>
                      </div>
                    );
                  })}
                  {stageDeals.length === 0 && (
                    <div
                      className={cn(
                        "border border-dashed rounded py-8 text-center text-[12px] transition-colors",
                        isOver ? "border-track-gold/60 text-bone-dim" : "border-graphite text-bone-mute",
                      )}
                    >
                      Drop a deal here
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <Card className="w-[280px] shrink-0 border border-track-gold/25 p-4">
            <Label gold>Signed → Convert</Label>
            <span className="block label mt-2 text-[10px] text-bone-mute">
              Sign a deal from its detail page — Convert scaffolds the client.
            </span>
          </Card>
        </div>
      </div>

      {/* Next-task pop-up */}
      {nextTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6" onClick={closeModal}>
          <Card className="w-full max-w-lg p-6 flex flex-col gap-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label gold>{dealLabel(nextTask.deal)}</Label>
                <h2 className="text-[18px] text-bone">
                  Moved to {stageLabels[nextTask.stage]}. Action the next task?
                </h2>
              </div>
              <button onClick={closeModal} aria-label="Close" className="text-bone-mute hover:text-bone">
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Next task</Label>
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} autoFocus />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Context</Label>
              <Textarea rows={5} value={taskContext} onChange={(e) => setTaskContext(e.target.value)} />
              <span className="label text-[9px] text-bone-mute">
                Assigned to {nextTask.deal.partnerLead.name.split(" ")[0]} · due in 3 days
              </span>
            </div>

            {error && <p className="text-[12px] text-flag-red">{error}</p>}

            <div className="flex items-center justify-between">
              <Button size="sm" variant="ghost" onClick={closeModal} disabled={saving}>
                Skip — just move it
              </Button>
              <Button size="sm" variant="primary" onClick={createNextTask} disabled={saving}>
                {saving ? "Creating…" : "Create task"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

// Pill toggle for the board's industry / sub-industry filters.
function FilterChip({
  label,
  active,
  onClick,
  small,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[var(--radius-pill)] border transition-colors",
        small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        active
          ? "border-track-gold/40 text-track-gold bg-track-gold-dim/10"
          : "border-graphite-2 text-bone-mute hover:text-bone-dim",
      )}
    >
      {label}
    </button>
  );
}
