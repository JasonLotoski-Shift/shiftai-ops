"use client";

import { useState } from "react";
import {
  X,
  Mail,
  CalendarPlus,
  Globe,
  Sparkles,
  ShieldAlert,
  Check,
  Plus,
  Lock,
} from "lucide-react";
import { Button, Label, Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Contact } from "@/lib/types";
import { interactionLabels } from "@/lib/data/seed";

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
        className={cn("w-full bg-asphalt border border-graphite mb-20", wide ? "max-w-[680px]" : "max-w-[520px]")}
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
  const [step, setStep] = useState<"inputs" | "draft">("inputs");
  const [purpose, setPurpose] = useState("");
  const [senderRole, setSenderRole] = useState("");
  const [pricePoint, setPricePoint] = useState("");
  const [timeline, setTimeline] = useState("");
  const [ask, setAsk] = useState("");

  const firstName = contact.name.split(" ")[0];
  const missing = [
    !senderRole && "your role / sign-off",
    !pricePoint && "any price or number to state",
    !timeline && "any date or timeline to commit to",
  ].filter(Boolean) as string[];

  const NEEDS = (v: string, what: string) => (v.trim() ? v.trim() : `[NEEDS INPUT — ${what}]`);

  const body = `Hi ${firstName},

${purpose.trim() || "[NEEDS INPUT — purpose of this email]"}

${pricePoint.trim() ? `Investment: ${pricePoint.trim()}.` : "[NEEDS INPUT — Claude will not invent a price; supply it or leave for you to add]"}
${timeline.trim() ? `Timeline: ${timeline.trim()}.` : "[NEEDS INPUT — Claude will not invent a timeline; supply it or leave for you to add]"}

${ask.trim() || "[NEEDS INPUT — the specific ask / call to action]"}

Best,
${partnerName || "[NEEDS INPUT — sender name]"}
${NEEDS(senderRole, "sender role")}, Shift AI`;

  return (
    <Modal icon={<Mail size={14} strokeWidth={1.5} className="text-track-gold" />} title={`Draft email · ${contact.name}`} onClose={onClose} wide>
      {/* Anti-hallucination banner — always visible */}
      <div className="flex items-start gap-3 px-5 py-3 border-b border-graphite bg-flag-red/5">
        <ShieldAlert size={15} strokeWidth={1.5} className="text-flag-red shrink-0 mt-0.5" />
        <p className="text-[12px] text-bone-dim leading-snug">
          Claude will <span className="text-bone">not assume</span> a price, your role, a timeline, or any
          commitment it wasn&apos;t given. Anything left blank stays a <span className="mono text-flag-red">[NEEDS INPUT]</span> marker
          in the draft — it is never guessed.
        </p>
      </div>

      {step === "inputs" ? (
        <div className="px-5 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Purpose <span className="text-flag-red">*</span></Label>
            <Textarea rows={2} placeholder="e.g. Follow up on the 2-week pilot Heather asked for" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Your role / sign-off</Label>
              <Input placeholder="Managing Partner" value={senderRole} onChange={(e) => setSenderRole(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Price / number to state</Label>
              <Input placeholder="Leave blank — don't guess" value={pricePoint} onChange={(e) => setPricePoint(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Date / timeline to commit</Label>
              <Input placeholder="Leave blank — don't guess" value={timeline} onChange={(e) => setTimeline(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Specific ask / CTA</Label>
              <Input placeholder="e.g. 20 min Thursday?" value={ask} onChange={(e) => setAsk(e.target.value)} />
            </div>
          </div>

          {missing.length > 0 && (
            <div className="flex items-start gap-2 text-[12px] text-bone-mute">
              <Lock size={12} strokeWidth={1.5} className="mt-0.5 shrink-0" />
              <span>
                {missing.length} field{missing.length > 1 ? "s" : ""} left blank ({missing.join(", ")}) — these will appear as
                <span className="mono text-flag-red"> [NEEDS INPUT]</span> in the draft for you to fill, not invented.
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={!purpose.trim()} onClick={() => setStep("draft")}>
              Generate draft
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-5 py-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Sparkles size={13} strokeWidth={1.5} className="text-track-gold" />
            <span className="text-[13px] text-bone">Draft ready — review the flagged items before sending.</span>
          </div>
          <pre className="whitespace-pre-wrap font-body text-[13px] text-bone leading-relaxed bg-bitumen border border-graphite p-4">
            {body}
          </pre>
          {body.includes("[NEEDS INPUT") && (
            <div className="flex items-center gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red" />
              <span className="text-[12px] text-bone-dim">
                Claude flagged {(body.match(/\[NEEDS INPUT/g) || []).length} item(s) it would not guess. Fill these in before this can send.
              </span>
            </div>
          )}
          <div className="flex justify-between items-center pt-1">
            <Button variant="ghost" size="sm" onClick={() => setStep("inputs")}>← Edit inputs</Button>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>Save draft</Button>
              <Button variant="primary" size="sm" disabled={body.includes("[NEEDS INPUT")}>
                Send
              </Button>
            </div>
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setDone(true);
    setTimeout(onClose, 900);
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
                className="h-9 px-3 bg-bitumen border border-graphite text-bone text-[14px] focus:border-track-gold focus:outline-none"
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
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" disabled={!summary.trim()}>Log it</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Web search + AI enrich — both end in a non-destructive MERGE review.
   New facts are ADDED; nothing existing is silently overwritten. Anything that
   conflicts with a known fact is flagged for the partner to resolve.
   ────────────────────────────────────────────────────────────────────── */

function EnrichModal({ contact, mode, onClose }: { contact: Contact; mode: "search" | "ai"; onClose: () => void }) {
  const [phase, setPhase] = useState<"idle" | "running" | "results" | "applied">("idle");

  const isSearch = mode === "search";
  const title = isSearch ? `Web search · ${contact.company}` : `AI enrich · ${contact.name}`;
  const Icon = isSearch ? Globe : Sparkles;
  const sourceLine = isSearch
    ? "Searches the public web (news, filings, company site, professional profiles) and proposes additions."
    : "Reads this contact's communications log and proposes additions to the record.";

  const additions = isSearch
    ? [
        { field: "Background", value: `Public profile confirms 20+ yrs in ${contact.industry}; named to a regional industry board in 2024.` },
        { field: "Network affiliations", value: "Industry association membership (verified on association directory)." },
        { field: "Key facts", value: "Company referenced an ownership-succession plan in a recent trade-press interview." },
      ]
    : [
        { field: "Key facts", value: "Wants success measured concretely (their words across two logged calls) — surface metrics early." },
        { field: "Communication style", value: "Prefers short calls + bullet recaps over long email (pattern across logged interactions)." },
        { field: "Persona", value: "Proof-driven operator — asks to see the build run before committing." },
      ];

  const conflicts = isSearch
    ? [{ field: "Title", existing: contact.title, found: "Chief Operating Officer (long form on company site)" }]
    : [];

  return (
    <Modal icon={<Icon size={14} strokeWidth={1.5} className="text-track-gold" />} title={title} onClose={onClose} wide>
      {phase === "idle" && (
        <div className="px-5 py-6 flex flex-col gap-4">
          <p className="text-[13px] text-bone-dim leading-relaxed">{sourceLine}</p>
          <div className="flex items-start gap-2 px-3 py-2 border border-graphite bg-bitumen">
            <ShieldAlert size={13} strokeWidth={1.5} className="text-track-gold shrink-0 mt-0.5" />
            <span className="text-[12px] text-bone-dim">
              Non-destructive: results are <span className="text-bone">proposed</span>. You approve what gets added — existing facts are
              never overwritten, and anything that conflicts is flagged for you to resolve.
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={() => { setPhase("running"); setTimeout(() => setPhase("results"), 1100); }}>
              {isSearch ? "Run web search" : "Run enrichment"}
            </Button>
          </div>
        </div>
      )}

      {phase === "running" && (
        <div className="px-5 py-14 text-center flex flex-col items-center gap-3">
          <Icon size={22} strokeWidth={1.5} className="text-track-gold animate-pulse" />
          <span className="label">{isSearch ? "Searching the web…" : "Reading communications log…"}</span>
        </div>
      )}

      {(phase === "results" || phase === "applied") && (
        <div className="px-5 py-5 flex flex-col gap-5">
          {/* Proposed additions */}
          <div className="flex flex-col gap-2">
            <Label gold>— Proposed additions ({additions.length})</Label>
            <div className="border border-graphite">
              {additions.map((a, i) => (
                <div key={i} className={`flex items-start gap-3 px-4 py-3 ${i < additions.length - 1 ? "border-b border-graphite" : ""}`}>
                  <Plus size={13} strokeWidth={2} className="text-diagnostic-steel shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <Label>{a.field}</Label>
                    <p className="text-[13px] text-bone mt-0.5 leading-snug">{a.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Conflicts — never auto-overwritten */}
          {conflicts.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>— Conflicts · review ({conflicts.length})</Label>
              {conflicts.map((c, i) => (
                <div key={i} className="border border-flag-red/40 bg-flag-red/5 px-4 py-3 flex flex-col gap-2">
                  <Label>{c.field}</Label>
                  <div className="grid grid-cols-2 gap-3 text-[13px]">
                    <div className="flex flex-col gap-1">
                      <span className="label text-[9px]">Keep (current)</span>
                      <span className="text-bone">{c.existing}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="label text-[9px]">Found</span>
                      <span className="text-bone-dim">{c.found}</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-bone-mute">Not applied — your call which wins.</span>
                </div>
              ))}
            </div>
          )}

          {phase === "applied" ? (
            <div className="flex items-center gap-2 px-3 py-2 border border-diagnostic-steel/40 bg-diagnostic-steel/10">
              <Check size={14} strokeWidth={2} className="text-diagnostic-steel" />
              <span className="text-[13px] text-bone">Additions merged into the record. Conflicts left for review.</span>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Discard</Button>
              <Button variant="primary" size="sm" onClick={() => setPhase("applied")}>
                Add {additions.length} (keep existing)
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
