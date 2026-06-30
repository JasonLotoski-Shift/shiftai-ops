"use client";

// Blue (firm_knowledge) lane review card — Phase 4 of the ingest 3-lane redesign.
//
// Owns an all-internal team meeting (Fireflies routed it here when every attendee
// is on a firm domain). It is firm-level: no client / contact / deal. Approving it
// (Gate 1):
//  - logs the transcript at ARM'S LENGTH (a firm Interaction + firm Artifact) —
//    neither is read by any AI skill,
//  - sends kept action items to the FIRM task board (default OFF, the partner
//    promotes), deduped against the firm board,
//  - and, only when the meeting produced an important knowledge candidate the
//    partner keeps, writes a DRAFT DecisionRecord / KnowledgeItem that stays
//    invisible to skills until a partner approves it in /firm-knowledge (Gate 2).
// Proposes-never-auto-writes: nothing is written until the partner clicks Approve.
// See docs/ingest-3-lane-plan.md §4.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  ChevronDown,
  ChevronRight,
  BrainCircuit,
  Scale,
  Lightbulb,
  ShieldAlert,
} from "lucide-react";
import { Card, Badge, Button, Input, Label, Textarea, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  approveFirmMeeting,
  rejectProposal,
  type KnowledgeCandidate,
} from "@/app/(app)/ingest/actions";
import type { ProposalProp } from "@/components/ingest-view";

const SOURCE_LABEL: Record<string, string> = { paste: "Pasted", fireflies: "Fireflies", drop: "Dropped file", gmail: "Gmail" };

