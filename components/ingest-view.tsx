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
} from "lucide-react";
import { Card, Label, Badge, Button, Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  extractAndQueue,
  approveProposal,
  rejectProposal,
  type ExtractedProposal,
  type ExtractedEnrich,
} from "@/app/(app)/ingest/actions";

export type ProposalProp = {
  id: string;
  title: string;
  meetingDate: string;
  createdBy: string;
  matchedContactId: string | null;
  matchedClientId: string | null;
  proposal: ExtractedProposal;
};

export function IngestView({
  proposals,
  partners,
  contacts,
  clients,
  currentPartnerId,
}: {
  proposals: ProposalProp[];
  partners: { id: string; name: string }[];
  contacts: { id: string; name: string; company: string }[];
  clients: { id: string; company: string }[];
  currentPartnerId?: string;
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(proposals[0]?.id ?? null);

  return (
    <div className="px-8 py-8 flex flex-col gap-6">
      <div className="flex items-start justify-between gap-6">
        <p className="text-[13px] text-bone-mute max-w-[680px] leading-relaxed">
          Drop in a notes file or paste a transcript — Claude extracts a summary, action items, enrichment facts, and a
          stage signal, then holds them here as a <span className="text-bone">proposal</span>. Nothing is written until you
          approve it, item by item. Discovery calls are full of soft claims; the partner is the gate. (Fireflies auto-ingest
          plugs into this same queue once it&apos;s wired.)
        </p>
        <Button variant="primary" size="sm" onClick={() => setPasteOpen(true)}>
          <Plus size={13} strokeWidth={1.5} />
          Add meeting notes
        </Button>
      </div>

      {proposals.length === 0 ? (
        <Card className="px-5 py-12 text-center">
          <FileText size={22} strokeWidth={1.5} className="text-bone-mute mx-auto mb-3" />
          <p className="text-[13px] text-bone-dim">No pending meetings. Drop in notes or paste a transcript to start.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {proposals.map((p) => (
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
          ))}
        </div>
      )}

      {pasteOpen && <PasteModal onClose={() => setPasteOpen(false)} />}
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
      <div className="w-full max-w-[680px] bg-asphalt border border-graphite rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-graphite">
          <div className="flex items-center gap-3">
            <FileText size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>— Add meeting notes</Label>
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
              <span className="text-[12px] text-bone">Loaded <span className="text-track-gold">{fileName}</span> — edit below or drop another</span>
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
          <div className="flex items-start gap-2 px-3 py-2 border border-graphite bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
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
      <button onClick={onToggle} className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-graphite/30 transition-colors">
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
        <div className="px-5 py-5 border-t border-graphite flex flex-col gap-5">
          {/* Attach entity */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Contact (for the logged meeting)</Label>
              <select value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={isPending} className="h-9 px-3 bg-bitumen border border-graphite rounded-[var(--radius)] text-bone text-[13px] focus:border-track-gold focus:outline-none">
                <option value="">— none —</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.company}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Client (for the filed transcript)</Label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={isPending} className="h-9 px-3 bg-bitumen border border-graphite rounded-[var(--radius)] text-bone text-[13px] focus:border-track-gold focus:outline-none">
                <option value="">— none —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
              </select>
            </div>
          </div>

          {/* Summary */}
          <div className="flex flex-col gap-2">
            <Label gold>— Summary (logged as the interaction)</Label>
            <Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} disabled={isPending} />
          </div>

          {/* Key points */}
          {prop.keyPoints.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>— Key points</Label>
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
              <Label gold>— Action items → tasks ({items.filter((i) => i.keep).length} kept)</Label>
              <div className="flex flex-col gap-2">
                {items.map((it, i) => (
                  <div key={i} className={cn("border border-graphite rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] px-4 py-3 flex flex-col gap-2", !it.keep && "opacity-50")}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={it.keep} onChange={() => setItems((prev) => prev.map((x, j) => j === i ? { ...x, keep: !x.keep } : x))} className="accent-track-gold" />
                      <Input value={it.title} onChange={(e) => setItems((prev) => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} className="flex-1 h-8" disabled={isPending} />
                    </div>
                    <div className="grid grid-cols-[1fr_160px] gap-3 pl-7">
                      <Input value={it.context} onChange={(e) => setItems((prev) => prev.map((x, j) => j === i ? { ...x, context: e.target.value } : x))} placeholder="context" className="h-8 text-[12px]" disabled={isPending} />
                      <div className="flex gap-2">
                        <select value={it.ownerId} onChange={(e) => setItems((prev) => prev.map((x, j) => j === i ? { ...x, ownerId: e.target.value } : x))} disabled={isPending} className="h-8 px-2 bg-bitumen border border-graphite rounded-[var(--radius)] text-bone text-[12px] focus:border-track-gold focus:outline-none min-w-0 flex-1">
                          {partners.map((pt) => <option key={pt.id} value={pt.id}>{pt.name.split(" ")[0]}</option>)}
                        </select>
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
                <span className="text-bone">Stage signal:</span> {prop.stageSignal.suggestion} — {prop.stageSignal.rationale}
                <span className="text-bone-mute"> (suggestion only — move the deal yourself on the board.)</span>
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
        <Label>— {label}</Label>
        {disabledNote && <span className="text-[11px] text-flag-red">{disabledNote}</span>}
      </div>
      <div className="border border-graphite rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
        {items.map((a, i) => (
          <label key={i} className={cn("flex items-start gap-3 px-4 py-2.5 cursor-pointer", i < items.length - 1 && "border-b border-graphite", (disabled || !keep[i]) && "opacity-50")}>
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
