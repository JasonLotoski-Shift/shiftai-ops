"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  X,
  Mail,
  CalendarPlus,
  Globe,
  Sparkles,
  ShieldAlert,
  Check,
} from "lucide-react";
import { Button, Label, Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ContactModel as Contact } from "@/lib/generated/prisma/models";
import { interactionLabels } from "@/lib/data/seed";
import {
  generateEmailDraft,
  logInteraction,
  saveEmailDraft,
  sendEmail,
  generateEnrichment,
  applyEnrichment,
  type EnrichAddition,
  type EnrichConflict,
} from "@/app/(app)/contacts/[id]/actions";

type ActionKey = "email" | "log" | "search" | "enrich";

const TODAY = "2026-05-19";

export function ContactActions({
  contact,
  partnerName,
}: {
  contact: Contact;
  partnerName?: string;
}) {
  const [open, setOpen] = useState<ActionKey | null>(null);

  // Auto-open the matching modal when launched from a dashboard Quick Action
  // (which routes here with ?qa=email / ?qa=enrich after the contact is picked).
  const searchParams = useSearchParams();
  useEffect(() => {
    const qa = searchParams.get("qa");
    if (qa === "email") setOpen("email");
    else if (qa === "enrich") setOpen("enrich");
  }, [searchParams]);

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen("email")}>
        <Mail size={13} strokeWidth={1.5} />
        Draft email
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setOpen("log")}>
        <CalendarPlus size={13} strokeWidth={1.5} />
        Log interaction
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen("search")}>
        <Globe size={13} strokeWidth={1.5} />
        Web search
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen("enrich")}>
        <Sparkles size={13} strokeWidth={1.5} />
        AI enrich
      </Button>

      {open === "email" && <DraftEmailModal contact={contact} partnerName={partnerName} onClose={() => setOpen(null)} />}
      {open === "log" && <LogInteractionModal contact={contact} onClose={() => setOpen(null)} />}
      {open === "search" && <EnrichModal contact={contact} mode="search" onClose={() => setOpen(null)} />}
      {open === "enrich" && <EnrichModal contact={contact} mode="ai" onClose={() => setOpen(null)} />}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Modal shell
   ────────────────────────────────────────────────────────────────────── */

