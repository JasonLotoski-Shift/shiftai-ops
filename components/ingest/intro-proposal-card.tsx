"use client";

// Purple (intro / channel-partner) lane review card — Phase 6 of the ingest
// redesign (Lane 4). Owns an intro/BD call: an external person, no client and no
// deal at capture. Fireflies/composer routed it here (external attendee + no
// client/deal match). Approving it:
//  - resolves the channel-partner Contact (matched or created) and stamps
//    isChannelPartner + channelNotes (the §3 marker),
//  - logs the call as an Interaction on that contact,
//  - creates the kept BD tasks on that contact (default OFF, firm / "BD"),
//  - writes one CallReview row tied to the logged Interaction,
//  - and, only when the partner keeps the by-exception targeting candidate,
//    writes a DRAFT DecisionRecord / KnowledgeItem behind the same second gate
//    Lane 3 uses (invisible to skills until approved in /firm-knowledge).
// Proposes-never-auto-writes: nothing is written until the partner clicks Approve.
// See docs/ingest-lane4-intro-and-call-review.md §2, §6.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Handshake,
  ChevronDown,
  ChevronRight,
  BrainCircuit,
  Scale,
  Lightbulb,
  ShieldAlert,
  ClipboardCheck,
} from "lucide-react";
import { Card, Badge, Button, Input, Label, Textarea, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { approveIntro, rejectUnified } from "@/app/(app)/ingest/composer-actions";
import { LANE_PURPLE, isIntroProposal, type IntroProposal } from "@/lib/ingest/types";
import type { ProposalProp } from "@/components/ingest-view";

const SOURCE_LABEL: Record<string, string> = { paste: "Pasted", fireflies: "Fireflies", drop: "Dropped file", gmail: "Gmail" };

// Empty-but-valid intro proposal — guards against a thin/malformed model response
// so a bad row never crashes the whole ingest list.
const EMPTY_INTRO: IntroProposal = {
  lane: "intro",
  ingestType: "meeting",
  summary: "",
  keyPoints: [],
  contact: { recordId: null, name: "", email: null, title: null, company: null, channelNotes: null },
  tasks: [],
  knowledgeCandidate: null,
  callReview: null,
};

export default function IntroProposalCard({
  p,
  open,
  onToggle,
  partners,
  contacts,
}: {
  p: ProposalProp;
  open: boolean;
  onToggle: () => void;
  partners: { id: string; name: string }[];
  contacts: { id: string; name: string; company: string }[];
}) {
  const router = useRouter();
  const prop: IntroProposal = isIntroProposal(p.proposal) ? (p.proposal as unknown as IntroProposal) : EMPTY_INTRO;
  const cand = prop.knowledgeCandidate ?? null;
  const cr = prop.callReview ?? null;
  const keyPoints = prop.keyPoints ?? [];
  const proposedTasks = prop.tasks ?? [];

  const [summary, setSummary] = useState(prop.summary ?? "");

  // ── Channel-partner contact ──
  // "" = create a new contact from the parsed fields below; an id = match an
  // existing contact instead (then no new row is created on approve).
  const [matchId, setMatchId] = useState(p.matchedContactId ?? prop.contact?.recordId ?? "");
  const [name, setName] = useState(prop.contact?.name ?? "");
  const [email, setEmail] = useState(prop.contact?.email ?? "");
  const [contactTitle, setContactTitle] = useState(prop.contact?.title ?? "");
  const [company, setCompany] = useState(prop.contact?.company ?? "");
  const [markChannel, setMarkChannel] = useState(true); // this lane is for channel partners
  const [channelNotes, setChannelNotes] = useState(prop.contact?.channelNotes ?? "");
  const isNewContact = !matchId;

  // ── BD tasks — conservative DEFAULT-OFF (v2 + Lane-3/4 rule). Owner optional. ──
  const [items, setItems] = useState(
    proposedTasks.map((t) => ({
      keep: false,
      title: t.title,
      ownerId: "",
      context: t.context,
      due: t.due ?? "",
    })),
  );
  const keptCount = items.filter((i) => i.keep && i.title.trim()).length;

  // ── Call review — kept by default when the skill emitted real signal. ──
  const [keepReview, setKeepReview] = useState(
    !!cr && (cr.whatWorked.length > 0 || cr.whatDidnt.length > 0 || cr.lessons.length > 0 || !!cr.coachingNotes),
  );
  const [worked, setWorked] = useState((cr?.whatWorked ?? []).join("\n"));
  const [didnt, setDidnt] = useState((cr?.whatDidnt ?? []).join("\n"));
  const [lessons, setLessons] = useState((cr?.lessons ?? []).join("\n"));
  const [coaching, setCoaching] = useState(cr?.coachingNotes ?? "");

  // ── Targeting candidate — kept by default only when it cleared the bar. ──
  const [keepCand, setKeepCand] = useState(!!cand?.isImportant);
  const [candTitle, setCandTitle] = useState(cand?.title ?? "");
  const [candBody, setCandBody] = useState(cand?.kind === "decision" ? cand?.decision ?? "" : cand?.summary ?? "");
  const [candMP, setCandMP] = useState(cand?.sensitivity === "managing_partner");

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve() {
    setError(null);
    if (!name.trim()) {
      setError("The channel partner needs a name.");
      return;
    }
    if (isNewContact && !email.trim()) {
      setError("Add the channel partner's email to create them (it's the match key).");
      return;
    }

    const tasks = items
      .filter((i) => i.keep && i.title.trim())
      .map((i) => ({ title: i.title, context: i.context, due: i.due || null, ownerId: i.ownerId || null }));

    const splitLines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
    const callReview = keepReview
      ? {
          whatWorked: splitLines(worked),
          whatDidnt: splitLines(didnt),
          lessons: splitLines(lessons),
          coachingNotes: coaching.trim() || null,
        }
      : null;

    // Carry through the ADR sub-fields the partner didn't edit; overwrite title +
    // the body field that matches the kind.
    const candidate =
      cand && keepCand && candTitle.trim()
        ? {
            ...cand,
            title: candTitle.trim(),
            sensitivity: (candMP ? "managing_partner" : "firm_wide") as "firm_wide" | "managing_partner",
            ...(cand.kind === "decision" ? { decision: candBody } : { summary: candBody }),
          }
        : null;

    startTransition(async () => {
      try {
        await approveIntro(p.id, {
          contact: {
            recordId: matchId || null,
            name: name.trim(),
            email: email.trim() || null,
            title: contactTitle.trim() || null,
            company: company.trim() || null,
            isChannelPartner: markChannel,
            channelNotes: channelNotes.trim() || null,
          },
          summary,
          tasks,
          candidate,
          callReview,
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to approve");
      }
    });
  }

  function reject() {
    if (!confirm("Reject this intro? Nothing will be written.")) return;
    startTransition(async () => {
      try {
        await rejectUnified(p.id);
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
            <ChevronDown size={15} strokeWidth={1.5} className="shrink-0" style={{ color: LANE_PURPLE }} />
          ) : (
            <ChevronRight size={15} strokeWidth={1.5} className="text-bone-mute shrink-0" />
          )}
          <Handshake size={14} strokeWidth={1.5} className="shrink-0" style={{ color: LANE_PURPLE }} />
          <div className="min-w-0">
            <span className="text-[14px] text-bone truncate">{p.title}</span>
            <p className="text-[11px] text-bone-mute">
              {SOURCE_LABEL[p.source] ?? p.source} ·{" "}
              {new Date(p.meetingDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })} ·{" "}
              {proposedTasks.length} BD task(s){cand ? " · 1 targeting candidate" : ""}{cr ? " · call review" : ""}
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
          <Badge tone="steel" style={{ color: LANE_PURPLE, borderColor: `color-mix(in srgb, ${LANE_PURPLE} 45%, transparent)` }}>
            intro
          </Badge>
        </span>
      </button>

      {open && (
        <div className="px-5 py-5 flex flex-col gap-5">
          {/* Summary */}
          <div className="flex flex-col gap-1.5">
            <Label>Summary (logged as the interaction)</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
          </div>

          {/* Key points (read-only context) */}
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

          {/* Channel-partner contact */}
          <div
            className="flex flex-col gap-3 px-4 py-3 rounded-[var(--radius)]"
            style={{ border: `1px solid color-mix(in srgb, ${LANE_PURPLE} 40%, transparent)`, background: `color-mix(in srgb, ${LANE_PURPLE} 8%, transparent)` }}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label>Channel partner</Label>
              <Select
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
                className="h-8 text-[12px] w-auto max-w-[280px]"
              >
                <option value="">Create a new contact</option>
                {contacts.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.name} · {ct.company}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Name <span className="text-flag-red">*</span></Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" disabled={!isNewContact} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Email {isNewContact && <span className="text-flag-red">*</span>}</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" disabled={!isNewContact} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Title</Label>
                <Input value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} placeholder="e.g. Managing Director" disabled={!isNewContact} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Company</Label>
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" disabled={!isNewContact} />
              </div>
            </div>
            {!isNewContact && (
              <p className="text-[11px] text-bone-mute">
                Matching an existing contact. Their name / email / company stay as-is. Clear the picker to create a new contact instead.
              </p>
            )}

            <label className="flex items-center gap-2 cursor-pointer w-fit">
              <input type="checkbox" checked={markChannel} onChange={(e) => setMarkChannel(e.target.checked)} style={{ accentColor: LANE_PURPLE }} />
              <span className="text-[12px] text-bone-dim">Mark as a channel partner (sends future intros)</span>
            </label>

            <div className="flex flex-col gap-1.5">
              <Label>Channel notes</Label>
              <Textarea
                value={channelNotes}
                onChange={(e) => setChannelNotes(e.target.value)}
                rows={2}
                placeholder="Their reach, what they offer, any terms (e.g. declined a fee), how they prefer to work…"
              />
            </div>
          </div>

          {/* BD tasks — default OFF; the partner promotes. */}
          <div className="flex flex-col gap-2">
            <Label>
              BD follow-ups → firm task board {keptCount > 0 ? `(${keptCount} selected)` : "(none selected)"}
            </Label>
            {items.length === 0 ? (
              <p className="text-[12px] text-bone-mute">No BD follow-ups in this call.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map((it, i) => (
                  <div key={i} className="flex flex-col gap-2 px-3 py-2.5 rounded-[var(--radius)] border border-graphite bg-asphalt">
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={it.keep}
                        onChange={(e) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x)))}
                        className="mt-1.5"
                        style={{ accentColor: LANE_PURPLE }}
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
                        {it.keep && it.context && <p className="text-[11px] text-bone-mute leading-relaxed">{it.context}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Call review — the cross-call retro block (rides every meeting lane). */}
          {cr && (
            <div
              className="flex flex-col gap-3 px-4 py-3 rounded-[var(--radius)]"
              style={{ border: `1px solid color-mix(in srgb, ${LANE_PURPLE} 40%, transparent)`, background: `color-mix(in srgb, ${LANE_PURPLE} 8%, transparent)` }}
            >
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={keepReview} onChange={(e) => setKeepReview(e.target.checked)} className="mt-1" style={{ accentColor: LANE_PURPLE }} />
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="flex items-center gap-2">
                    <ClipboardCheck size={13} strokeWidth={1.5} style={{ color: LANE_PURPLE }} />
                    <span className="text-[13px] text-bone font-medium">Save a call review</span>
                  </span>
                  <span className="text-[11px] text-bone-mute leading-relaxed">
                    What worked, what didn&apos;t, and the durable lessons, one per line. Shows on the Call Reviews surface for the team to learn from.
                  </span>
                </span>
              </label>

              {keepReview && (
                <div className="flex flex-col gap-3 pl-7">
                  <div className="flex flex-col gap-1.5">
                    <Label>What worked</Label>
                    <Textarea value={worked} onChange={(e) => setWorked(e.target.value)} rows={2} placeholder="One per line…" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>What didn&apos;t</Label>
                    <Textarea value={didnt} onChange={(e) => setDidnt(e.target.value)} rows={2} placeholder="One per line…" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Lessons (durable, reusable)</Label>
                    <Textarea value={lessons} onChange={(e) => setLessons(e.target.value)} rows={2} placeholder="One per line…" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Coaching notes</Label>
                    <Textarea value={coaching} onChange={(e) => setCoaching(e.target.value)} rows={2} placeholder="Freeform, optional" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Targeting candidate — the by-exception firm-brain draft (Gate 1). */}
          {cand && (
            <div
              className="flex flex-col gap-3 px-4 py-3 rounded-[var(--radius)]"
              style={{ border: `1px solid color-mix(in srgb, ${LANE_PURPLE} 40%, transparent)`, background: `color-mix(in srgb, ${LANE_PURPLE} 8%, transparent)` }}
            >
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={keepCand} onChange={(e) => setKeepCand(e.target.checked)} className="mt-1" style={{ accentColor: LANE_PURPLE }} />
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    {cand.kind === "decision" ? (
                      <Scale size={13} strokeWidth={1.5} style={{ color: LANE_PURPLE }} />
                    ) : (
                      <Lightbulb size={13} strokeWidth={1.5} style={{ color: LANE_PURPLE }} />
                    )}
                    <span className="text-[13px] text-bone font-medium">
                      Add to firm knowledge as a {cand.kind === "decision" ? "decision" : "learning"}
                    </span>
                  </span>
                  <span className="text-[11px] text-bone-mute leading-relaxed">
                    A firm-targeting insight (who / how to target). Keeping it saves a draft for a partner to approve in Firm knowledge. Nothing reaches the firm brain until then.
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
                    <input type="checkbox" checked={candMP} onChange={(e) => setCandMP(e.target.checked)} style={{ accentColor: LANE_PURPLE }} />
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