export default function FirmMeetingProposalCard({
  p,
  open,
  onToggle,
  partners,
}: {
  p: ProposalProp;
  open: boolean;
  onToggle: () => void;
  partners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const prop = p.proposal;
  const cand = prop.knowledgeCandidate ?? null;
  // A thin meeting can come back with these omitted; default so the card never
  // crashes the whole ingest list on a malformed model response.
  const keyPoints = prop.keyPoints ?? [];
  const proposedItems = prop.actionItems ?? [];

  const [summary, setSummary] = useState(prop.summary ?? "");

  // Firm-board action items — conservative DEFAULT-OFF (the v2 + Lane-3 rule): the
  // partner ticks the ones worth keeping. Owner is optional (firm tasks can sit
  // unassigned).
  const [items, setItems] = useState(
    proposedItems.map((a) => ({
      keep: false,
      title: a.title,
      ownerId: "", // "" = unassigned
      context: a.context,
      due: a.due ?? "",
    })),
  );

  // Knowledge candidate — kept by default only when the meeting cleared the bar.
  const [keepCand, setKeepCand] = useState(!!cand?.isImportant);
  const [candTitle, setCandTitle] = useState(cand?.title ?? "");
  // The editable body maps to `decision` (decision kind) or `summary` (learning).
  const [candBody, setCandBody] = useState(
    cand?.kind === "decision" ? cand?.decision ?? "" : cand?.summary ?? "",
  );
  const [candMP, setCandMP] = useState(cand?.sensitivity === "managing_partner");

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const keptCount = items.filter((i) => i.keep && i.title.trim()).length;

  function approve() {
    setError(null);
    const actionItems = items
      .filter((i) => i.keep && i.title.trim())
      .map((i) => ({ title: i.title, ownerId: i.ownerId || null, context: i.context, due: i.due }));

    // Build the candidate to persist, or null to discard. Carry through the ADR
    // sub-fields the partner didn't edit; overwrite the title + the body field
    // that matches the kind.
    let candidate: KnowledgeCandidate | null = null;
    if (cand && keepCand && candTitle.trim()) {
      candidate = {
        ...cand,
        title: candTitle.trim(),
        sensitivity: candMP ? "managing_partner" : "firm_wide",
        ...(cand.kind === "decision" ? { decision: candBody } : { summary: candBody }),
      };
    }

    startTransition(async () => {
      try {
        await approveFirmMeeting(p.id, { summary, actionItems, candidate });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to approve");
      }
    });
  }

  function reject() {
    if (!confirm("Reject this meeting? Nothing will be written.")) return;
    startTransition(async () => {
      try {
        await rejectProposal(p.id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reject");
      }
    });
  }

  return (
    <Card className={cn(isPending && "opacity-60")}>
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[var(--color-row-hover)] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {open ? (
            <ChevronDown size={15} strokeWidth={1.5} className="shrink-0" style={{ color: "var(--color-lane-blue)" }} />
          ) : (
            <ChevronRight size={15} strokeWidth={1.5} className="text-bone-mute shrink-0" />
          )}
          <Users size={14} strokeWidth={1.5} className="shrink-0" style={{ color: "var(--color-lane-blue)" }} />
          <div className="min-w-0">
            <span className="text-[14px] text-bone truncate">{p.title}</span>
            <p className="text-[11px] text-bone-mute">
              {SOURCE_LABEL[p.source] ?? p.source} ·{" "}
              {new Date(p.meetingDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })} ·{" "}
              {proposedItems.length} task(s){cand ? " · 1 knowledge candidate" : ""}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-2 shrink-0">
          {cand?.isImportant && (
            <Badge tone="steel" className="gap-1">
              <BrainCircuit size={11} strokeWidth={1.5} />
              for the brain
            </Badge>
          )}
          <Badge tone="steel">firm knowledge</Badge>
        </span>
      </button>

      {open && (
        <div className="px-5 py-5 flex flex-col gap-5">
          {/* Summary */}
          <div className="flex flex-col gap-1.5">
            <Label>Summary</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
          </div>

          {/* Key points (read-only context for the reviewer) */}
          {keyPoints.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>Key points</Label>
              <ul className="flex flex-col gap-1">
                {keyPoints.map((k, i) => (
                  <li key={i} className="text-[13px] text-bone-dim leading-relaxed flex gap-2">
                    <span className="text-bone-mute">•</span>
                    <span>{k}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Firm-board action items — default OFF; the partner promotes. */}
          <div className="flex flex-col gap-2">
            <Label>
              Action items → firm task board {keptCount > 0 ? `(${keptCount} selected)` : "(none selected)"}
            </Label>
            {items.length === 0 ? (
              <p className="text-[12px] text-bone-mute">No action items in this meeting.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map((it, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-2 px-3 py-2.5 rounded-[var(--radius)] border border-graphite bg-asphalt"
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={it.keep}
                        onChange={(e) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))}
                        className="mt-1.5 accent-[var(--color-lane-blue)]"
                      />
                      <div className="flex-1 flex flex-col gap-2 min-w-0">
                        <Input
                          value={it.title}
                          onChange={(e) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                          disabled={!it.keep}
                          placeholder="Task title"
                        />
                        {it.keep && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Select
                              value={it.ownerId}
                              onChange={(e) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ownerId: e.target.value } : x)))}
                              className="h-8 text-[12px] w-auto"
                            >
                              <option value="">Unassigned</option>
                              {partners.map((pt) => (
                                <option key={pt.id} value={pt.id}>{pt.name}</option>
                              ))}
                            </Select>
                            <Input
                              type="date"
                              value={it.due}
                              onChange={(e) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, due: e.target.value } : x)))}
                              className="h-8 text-[12px] w-auto"
                            />
                          </div>
                        )}
                        {it.keep && it.context && (
                          <p className="text-[11px] text-bone-mute leading-relaxed">{it.context}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Knowledge candidate — the by-exception firm-brain draft (Gate 1). */}
          {cand && (
            <div
              className="flex flex-col gap-3 px-4 py-3 rounded-[var(--radius)]"
              style={{ border: "1px solid color-mix(in srgb, var(--color-lane-blue) 40%, transparent)", background: "color-mix(in srgb, var(--color-lane-blue) 8%, transparent)" }}
            >
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keepCand}
                  onChange={(e) => setKeepCand(e.target.checked)}
                  className="mt-1 accent-[var(--color-lane-blue)]"
                />
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    {cand.kind === "decision" ? (
                      <Scale size={13} strokeWidth={1.5} style={{ color: "var(--color-lane-blue)" }} />
                    ) : (
                      <Lightbulb size={13} strokeWidth={1.5} style={{ color: "var(--color-lane-blue)" }} />
                    )}
                    <span className="text-[13px] text-bone font-medium">
                      Add to firm knowledge as a {cand.kind === "decision" ? "decision" : "learning"}
                    </span>
                  </span>
                  <span className="text-[11px] text-bone-mute leading-relaxed">
                    Keeping this saves a draft for a partner to approve in Firm knowledge. Nothing reaches the firm brain until then.
                  </span>
                </span>
              </label>

              {keepCand && (
                <div className="flex flex-col gap-3 pl-7">
                  <div className="flex flex-col gap-1.5">
                    <Label>Title</Label>
                    <Input value={candTitle} onChange={(e) => setCandTitle(e.target.value)} placeholder="What it's called" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>{cand.kind === "decision" ? "Decision" : "What we learned"}</Label>
                    <Textarea value={candBody} onChange={(e) => setCandBody(e.target.value)} rows={3} />
                  </div>
                  {cand.kind === "decision" && (cand.context || cand.optionsConsidered || cand.consequences) && (
                    <div className="flex flex-col gap-1.5 text-[12px] text-bone-dim leading-relaxed">
                      {cand.context && <p><span className="text-bone-mute">Context: </span>{cand.context}</p>}
                      {cand.optionsConsidered && <p><span className="text-bone-mute">Options: </span>{cand.optionsConsidered}</p>}
                      {cand.consequences && <p><span className="text-bone-mute">Consequences: </span>{cand.consequences}</p>}
                      <span className="text-[11px] text-bone-mute">Edit these later in the decision log if needed.</span>
                    </div>
                  )}
                  {cand.rationale && (
                    <p className="text-[11px] text-bone-mute leading-relaxed">
                      <span className="text-bone-dim">Why it&apos;s flagged: </span>{cand.rationale}
                    </p>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer w-fit">
                    <input type="checkbox" checked={candMP} onChange={(e) => setCandMP(e.target.checked)} className="accent-[var(--color-lane-blue)]" />
                    <span className="text-[12px] text-bone-dim flex items-center gap-1.5">
                      <ShieldAlert size={12} strokeWidth={1.5} className={candMP ? "text-track-gold" : "text-bone-mute"} />
                      Managing partners only (firm economics or strategy)
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-[12px] text-flag-red">{error}</p>}

          <div className="flex items-center gap-2">
            <Button onClick={approve} disabled={isPending}>Approve</Button>
            <Button variant="ghost" onClick={reject} disabled={isPending}>Reject</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