function Modal({
  icon,
  title,
  onClose,
  children,
  wide,
}: {
  icon: React.ReactNode;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-bitumen/85 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={cn("w-full bg-asphalt border border-graphite rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20", wide ? "max-w-[680px]" : "max-w-[520px]")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-graphite">
          <div className="flex items-center gap-3">
            {icon}
            <Label gold>— {title}</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Draft email — with the anti-hallucination gate.
   Claude never invents a price, a role, a date, or a commitment. Anything not
   supplied is left as an explicit [NEEDS INPUT] marker in the draft, not guessed.
   ────────────────────────────────────────────────────────────────────── */

function DraftEmailModal({
  contact,
  partnerName,
  onClose,
}: {
  contact: Contact;
  partnerName?: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"inputs" | "draft" | "saved">("inputs");
  const [purpose, setPurpose] = useState("");
  const [senderRole, setSenderRole] = useState("");
  const [pricePoint, setPricePoint] = useState("");
  const [timeline, setTimeline] = useState("");
  const [ask, setAsk] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [genErr, setGenErr] = useState<string | null>(null);
  const [persistErr, setPersistErr] = useState<string | null>(null);
  const [savedKind, setSavedKind] = useState<"draft" | "sent" | null>(null);
  const [isGenerating, startGenerate] = useTransition();
  const [isPersisting, startPersist] = useTransition();

  const needsInputCount = (draftBody.match(/\[NEEDS INPUT/g) || []).length;

  function runGenerate() {
    setGenErr(null);
    startGenerate(async () => {
      try {
        const { body } = await generateEmailDraft(contact.id, {
          purpose,
          ask,
          senderRole,
          pricePoint,
          timeline,
          partnerName,
        });
        setDraftBody(body);
        setStep("draft");
      } catch (err) {
        setGenErr(err instanceof Error ? err.message : "Failed to generate draft");
      }
    });
  }

  return (
    <Modal icon={<Mail size={14} strokeWidth={1.5} className="text-track-gold" />} title={`Draft email · ${contact.name}`} onClose={onClose} wide>
      {/* Anti-hallucination banner — always visible */}
      <div className="flex items-start gap-3 px-5 py-3 border-b border-graphite bg-flag-red/5">
        <ShieldAlert size={15} strokeWidth={1.5} className="text-flag-red shrink-0 mt-0.5" />
        <p className="text-[12px] text-bone-dim leading-snug">
          Claude will <span className="text-bone">not assume</span> a price, your role, a timeline, or any
          commitment it wasn&apos;t given. Anything missing comes back as a <span className="mono text-flag-red">[NEEDS INPUT]</span> marker
          in the draft — it is never guessed, and the draft can&apos;t save or send until you resolve it.
        </p>
      </div>

      {step === "inputs" ? (
        <div className="px-5 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>What&apos;s this email for? <span className="text-flag-red">*</span></Label>
            <Textarea rows={2} placeholder="e.g. Follow up on the 2-week pilot Heather asked for" value={purpose} onChange={(e) => setPurpose(e.target.value)} disabled={isGenerating} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Specific ask / CTA</Label>
              <Input placeholder="e.g. 20 min Thursday?" value={ask} onChange={(e) => setAsk(e.target.value)} disabled={isGenerating} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Your role / sign-off</Label>
              <Input placeholder="Managing Partner" value={senderRole} onChange={(e) => setSenderRole(e.target.value)} disabled={isGenerating} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Price / number to state</Label>
              <Input placeholder="Leave blank — don't guess" value={pricePoint} onChange={(e) => setPricePoint(e.target.value)} disabled={isGenerating} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Date / timeline to commit</Label>
              <Input placeholder="Leave blank — don't guess" value={timeline} onChange={(e) => setTimeline(e.target.value)} disabled={isGenerating} />
            </div>
          </div>

          <p className="flex items-start gap-2 text-[12px] text-bone-mute">
            <Sparkles size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-track-gold" />
            <span>
              Claude reads {contact.name.split(" ")[0]}&apos;s record and recent interactions for context. Leave any fact blank and it stays
              <span className="mono text-flag-red"> [NEEDS INPUT]</span> rather than invented.
            </span>
          </p>

          {genErr && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{genErr}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isGenerating}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={!purpose.trim() || isGenerating} onClick={runGenerate}>
              {isGenerating ? "Generating…" : "Generate draft"}
            </Button>
          </div>
        </div>
      ) : step === "draft" ? (
        <div className="px-5 py-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Sparkles size={13} strokeWidth={1.5} className="text-track-gold" />
            <span className="text-[13px] text-bone">Draft ready — edit freely, then save or send.</span>
          </div>
          <Textarea
            rows={14}
            className="font-body text-[13px] leading-relaxed"
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            disabled={isPersisting}
          />
          {needsInputCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red" />
              <span className="text-[12px] text-bone-dim">
                Claude flagged {needsInputCount} item(s) it would not guess. Fill these in before this can save or send.
              </span>
            </div>
          )}
          {persistErr && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{persistErr}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-1">
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep("inputs")} disabled={isPersisting || isGenerating}>← Edit inputs</Button>
              <Button variant="ghost" size="sm" onClick={runGenerate} disabled={isPersisting || isGenerating}>
                {isGenerating ? "Regenerating…" : "↻ Regenerate"}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={needsInputCount > 0 || isPersisting || !draftBody.trim()}
                onClick={() => {
                  setPersistErr(null);
                  startPersist(async () => {
                    try {
                      await saveEmailDraft(contact.id, { body: draftBody });
                      setSavedKind("draft");
                      setStep("saved");
                    } catch (err) {
                      setPersistErr(err instanceof Error ? err.message : "Failed to save draft");
                    }
                  });
                }}
              >
                {isPersisting && savedKind === null ? "Saving…" : "Save draft"}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={needsInputCount > 0 || isPersisting || !draftBody.trim()}
                onClick={() => {
                  setPersistErr(null);
                  startPersist(async () => {
                    try {
                      await sendEmail(contact.id, { body: draftBody });
                      setSavedKind("sent");
                      setStep("saved");
                    } catch (err) {
                      setPersistErr(err instanceof Error ? err.message : "Failed to send");
                    }
                  });
                }}
              >
                {isPersisting && savedKind === null ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-5 py-12 text-center">
          <div className="display-md text-track-gold mb-2 inline-block">
            {savedKind === "sent" ? "SENT" : "SAVED"}
          </div>
          <p className="text-[13px] text-bone-dim">
            {savedKind === "sent"
              ? `Email logged as sent to ${contact.name} · interaction recorded.`
              : `Draft saved to Drive · review on the Deliverables tab.`}
          </p>
          <div className="pt-5">
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Log interaction
   ────────────────────────────────────────────────────────────────────── */

function LogInteractionModal({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const [type, setType] = useState("call");
  const [date, setDate] = useState(TODAY);
  const [summary, setSummary] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await logInteraction(contact.id, { type, date, summary });
        setDone(true);
        setTimeout(onClose, 900);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to log interaction");
      }
    });
  }

  return (
    <Modal icon={<CalendarPlus size={14} strokeWidth={1.5} className="text-track-gold" />} title={`Log interaction · ${contact.name}`} onClose={onClose}>
      {done ? (
        <div className="px-5 py-12 text-center">
          <div className="display-md text-track-gold mb-2 inline-block">LOGGED</div>
          <p className="text-[13px] text-bone-dim">{interactionLabels[type]} · {date}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="px-5 py-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-9 px-3 bg-bitumen border border-graphite rounded-[var(--radius)] text-bone text-[14px] focus:border-track-gold focus:outline-none"
              >
                {Object.entries(interactionLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>What happened?</Label>
            <Textarea rows={4} placeholder="Short summary of the interaction…" value={summary} onChange={(e) => setSummary(e.target.value)} required />
          </div>
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" disabled={!summary.trim() || isPending}>
              {isPending ? "Logging…" : "Log it"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   AI enrich — non-destructive MERGE review, grounded in the interaction log.
   Claude reads ONLY the record + logged history (no web), proposes additions,
   and the partner approves. New list facts are ADDED; existing single-value
   fields are never overwritten — divergences come back as conflicts to resolve.

   Web search mode is not wired yet (no server-side web access) — it shows an
   honest "coming soon" rather than fabricating facts (no-hallucination rule).
   ────────────────────────────────────────────────────────────────────── */

const ENRICH_FIELD_LABELS: Record<string, string> = {
  persona: "Persona",
  communicationStyle: "Communication style",
  background: "Background",
  keyFacts: "Key facts",
  hobbies: "Hobbies",
  networkAffiliations: "Network affiliations",
};

function EnrichModal({ contact, mode, onClose }: { contact: Contact; mode: "search" | "ai"; onClose: () => void }) {
  const isSearch = mode === "search";
  const title = isSearch ? `Web search · ${contact.company}` : `AI enrich · ${contact.name}`;
  const Icon = isSearch ? Globe : Sparkles;

  const [phase, setPhase] = useState<"idle" | "results" | "applied">("idle");
  const [additions, setAdditions] = useState<EnrichAddition[]>([]);
  const [conflicts, setConflicts] = useState<EnrichConflict[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [appliedCount, setAppliedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, startRun] = useTransition();
  const [isApplying, startApply] = useTransition();

  function runEnrichment() {
    setError(null);
    startRun(async () => {
      try {
        const res = await generateEnrichment(contact.id);
        setAdditions(res.additions);
        setConflicts(res.conflicts);
        setSelected(new Set(res.additions.map((_, i) => i))); // all checked by default
        setPhase("results");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Enrichment failed");
      }
    });
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function apply() {
    setError(null);
    const chosen = additions.filter((_, i) => selected.has(i));
    startApply(async () => {
      try {
        const res = await applyEnrichment(contact.id, chosen);
        setAppliedCount(res.applied);
        setPhase("applied");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to apply");
      }
    });
  }

  // Web search: honest not-yet-wired state — never fabricate facts.
  if (isSearch) {
    return (
      <Modal icon={<Icon size={14} strokeWidth={1.5} className="text-track-gold" />} title={title} onClose={onClose} wide>
        <div className="px-5 py-6 flex flex-col gap-4">
          <p className="text-[13px] text-bone-dim leading-relaxed">
            Web-search enrichment isn&apos;t wired up yet — the ops tool has no server-side web access today, and
            inventing facts about {contact.company} would break the no-hallucination rule.
          </p>
          <div className="flex items-start gap-2 px-3 py-2 border border-graphite bg-bitumen rounded-[var(--radius-sm)]">
            <ShieldAlert size={13} strokeWidth={1.5} className="text-track-gold shrink-0 mt-0.5" />
            <span className="text-[12px] text-bone-dim">
              When connected, it will use the same <span className="text-bone">propose → approve → merge</span> flow as AI enrich —
              nothing written without your sign-off. For now, use <span className="text-bone">AI enrich</span> (grounded in the
              logged interactions).
            </span>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal icon={<Icon size={14} strokeWidth={1.5} className="text-track-gold" />} title={title} onClose={onClose} wide>
      {phase === "idle" && (
        <div className="px-5 py-6 flex flex-col gap-4">
          <p className="text-[13px] text-bone-dim leading-relaxed">
            Reads {contact.name.split(" ")[0]}&apos;s record and logged interactions, then proposes additions — persona,
            communication style, key facts, background. Grounded only in what&apos;s logged; nothing invented.
          </p>
          <div className="flex items-start gap-2 px-3 py-2 border border-graphite bg-bitumen rounded-[var(--radius-sm)]">
            <ShieldAlert size={13} strokeWidth={1.5} className="text-track-gold shrink-0 mt-0.5" />
            <span className="text-[12px] text-bone-dim">
              Non-destructive: results are <span className="text-bone">proposed</span>. You approve what gets added — existing facts are
              never overwritten, and anything that conflicts is flagged for you to resolve.
            </span>
          </div>
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isRunning}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={runEnrichment} disabled={isRunning}>
              {isRunning ? "Reading log…" : "Run enrichment"}
            </Button>
          </div>
        </div>
      )}

      {phase === "results" && (
        <div className="px-5 py-5 flex flex-col gap-5">
          {additions.length === 0 && conflicts.length === 0 ? (
            <p className="text-[13px] text-bone-dim leading-relaxed">
              Nothing new to add — the logged interactions don&apos;t support any additions beyond what&apos;s already on the record.
              That&apos;s the correct, honest result for a thin log.
            </p>
          ) : (
            <>
              {additions.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Label gold>— Proposed additions ({additions.length}) · check what to keep</Label>
                  <div className="border border-graphite rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
                    {additions.map((a, i) => (
                      <label
                        key={i}
                        className={`flex items-start gap-3 px-4 py-3 cursor-pointer ${i < additions.length - 1 ? "border-b border-graphite" : ""} ${selected.has(i) ? "" : "opacity-50"}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(i)}
                          onChange={() => toggle(i)}
                          className="mt-1 accent-track-gold"
                        />
                        <div className="min-w-0">
                          <Label>{ENRICH_FIELD_LABELS[a.field] ?? a.field}</Label>
                          <p className="text-[13px] text-bone mt-0.5 leading-snug">{a.value}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {conflicts.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Label>— Conflicts · review ({conflicts.length})</Label>
                  {conflicts.map((c, i) => (
                    <div key={i} className="border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] px-4 py-3 flex flex-col gap-2">
                      <Label>{ENRICH_FIELD_LABELS[c.field] ?? c.field}</Label>
                      <div className="grid grid-cols-2 gap-3 text-[13px]">
                        <div className="flex flex-col gap-1">
                          <span className="label text-[9px]">Keep (current)</span>
                          <span className="text-bone">{c.existing}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="label text-[9px]">Proposed</span>
                          <span className="text-bone-dim">{c.proposed}</span>
                        </div>
                      </div>
                      {c.note && <span className="text-[11px] text-bone-mute">{c.note}</span>}
                      <span className="text-[11px] text-bone-mute">Not applied — edit the record by hand if you want this.</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isApplying}>Discard</Button>
            {additions.length > 0 && (
              <Button variant="primary" size="sm" onClick={apply} disabled={isApplying || selected.size === 0}>
                {isApplying ? "Merging…" : `Add ${selected.size} (keep existing)`}
              </Button>
            )}
          </div>
        </div>
      )}

      {phase === "applied" && (
        <div className="px-5 py-12 text-center">
          <div className="display-md text-track-gold mb-2 inline-block">MERGED</div>
          <p className="text-[13px] text-bone-dim flex items-center justify-center gap-2">
            <Check size={14} strokeWidth={2} className="text-diagnostic-steel" />
            {appliedCount} fact(s) added to {contact.name}&apos;s record.
          </p>
          <div className="pt-5">
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
