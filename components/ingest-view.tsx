"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  X,
  ShieldAlert,
  Check,
  ChevronDown,
  ChevronRight,
  Sparkles,
  CircleAlert,
  Upload,
  FolderOpen,
} from "lucide-react";
import { Card, Label, Badge, Button, Input, Textarea, Select, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  extractAndQueue,
  approveProposal,
  rejectProposal,
  type ExtractedProposal,
  type ExtractedEnrich,
} from "@/app/(app)/ingest/actions";
import {
  approveProjectProposal,
  rejectProjectProposal,
  type ProjectExtractedProposal,
} from "@/app/(app)/projects/[id]/drop-actions";
import { IngestComposer } from "@/components/ingest/ingest-composer";
import UnifiedProposalCard from "@/components/ingest/unified-proposal-card";
import type { IngestTargetKind, UnifiedProposal } from "@/lib/ingest/types";

export type ProposalProp = {
  id: string;
  source: string; // "paste" | "fireflies" | "drop"
  title: string;
  meetingDate: string;
  createdBy: string;
  matchedContactId: string | null;
  matchedClientId: string | null;
  matchedProjectId: string | null;
  matchedDealId: string | null;
  projectLabel: string | null;
  // v1 (legacy) shape — read by ProposalCard / ProjectProposalCard.
  proposal: ExtractedProposal;
  // v2 (unified) — present when schemaVersion === 2; read by UnifiedProposalCard.
  schemaVersion?: number;
  data?: UnifiedProposal;
};

export function IngestView({
  proposals,
  partners,
  contacts,
  clients,
  projects,
  currentPartnerId,
  initialFocus,
}: {
  proposals: ProposalProp[];
  partners: { id: string; name: string }[];
  contacts: { id: string; name: string; company: string }[];
  clients: { id: string; company: string }[];
  projects: { id: string; name: string }[];
  currentPartnerId?: string;
  initialFocus?: { kind: IngestTargetKind; id: string } | null;
}) {
  const [composerOpen, setComposerOpen] = useState(!!initialFocus);
  const [expanded, setExpanded] = useState<string | null>(proposals[0]?.id ?? null);

  return (
    <div className="px-8 py-8 flex flex-col gap-8">
      <div className="flex items-start justify-between gap-6">
        <p className="text-[13px] text-bone-mute max-w-[680px] leading-relaxed">
          Pick a type, point it at the records it touches, and paste the notes, email, or document — Claude proposes
          changes across <span className="text-bone">every targeted record at once</span> and holds them here. Nothing is
          written until you approve it: every add is confirmed, every overwrite shows before → after. The partner is the gate.
        </p>
        <Button variant="primary" size="sm" onClick={() => setComposerOpen(true)}>
          <Plus size={13} strokeWidth={1.5} />
          Ingest
        </Button>
      </div>

      {proposals.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText size={28} strokeWidth={1.5} />}
            title="Nothing pending"
            hint="Start an ingest to propose changes across your records."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {proposals.map((p) =>
            p.schemaVersion === 2 && p.data ? (
              <UnifiedProposalCard
                key={p.id}
                proposal={{
                  id: p.id,
                  title: p.title,
                  ingestType: p.data.ingestType,
                  summary: p.data.summary,
                  createdBy: p.createdBy,
                  matchedContactId: p.matchedContactId,
                  matchedClientId: p.matchedClientId,
                  matchedProjectId: p.matchedProjectId,
                  matchedDealId: p.matchedDealId,
                  data: p.data,
                }}
                partners={partners}
                contacts={contacts}
                clients={clients}
                projects={projects}
                currentPartnerId={currentPartnerId ?? ""}
              />
            ) : p.source === "drop" && p.matchedProjectId ? (
              <ProjectProposalCard
                key={p.id}
                p={p}
                open={expanded === p.id}
                onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
              />
            ) : (
              <ProposalCard
                key={p.id}
                p={p}
                open={expanded === p.id}
                onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                partners={partners}
                contacts={contacts}
                clients={clients}
                currentPartnerId={currentPartnerId}
              />
            ),
          )}
        </div>
      )}

      {composerOpen && (
        <IngestComposer
          partners={partners}
          contacts={contacts}
          clients={clients}
          projects={projects}
          currentPartnerId={currentPartnerId ?? ""}
          initialFocus={initialFocus}
          onClose={() => setComposerOpen(false)}
        />
      )}
    </div>
  );
}

