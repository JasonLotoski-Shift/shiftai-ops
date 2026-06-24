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
  FileInput,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button, Label, Input, Textarea, Select } from "@/components/ui";
import { ActionsPanel, type ActionBox } from "@/components/actions-panel";
import { ModalShell } from "@/components/modal-shell";
import { cn } from "@/lib/cn";
import type { ContactModel as Contact } from "@/lib/generated/prisma/models";
import { interactionLabels } from "@/lib/data/seed";
import { DraftEmailModal } from "@/components/draft-email-modal";
import {
  logInteraction,
  generateEnrichment,
  generateWebEnrichment,
  applyEnrichment,
  type EnrichAddition,
  type EnrichConflict,
} from "@/app/(app)/contacts/[id]/actions";
import { updateContact } from "@/app/(app)/contacts/actions";

type ActionKey = "email" | "log" | "edit" | "search" | "enrich";

const TODAY = "2026-05-19";

// A contact's company hat as the edit modal consumes it (subset of the
// ContactAffiliation row — the page passes these in primary-first order).
export type AffiliationRow = {
  id: string;
  company: string;
  title: string | null;
  isPrimary: boolean;
  sortOrder: number;
};

export function ContactActions({
  contact,
  affiliations = [],
  partnerName,
  ranAt = {},
  savedAt = {},
}: {
  contact: Contact;
  affiliations?: AffiliationRow[];
  partnerName?: string;
  /** box key → last run date (green "last ran" state). */
  ranAt?: Record<string, Date | undefined>;
  /** box key → saved step-1 draft date (orange "step 1 of 2 saved" state). */
  savedAt?: Record<string, Date | undefined>;
}) {
  const [open, setOpen] = useState<ActionKey | null>(null);
  // Whether the email editor is reopening from a saved step-1 draft.
  const [reopenEmail, setReopenEmail] = useState(false);

  // Auto-open the matching modal when launched from a dashboard Quick Action
  // (which routes here with ?qa=email / ?qa=enrich after the contact is picked).
  const searchParams = useSearchParams();
  const qa = searchParams.get("qa");
  useEffect(() => {
    if (qa === "email") setOpen("email");
    else if (qa === "enrich") setOpen("enrich");
  }, [qa]);

  const actions: ActionBox[] = [
    {
      key: "email",
      icon: Mail,
      title: "Draft email",
      description: "Draft an email to this contact.",
      onClick: () => {
        if (savedAt["email"]) setReopenEmail(true);
        setOpen("email");
      },
      gold: true,
      ranAt: ranAt["email"],
      stepOneSavedAt: savedAt["email"],
    },
    {
      key: "log",
      icon: CalendarPlus,
      title: "Log interaction",
      description: "Record a call, meeting, or email.",
      onClick: () => setOpen("log"),
    },
    {
      key: "edit",
      icon: Pencil,
      title: "Edit details",
      description: "Update reach info and personal details.",
      onClick: () => setOpen("edit"),
    },
    {
      key: "search",
      icon: Globe,
      title: "Enrich from web",
      description: "Find public facts and add them to the record.",
      onClick: () => setOpen("search"),
    },
    {
      key: "enrich",
      icon: Sparkles,
      title: "AI enrich",
      description: "Build the record from the logged interactions.",
      onClick: () => setOpen("enrich"),
    },
    {
      key: "ingest",
      icon: FileInput,
      title: "Ingest",
      description: "Drop in notes or a transcript to file against this contact.",
      href: `/ingest?focus=contact:${contact.id}`,
    },
  ];

  return (
    <>
      <ActionsPanel actions={actions} forceOpen={qa === "email" || qa === "enrich"} />

      {open === "email" && (
        <DraftEmailModal
          contactId={contact.id}
          contactName={contact.name}
          partnerName={partnerName}
          reopenDraft={reopenEmail}
          onClose={() => {
            setOpen(null);
            setReopenEmail(false);
          }}
        />
      )}
      {open === "log" && <LogInteractionModal contact={contact} onClose={() => setOpen(null)} />}
      {open === "edit" && <EditContactModal contact={contact} affiliations={affiliations} onClose={() => setOpen(null)} />}
      {open === "search" && <EnrichModal contact={contact} mode="web" onClose={() => setOpen(null)} />}
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
    <ModalShell onClose={onClose} positionClassName="items-start justify-center pt-20 px-4">
      <div
        className={cn("w-full bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20", wide ? "max-w-[680px]" : "max-w-[520px]")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            {icon}
            <span className="title-md">{title}</span>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        {children}
      </div>
    </ModalShell>
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
        <div className="px-5 py-12 flex flex-col items-center text-center gap-3">
          <Check size={28} strokeWidth={1.5} className="text-track-gold" />
          <p className="text-[15px] text-bone leading-relaxed">{interactionLabels[type]} · {date}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="px-5 py-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {Object.entries(interactionLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
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
   Edit details — reach info + personal details (D40). Only the fields the
   partner touches are written; clearing a field clears it on the record.
   relationshipStrength is partner judgment — this modal is the only way
   it gets set (never AI-proposed).
   ────────────────────────────────────────────────────────────────────── */

const PREFERRED_CHANNEL_OPTIONS: [string, string][] = [
  ["", "—"],
  ["email", "Email"],
  ["call", "Call"],
  ["text", "Text"],
  ["linkedin", "LinkedIn"],
];

const RELATIONSHIP_STRENGTH_OPTIONS: [string, string][] = [
  ["", "—"],
  ["cold", "Cold"],
  ["warm", "Warm"],
  ["strong", "Strong"],
];

// One editable affiliation row in the modal (no id — recreated on save).
type EditAffiliation = { company: string; title: string; isPrimary: boolean };

function EditContactModal({
  contact,
  affiliations,
  onClose,
}: {
  contact: Contact;
  affiliations: AffiliationRow[];
  onClose: () => void;
}) {
  // Company hats — seed from the affiliations (primary first), or synthesize one
  // from the scalar company/title for a contact created before this existed.
  const [affs, setAffs] = useState<EditAffiliation[]>(
    affiliations.length > 0
      ? affiliations.map((a) => ({ company: a.company, title: a.title ?? "", isPrimary: a.isPrimary }))
      : [{ company: contact.company, title: contact.title === "—" ? "" : contact.title, isPrimary: true }],
  );
  const [email, setEmail] = useState(contact.email);
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [mobilePhone, setMobilePhone] = useState(contact.mobilePhone ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(contact.linkedinUrl ?? "");
  const [location, setLocation] = useState(contact.location ?? "");
  const [timezone, setTimezone] = useState(contact.timezone ?? "");
  const [preferredChannel, setPreferredChannel] = useState(contact.preferredChannel ?? "");
  const [relationshipStrength, setRelationshipStrength] = useState(
    contact.relationshipStrength ?? "",
  );
  const [importantDates, setImportantDates] = useState(
    (contact.importantDates ?? []).join("\n"),
  );
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ── Affiliation row helpers ──
  function patchAff(i: number, patch: Partial<EditAffiliation>) {
    setAffs((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }
  function setPrimary(i: number) {
    setAffs((prev) => prev.map((a, idx) => ({ ...a, isPrimary: idx === i })));
  }
  function addAff() {
    setAffs((prev) => [...prev, { company: "", title: "", isPrimary: false }]);
  }
  function removeAff(i: number) {
    setAffs((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      // Never leave the list without a primary.
      if (next.length > 0 && !next.some((a) => a.isPrimary)) next[0].isPrimary = true;
      return next;
    });
  }

  // At least one row needs a company before save is allowed.
  const hasCompany = affs.some((a) => a.company.trim().length > 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!hasCompany) {
      setError("Add at least one company");
      return;
    }
    startTransition(async () => {
      try {
        await updateContact(contact.id, {
          // The affiliations govern company/title (primary row syncs to scalar).
          affiliations: affs
            .filter((a) => a.company.trim().length > 0)
            .map((a) => ({ company: a.company, title: a.title, isPrimary: a.isPrimary })),
          email,
          phone,
          mobilePhone,
          linkedinUrl,
          location,
          timezone,
          preferredChannel,
          relationshipStrength,
          // One date per line (commas work too) — e.g. "Birthday — March 12".
          importantDates: importantDates
            .split(/\r?\n|,/)
            .map((d) => d.trim())
            .filter(Boolean),
        });
        setDone(true);
        setTimeout(onClose, 900);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save changes");
      }
    });
  }

  return (
    <Modal icon={<Pencil size={14} strokeWidth={1.5} className="text-track-gold" />} title={`Edit details · ${contact.name}`} onClose={onClose} wide>
      {done ? (
        <div className="px-5 py-12 flex flex-col items-center text-center gap-3">
          <Check size={28} strokeWidth={1.5} className="text-track-gold" />
          <p className="text-[15px] text-bone leading-relaxed">Details saved.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="px-5 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Roles &amp; companies</Label>
              <button
                type="button"
                onClick={addAff}
                className="flex items-center gap-1 text-[12px] text-track-gold hover:text-track-gold/80"
              >
                <Plus size={12} strokeWidth={1.5} /> Add company
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {affs.map((aff, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    <Input
                      value={aff.company}
                      onChange={(e) => patchAff(i, { company: e.target.value })}
                      placeholder="Company"
                    />
                    <Input
                      value={aff.title}
                      onChange={(e) => patchAff(i, { title: e.target.value })}
                      placeholder="Role — e.g. CEO"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 h-9 px-1 text-[12px] text-bone-dim cursor-pointer shrink-0" title="Primary company — shown as the contact's main company">
                    <input
                      type="radio"
                      name="primary-affiliation"
                      checked={aff.isPrimary}
                      onChange={() => setPrimary(i)}
                      className="accent-track-gold"
                    />
                    Primary
                  </label>
                  <button
                    type="button"
                    onClick={() => removeAff(i)}
                    disabled={affs.length === 1}
                    className="h-9 px-1 text-bone-mute hover:text-flag-red disabled:opacity-30 disabled:hover:text-bone-mute shrink-0"
                    title="Remove"
                  >
                    <Trash2 size={14} strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
            <span className="text-[11px] text-bone-mute">
              The primary company is the contact&apos;s main one (used across the tool). Add more for people who wear more than one hat.
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label>LinkedIn</Label>
              <Input value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Mobile phone</Label>
              <Input value={mobilePhone} onChange={(e) => setMobilePhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Location</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Vancouver, BC" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Timezone</Label>
              <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="PT" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Preferred channel</Label>
              <Select value={preferredChannel} onChange={(e) => setPreferredChannel(e.target.value)}>
                {PREFERRED_CHANNEL_OPTIONS.map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Relationship strength</Label>
              <Select value={relationshipStrength} onChange={(e) => setRelationshipStrength(e.target.value)}>
                {RELATIONSHIP_STRENGTH_OPTIONS.map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Important dates</Label>
            <Textarea
              rows={3}
              placeholder={"One per line — e.g. Birthday — March 12"}
              value={importantDates}
              onChange={(e) => setImportantDates(e.target.value)}
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" disabled={!hasCompany || !email.trim() || isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Enrich — non-destructive MERGE review. Two modes, one flow:

   - "ai":  reads ONLY the record + logged interactions (no web).
   - "web": uses web search to find public, professional facts about the
            person, citing sources inline (enrich-contact-web skill).

   Both PROPOSE additions; the partner approves. New list facts are ADDED;
   existing single-value fields are never overwritten — divergences come back
   as conflicts to resolve by hand. Same applyEnrichment() merge for both.
   ────────────────────────────────────────────────────────────────────── */

const ENRICH_FIELD_LABELS: Record<string, string> = {
  persona: "Persona",
  communicationStyle: "Communication style",
  background: "Background",
  keyFacts: "Key facts",
  hobbies: "Hobbies",
  networkAffiliations: "Network affiliations",
  domain: "Website",
  linkedinUrl: "LinkedIn",
  location: "Location",
  timezone: "Timezone",
};

function EnrichModal({ contact, mode, onClose }: { contact: Contact; mode: "web" | "ai"; onClose: () => void }) {
  const isWeb = mode === "web";
  const title = isWeb ? `Enrich from web · ${contact.name}` : `AI enrich · ${contact.name}`;
  const Icon = isWeb ? Globe : Sparkles;

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
        const res = isWeb
          ? await generateWebEnrichment(contact.id)
          : await generateEnrichment(contact.id);
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

  return (
    <Modal icon={<Icon size={14} strokeWidth={1.5} className="text-track-gold" />} title={title} onClose={onClose} wide>
      {phase === "idle" && (
        <div className="px-5 py-6 flex flex-col gap-4">
          {isWeb ? (
            <p className="text-[13px] text-bone-dim leading-relaxed">
              Searches the public web for {contact.name.split(" ")[0]} (using name, title, and company to find the right person),
              then proposes additions — background, key facts, network affiliations — with a source cited on each. Public,
              professional facts only; nothing private, nothing invented.
            </p>
          ) : (
            <p className="text-[13px] text-bone-dim leading-relaxed">
              Reads {contact.name.split(" ")[0]}&apos;s record and logged interactions, then proposes additions — persona,
              communication style, key facts, background. Grounded only in what&apos;s logged; nothing invented.
            </p>
          )}
          <div className="flex items-start gap-2 px-3 py-2 bg-bitumen rounded-[var(--radius-sm)]">
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
              {isRunning ? (isWeb ? "Searching the web…" : "Reading log…") : "Run enrichment"}
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
                  <Label gold>Proposed additions ({additions.length}) · check what to keep</Label>
                  <div className="bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
                    {additions.map((a, i) => (
                      <label
                        key={i}
                        className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--color-row-hover)] ${i > 0 ? "border-t border-graphite/30" : ""} ${selected.has(i) ? "" : "opacity-50"}`}
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
                  <Label>Conflicts · review ({conflicts.length})</Label>
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
        <div className="px-5 py-12 flex flex-col items-center text-center gap-3">
          <Check size={28} strokeWidth={1.5} className="text-track-gold" />
          <p className="text-[15px] text-bone leading-relaxed">
            {appliedCount} fact(s) added to {contact.name}&apos;s record.
          </p>
          <div className="pt-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
