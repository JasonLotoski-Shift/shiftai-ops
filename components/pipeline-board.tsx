"use client";

import { useEffect, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, Label, Badge, Button, Textarea, Input } from "@/components/ui";
import { formatCAD, daysSince } from "@/lib/format";
import { industryLabels, stageOrder, stageLabels } from "@/lib/data/seed";
import { updateDealStage } from "@/app/(app)/pipeline/actions";
import { createTask } from "@/app/(app)/tasks/actions";
import { cn } from "@/lib/cn";
import { AlertCircle, X } from "lucide-react";
import type {
  DealModel as Deal,
  ContactModel as Contact,
  PartnerModel as Partner,
} from "@/lib/generated/prisma/models";
import type { DealStage } from "@/lib/generated/prisma/enums";

type DealWithRel = Deal & { contact: Contact; partnerLead: Partner };

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
    title: `Draft proposal for ${c}`,
    context: `Goal: turn discovery notes into a scoped proposal for ${c}.\nInclude: phased plan, success measures, fee, timeline.`,
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

  // Resync when the server component re-renders (after a move revalidates).
  useEffect(() => {
    setDeals(initialDeals);
  }, [initialDeals]);

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
    // Optimistic move.
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage } : d)));

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
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-px bg-graphite min-w-max h-full">
          {DROP_STAGES.map((stage) => {
            const stageDeals = deals.filter((d) => d.stage === stage);
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
                className={cn(
                  "bg-bitumen w-[300px] flex flex-col transition-colors",
                  isOver && "bg-asphalt ring-1 ring-inset ring-track-gold/50",
                )}
              >
                <div className="px-4 py-4 border-b border-graphite">
                  <div className="flex items-center justify-between mb-1">
                    <Label>— {stageLabels[stage]}</Label>
                    <span className="label">{stageDeals.length}</span>
                  </div>
                  <span className="mono text-[12px] text-bone-dim tabular-nums">
                    {formatCAD(stageValue).replace("CA$", "$")}
                  </span>
                </div>

                <div className="flex flex-col gap-2 p-3 flex-1">
                  {stageDeals.map((deal) => {
                    const stale = daysSince(deal.lastTouchAt) > 30;
                    const dragging = draggingId === deal.id;
                    return (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, deal.id)}
                        onDragEnd={onDragEnd}
                        onClick={() => router.push(`/pipeline/${deal.id}`)}
                        className={cn(
                          "block bg-asphalt border border-graphite p-3 transition-colors cursor-grab active:cursor-grabbing hover:border-bone-mute",
                          stale && "border-flag-red/60",
                          dragging && "opacity-40",
                        )}
                      >
                        <div className="flex justify-between items-start mb-2 gap-2">
                          <span className="text-[13px] text-bone leading-snug">{deal.company}</span>
                          <span className="mono text-[12px] text-track-gold tabular-nums shrink-0">
                            {formatCAD(deal.valueEstimate).replace("CA$", "$").replace(",000", "k")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <Badge tone="bone">{industryLabels[deal.industry]}</Badge>
                          {stale && (
                            <Badge tone="red">
                              <AlertCircle size={9} strokeWidth={2} className="mr-1" />
                              {daysSince(deal.lastTouchAt)}d cold
                            </Badge>
                          )}
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-graphite">
                          <span className="text-[11px] text-bone-mute">{deal.contact.name}</span>
                          <div className="w-5 h-5 bg-graphite-2 flex items-center justify-center mono text-[9px] text-bone-dim">
                            {deal.partnerLead.initials}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {stageDeals.length === 0 && (
                    <div className="text-center py-6">
                      <span className="label text-bone-mute">— Empty</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div className="bg-bitumen w-[260px] flex flex-col border-l-2 border-track-gold">
            <div className="px-4 py-4 border-b border-graphite">
              <Label gold>— Signed → Convert</Label>
              <span className="block label mt-2 text-[10px] text-bone-mute">
                Sign a deal from its detail page — Convert scaffolds the client.
              </span>
            </div>
            <div className="p-3 flex-1">
              <div className="text-center py-8">
                <span className="label">— Drag here disabled</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Next-task pop-up */}
      {nextTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6" onClick={closeModal}>
          <Card className="w-full max-w-lg p-6 flex flex-col gap-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label gold>— {nextTask.deal.company}</Label>
                <h2 className="text-[18px] text-bone">
                  Moved to {stageLabels[nextTask.stage]}. Action the next task?
                </h2>
              </div>
              <button onClick={closeModal} aria-label="Close" className="text-bone-mute hover:text-bone">
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>— Next task</Label>
              <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} autoFocus />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>— Context</Label>
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