// Plain-text formats we can read in the browser straight into the transcript.
// Binary formats (.docx/.pdf) need server-side parsing — not wired; paste instead.
const TEXT_EXTS = [".txt", ".md", ".markdown", ".vtt", ".srt", ".text", ".log", ".rtf", ".csv"];

function PasteModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [emails, setEmails] = useState("");
  const [transcript, setTranscript] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function loadFile(file: File) {
    const lower = file.name.toLowerCase();
    const okExt = TEXT_EXTS.some((e) => lower.endsWith(e));
    const okType = file.type.startsWith("text/") || file.type === "";
    if (!okExt && !okType) {
      setError(`"${file.name}" looks like a binary file (e.g. .docx / .pdf). Export it to text/markdown, or paste the notes below.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setTranscript(text);
      setFileName(file.name);
      setError(null);
      if (!title.trim()) {
        setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim());
      }
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsText(file);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNote(null);
    startTransition(async () => {
      try {
        const res = await extractAndQueue({ transcript, title, meetingDate: date, participantEmails: emails });
        if (!res.matched) {
          setNote(res.ambiguous ? "Multiple known participants — left unassigned. Attach a contact in the review." : "No participant matched — left unassigned. Attach a contact in the review.");
        }
        router.refresh();
        setTimeout(onClose, res.matched ? 300 : 1600);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Extraction failed");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-bitumen/85 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-[680px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <FileText size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>Add meeting notes</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        <form onSubmit={submit} className="px-5 py-5 flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_160px] gap-4">
            <div className="flex flex-col gap-2">
              <Label>Meeting title <span className="text-flag-red">*</span></Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Brightline discovery call" required disabled={isPending} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={isPending} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Participant emails (optional)</Label>
            <Input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="comma-separated — used to match a contact" disabled={isPending} />
          </div>
          {/* Drop-in a notes/transcript file (no Fireflies needed) */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) loadFile(f); }}
            onClick={() => !isPending && fileInputRef.current?.click()}
            className={cn(
              "border border-dashed rounded-[var(--radius-lg)] px-4 py-5 flex flex-col items-center gap-1.5 text-center cursor-pointer transition-colors",
              dragging ? "border-track-gold bg-track-gold-dim/10" : "border-graphite hover:border-bone-mute",
              isPending && "opacity-50 pointer-events-none",
            )}
          >
            <Upload size={16} strokeWidth={1.5} className="text-track-gold" />
            {fileName ? (
              <span className="text-[12px] text-bone">Loaded <span className="text-track-gold">{fileName}</span> · edit below or drop another</span>
            ) : (
              <span className="text-[12px] text-bone-dim">Drop a notes file or <span className="text-track-gold">click to browse</span> · .txt .md .vtt .srt</span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,.vtt,.srt,.text,.log,.rtf,.csv,text/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Transcript / notes <span className="text-flag-red">*</span></Label>
            <Textarea rows={10} value={transcript} onChange={(e) => { setTranscript(e.target.value); if (fileName) setFileName(null); }} placeholder="Paste the notes or transcript here — or drop a file above…" required disabled={isPending} />
          </div>
          <div className="flex items-start gap-2 px-3 py-2 bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
            <ShieldAlert size={13} strokeWidth={1.5} className="text-track-gold shrink-0 mt-0.5" />
            <span className="text-[12px] text-bone-dim">Extraction proposes records for your review — nothing is written to a contact, deal, or task until you approve it.</span>
          </div>
          {note && (
            <div className="flex items-start gap-2 px-3 py-2 border border-track-gold/40 bg-track-gold-dim/10 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
              <CircleAlert size={13} strokeWidth={1.5} className="text-track-gold mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{note}</span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" disabled={isPending || !title.trim() || transcript.trim().length < 40}>
              {isPending ? "Extracting…" : "Extract → review"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const ENRICH_LABELS: Record<string, string> = {
  persona: "Persona",
  communicationStyle: "Communication style",
  background: "Background",
  keyFacts: "Key facts",
  hobbies: "Hobbies",
  networkAffiliations: "Network affiliations",
  companyKeyFacts: "Company key facts",
  brandColors: "Brand colors",
  description: "Description",
  headquarters: "HQ",
  founded: "Founded",
  website: "Website",
  ownership: "Ownership",
  companySize: "Company size",
  logoMonogram: "Logo monogram",
};

function ProposalCard({
  p,
  open,
  onToggle,
  partners,
  contacts,
  clients,
  currentPartnerId,
}: {
  p: ProposalProp;
  open: boolean;
  onToggle: () => void;
  partners: { id: string; name: string }[];
  contacts: { id: string; name: string; company: string }[];
  clients: { id: string; company: string }[];
  currentPartnerId?: string;
}) {
  const router = useRouter();
  const prop = p.proposal;

  const [summary, setSummary] = useState(prop.summary);
  const [contactId, setContactId] = useState(p.matchedContactId ?? "");
  const [clientId, setClientId] = useState(p.matchedClientId ?? "");

  // Action items — keep flag + owner + editable fields.
  const [items, setItems] = useState(
    prop.actionItems.map((a) => ({
      keep: true,
      title: a.title,
      ownerId: currentPartnerId ?? partners[0]?.id ?? "",
      context: a.context,
      due: a.due ?? p.meetingDate.slice(0, 10),
    })),
  );

  const [contactKeep, setContactKeep] = useState<boolean[]>(prop.enrichment.contact.map(() => true));
  const [clientKeep, setClientKeep] = useState<boolean[]>(prop.enrichment.client.map(() => true));

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve() {
    setError(null);
    const actionItems = items
      .filter((i) => i.keep && i.title.trim() && i.ownerId)
      .map((i) => ({ title: i.title, ownerId: i.ownerId, context: i.context, due: i.due }));
    const contactEnrich: ExtractedEnrich[] = prop.enrichment.contact.filter((_, i) => contactKeep[i]);
    const clientEnrich: ExtractedEnrich[] = prop.enrichment.client.filter((_, i) => clientKeep[i]);

    startTransition(async () => {
      try {
        await approveProposal(p.id, {
          contactId: contactId || null,
          clientId: clientId || null,
          summary,
          actionItems,
          contactEnrich,
          clientEnrich,
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to approve");
      }
    });
  }

  function reject() {
    if (!confirm("Reject this proposal? Nothing will be written.")) return;
    startTransition(async () => {
      try {
        await rejectProposal(p.id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reject");
      }
    });
  }

  const unassigned = !contactId && !clientId;

  return (
    <Card className={cn(isPending && "opacity-60")}>
      <button onClick={onToggle} className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[var(--color-row-hover)] transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          {open ? <ChevronDown size={15} strokeWidth={1.5} className="text-track-gold shrink-0" /> : <ChevronRight size={15} strokeWidth={1.5} className="text-bone-mute shrink-0" />}
          <FileText size={14} strokeWidth={1.5} className="text-track-gold shrink-0" />
          <div className="min-w-0">
            <span className="text-[14px] text-bone truncate">{p.title}</span>
            <p className="text-[11px] text-bone-mute">{new Date(p.meetingDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })} · {prop.actionItems.length} task(s) · {prop.enrichment.contact.length + prop.enrichment.client.length} enrichment</p>
          </div>
        </div>
        {unassigned ? <Badge tone="red">unassigned</Badge> : <Badge tone="gold">matched</Badge>}
      </button>

      {open && (
        <div className="px-5 py-5 flex flex-col gap-5">
          {/* Attach entity */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Contact (for the logged meeting)</Label>
              <Select value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={isPending}>
                <option value="">none</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.company}</option>)}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Client (for the filed transcript)</Label>
              <Select value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={isPending}>
                <option value="">none</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
              </Select>
            </div>
          </div>

          {/* Summary */}
          <div className="flex flex-col gap-2">
            <Label gold>Summary (logged as the interaction)</Label>
            <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} disabled={isPending} />
          </div>

          {/* Key points */}
          {prop.keyPoints.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Key points</Label>
              <ul className="flex flex-col gap-1">
                {prop.keyPoints.map((k, i) => (
                  <li key={i} className="text-[12px] text-bone-dim flex items-start gap-2"><span className="text-track-gold mt-0.5">·</span>{k}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Action items */}
          {items.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label gold>Action items → tasks ({items.filter((i) => i.keep).length} kept)</Label>
              <div className="flex flex-col gap-2">
                {items.map((it, i) => (
                  <div key={i} className={cn("bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] px-4 py-3 flex flex-col gap-2", !it.keep && "opacity-50")}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={it.keep} onChange={() => setItems((prev) => prev.map((x, j) => j === i ? { ...x, keep: !x.keep } : x))} className="accent-track-gold" />
                      <Input value={it.title} onChange={(e) => setItems((prev) => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} className="flex-1 h-8" disabled={isPending} />
                    </div>
                    <div className="grid grid-cols-[1fr_160px] gap-3 pl-7">
                      <Input value={it.context} onChange={(e) => setItems((prev) => prev.map((x, j) => j === i ? { ...x, context: e.target.value } : x))} placeholder="context" className="h-8 text-[12px]" disabled={isPending} />
                      <div className="flex gap-2">
                        <Select value={it.ownerId} onChange={(e) => setItems((prev) => prev.map((x, j) => j === i ? { ...x, ownerId: e.target.value } : x))} disabled={isPending} className="h-8 text-[12px]">
                          {partners.map((pt) => <option key={pt.id} value={pt.id}>{pt.name.split(" ")[0]}</option>)}
                        </Select>
                        <Input type="date" value={it.due} onChange={(e) => setItems((prev) => prev.map((x, j) => j === i ? { ...x, due: e.target.value } : x))} className="h-8 text-[11px] w-[120px]" disabled={isPending} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Enrichment */}
          {prop.enrichment.contact.length > 0 && (
            <EnrichGroup label="Contact enrichment (append-only)" items={prop.enrichment.contact} keep={contactKeep} setKeep={setContactKeep} disabled={isPending || !contactId} disabledNote={!contactId ? "Attach a contact to apply" : undefined} />
          )}
          {prop.enrichment.client.length > 0 && (
            <EnrichGroup label="Client enrichment (append-only)" items={prop.enrichment.client} keep={clientKeep} setKeep={setClientKeep} disabled={isPending || !clientId} disabledNote={!clientId ? "Attach a client to apply" : undefined} />
          )}

          {/* Stage signal — suggestion only */}
          {prop.stageSignal && (
            <div className="flex items-start gap-2 px-3 py-2 border border-track-gold/40 bg-track-gold-dim/10 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
              <Sparkles size={13} strokeWidth={1.5} className="text-track-gold mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">
                <span className="text-bone">Stage signal:</span> {prop.stageSignal.suggestion} · {prop.stageSignal.rationale}
                <span className="text-bone-mute"> (suggestion only · move the deal yourself on the board.)</span>
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-1">
            <Button variant="ghost" size="sm" onClick={reject} disabled={isPending}>Reject</Button>
            <Button variant="primary" size="sm" onClick={approve} disabled={isPending}>
              <Check size={13} strokeWidth={1.5} />
              {isPending ? "Writing…" : "Approve & write"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function EnrichGroup({
  label,
  items,
  keep,
  setKeep,
  disabled,
  disabledNote,
}: {
  label: string;
  items: ExtractedEnrich[];
  keep: boolean[];
  setKeep: (next: boolean[]) => void;
  disabled?: boolean;
  disabledNote?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Label>{label}</Label>
        {disabledNote && <span className="text-[11px] text-flag-red">{disabledNote}</span>}
      </div>
      <div className="bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
        {items.map((a, i) => (
          <label key={i} className={cn("flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-[var(--color-row-hover)] transition-colors", (disabled || !keep[i]) && "opacity-50")}>
            <input type="checkbox" checked={!disabled && keep[i]} disabled={disabled} onChange={() => setKeep(keep.map((k, j) => (j === i ? !k : k)))} className="mt-1 accent-track-gold" />
            <span className="min-w-0">
              <span className="label">{ENRICH_LABELS[a.field] ?? a.field}</span>
              <p className="text-[13px] text-bone mt-0.5 leading-snug">{a.value}</p>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Project-drop proposal card — milestones / tasks / contact facts / notes ──
const PRIORITY_OPTS = ["high", "medium", "low"] as const;
const M_STATUS_OPTS = ["pending", "in-progress", "complete", "at-risk"] as const;

function ProjectProposalCard({
  p,
  open,
  onToggle,
}: {
  p: ProposalProp;
  open: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const prop = p.proposal as unknown as ProjectExtractedProposal;

  const [summary, setSummary] = useState(prop.summary ?? "");
  const [projectNotes, setProjectNotes] = useState(prop.projectNotes ?? "");

  const [milestones, setMilestones] = useState(
    (prop.milestones ?? []).map((m) => ({
      keep: true,
      title: m.title,
      dueDate: m.dueDate ?? "",
      status: m.status || "pending",
    })),
  );
  const [tasks, setTasks] = useState(
    (prop.tasks ?? []).map((t) => ({
      keep: true,
      title: t.title,
      priority: t.priority || "medium",
      due: t.due ?? "",
      context: t.context ?? "",
    })),
  );
  const [facts, setFacts] = useState(
    (prop.contactKeyFacts ?? []).map((f) => ({ keep: true, value: f })),
  );
  const [interactions, setInteractions] = useState(
    (prop.interactions ?? []).map((it) => ({ keep: true, summary: it.summary, type: it.type || "other" })),
  );

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalItems =
    (prop.milestones?.length ?? 0) +
    (prop.tasks?.length ?? 0) +
    (prop.contactKeyFacts?.length ?? 0) +
    (prop.interactions?.length ?? 0);

  function approve() {
    setError(null);
    startTransition(async () => {
      try {
        await approveProjectProposal(p.id, {
          summary,
          projectNotes: projectNotes.trim() || null,
          contactKeyFacts: facts.filter((f) => f.keep && f.value.trim()).map((f) => f.value.trim()),
          milestones: milestones
            .filter((m) => m.keep && m.title.trim())
            .map((m) => ({ title: m.title, dueDate: m.dueDate || null, status: m.status })),
          tasks: tasks
            .filter((t) => t.keep && t.title.trim())
            .map((t) => ({ title: t.title, priority: t.priority, due: t.due || null, context: t.context })),
          interactions: interactions
            .filter((it) => it.keep && it.summary.trim())
            .map((it) => ({ summary: it.summary, type: it.type })),
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to approve");
      }
    });
  }

  function reject() {
    if (!confirm("Reject this proposal? Nothing will be written.")) return;
    startTransition(async () => {
      try {
        await rejectProjectProposal(p.id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reject");
      }
    });
  }

  const noContact = !p.matchedContactId;

  return (
    <Card className={cn(isPending && "opacity-60")}>
      <button onClick={onToggle} className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[var(--color-row-hover)] transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          {open ? <ChevronDown size={15} strokeWidth={1.5} className="text-track-gold shrink-0" /> : <ChevronRight size={15} strokeWidth={1.5} className="text-bone-mute shrink-0" />}
          <FolderOpen size={14} strokeWidth={1.5} className="text-track-gold shrink-0" />
          <div className="min-w-0">
            <span className="text-[14px] text-bone truncate">{p.title}</span>
            <p className="text-[11px] text-bone-mute truncate">
              {p.projectLabel ?? "Project"} · {prop.milestones?.length ?? 0} milestone(s) · {prop.tasks?.length ?? 0} task(s) · {prop.contactKeyFacts?.length ?? 0} fact(s)
            </p>
          </div>
        </div>
        <Badge tone="gold">project drop</Badge>
      </button>

      {open && (
        <div className="px-5 py-5 flex flex-col gap-5">
          {/* Summary */}
          <div className="flex flex-col gap-2">
            <Label gold>Summary</Label>
            <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} disabled={isPending} />
          </div>

          {/* Project notes (append-only to the project) */}
          <div className="flex flex-col gap-2">
            <Label>Project notes (appended to the project — leave blank to skip)</Label>
            <Textarea rows={2} value={projectNotes} onChange={(e) => setProjectNotes(e.target.value)} placeholder="Durable notes to append to this project…" disabled={isPending} />
          </div>

          {/* Milestones */}
          {milestones.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label gold>Milestones ({milestones.filter((m) => m.keep).length} kept)</Label>
              <div className="flex flex-col gap-2">
                {milestones.map((m, i) => (
                  <div key={i} className={cn("bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] px-4 py-3 flex flex-col gap-2", !m.keep && "opacity-50")}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={m.keep} onChange={() => setMilestones((prev) => prev.map((x, j) => j === i ? { ...x, keep: !x.keep } : x))} className="accent-track-gold" />
                      <Input value={m.title} onChange={(e) => setMilestones((prev) => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} className="flex-1 h-8" disabled={isPending} />
                    </div>
                    <div className="grid grid-cols-[160px_1fr] gap-3 pl-7">
                      <Input type="date" value={m.dueDate} onChange={(e) => setMilestones((prev) => prev.map((x, j) => j === i ? { ...x, dueDate: e.target.value } : x))} className="h-8 text-[11px]" disabled={isPending} />
                      <Select value={m.status} onChange={(e) => setMilestones((prev) => prev.map((x, j) => j === i ? { ...x, status: e.target.value } : x))} disabled={isPending} className="h-8 text-[12px]">
                        {M_STATUS_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tasks */}
          {tasks.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label gold>Tasks ({tasks.filter((t) => t.keep).length} kept · owned by you)</Label>
              <div className="flex flex-col gap-2">
                {tasks.map((it, i) => (
                  <div key={i} className={cn("bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] px-4 py-3 flex flex-col gap-2", !it.keep && "opacity-50")}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={it.keep} onChange={() => setTasks((prev) => prev.map((x, j) => j === i ? { ...x, keep: !x.keep } : x))} className="accent-track-gold" />
                      <Input value={it.title} onChange={(e) => setTasks((prev) => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} className="flex-1 h-8" disabled={isPending} />
                    </div>
                    <div className="grid grid-cols-[1fr_120px_120px] gap-3 pl-7">
                      <Input value={it.context} onChange={(e) => setTasks((prev) => prev.map((x, j) => j === i ? { ...x, context: e.target.value } : x))} placeholder="context" className="h-8 text-[12px]" disabled={isPending} />
                      <Select value={it.priority} onChange={(e) => setTasks((prev) => prev.map((x, j) => j === i ? { ...x, priority: e.target.value } : x))} disabled={isPending} className="h-8 text-[12px]">
                        {PRIORITY_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                      <Input type="date" value={it.due} onChange={(e) => setTasks((prev) => prev.map((x, j) => j === i ? { ...x, due: e.target.value } : x))} className="h-8 text-[11px]" disabled={isPending} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contact key facts (append-only) */}
          {facts.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Label>Contact key facts (append-only)</Label>
                {noContact && <span className="text-[11px] text-flag-red">No primary contact on file — facts will be skipped</span>}
              </div>
              <div className="bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
                {facts.map((f, i) => (
                  <label key={i} className={cn("flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-[var(--color-row-hover)] transition-colors", (noContact || !f.keep) && "opacity-50")}>
                    <input type="checkbox" checked={!noContact && f.keep} disabled={noContact} onChange={() => setFacts((prev) => prev.map((x, j) => j === i ? { ...x, keep: !x.keep } : x))} className="mt-1 accent-track-gold" />
                    <span className="text-[13px] text-bone leading-snug">{f.value}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Interactions */}
          {interactions.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Label>Interactions → logged on the contact</Label>
                {noContact && <span className="text-[11px] text-flag-red">No primary contact on file — interactions will be skipped</span>}
              </div>
              <div className="flex flex-col gap-2">
                {interactions.map((it, i) => (
                  <div key={i} className={cn("bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] px-4 py-3 flex items-start gap-3", (noContact || !it.keep) && "opacity-50")}>
                    <input type="checkbox" checked={!noContact && it.keep} disabled={noContact} onChange={() => setInteractions((prev) => prev.map((x, j) => j === i ? { ...x, keep: !x.keep } : x))} className="mt-1 accent-track-gold" />
                    <span className="text-[13px] text-bone leading-snug">{it.summary} <span className="text-bone-mute">· {it.type}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {totalItems === 0 && (
            <p className="text-[12px] text-bone-mute">Nothing concrete was extractable from this drop. Approve to file it, or reject.</p>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-1">
            <Button variant="ghost" size="sm" onClick={reject} disabled={isPending}>Reject</Button>
            <Button variant="primary" size="sm" onClick={approve} disabled={isPending}>
              <Check size={13} strokeWidth={1.5} />
              {isPending ? "Writing…" : "Approve & write"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
