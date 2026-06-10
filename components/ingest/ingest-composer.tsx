"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileInput,
  X,
  Upload,
  ShieldAlert,
  Sparkles,
  Plus,
  Search,
  UserPlus,
  CircleAlert,
  Check,
} from "lucide-react";
import { Button, Label, Input, Textarea, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { industryLabels } from "@/lib/data/seed";
import { INGEST_TYPES, type IngestType, type IngestTargetKind } from "@/lib/ingest/types";
import {
  detectTargets,
  extractUnified,
  checkContactDuplicate,
  addContactInline,
} from "@/app/(app)/ingest/composer-actions";

// Plain-text formats read straight into the content box in the browser.
const TEXT_EXTS = [".txt", ".md", ".markdown", ".vtt", ".srt", ".text", ".log", ".csv", ".rtf"];
// Binary formats now read server-side (lib/ingest/extract-file.ts) — the browser
// base64-uploads the bytes and the extract action parses them.
const BINARY_EXTS = [".pdf", ".docx", ".xlsx", ".xls", ".html", ".htm", ".png", ".jpg", ".jpeg", ".gif", ".webp"];
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB client-side cap

type Opt = { id: string; name: string; company: string };
type ClientOpt = { id: string; company: string };
type ProjectOpt = { id: string; name: string };
type DealOpt = { id: string; name: string };
type PartnerOpt = { id: string; name: string };

// One picked target in the composer. `id` may be "" for the not-yet-saved
// inline contact (resolved on add). `focus` marks the primary record.
type Target = {
  kind: IngestTargetKind;
  id: string;
  label: string;
  focus?: boolean;
  detected?: boolean;
};

const TYPE_LABELS: Record<IngestType, string> = {
  interaction: "Interaction",
  meeting: "Meeting",
  email: "Email",
  document: "Document",
};

const TYPE_HINTS: Record<IngestType, string> = {
  interaction: "A call, DM, or quick touch — logged on the contact.",
  meeting: "A discovery call or working session with notes / a transcript.",
  email: "An email or thread — paste the message into the email box.",
  document: "A brief, SOW, deck, or doc — drop the file or paste the text.",
};

export function IngestComposer({
  partners,
  contacts,
  clients,
  projects,
  deals,
  currentPartnerId,
  initialFocus,
  onClose,
}: {
  partners: PartnerOpt[];
  contacts: Opt[];
  clients: ClientOpt[];
  projects: ProjectOpt[];
  deals: DealOpt[];
  currentPartnerId: string;
  initialFocus?: { kind: IngestTargetKind; id: string } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [ingestType, setIngestType] = useState<IngestType>("meeting");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [content, setContent] = useState("");
  const [emailBlock, setEmailBlock] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  // Binary files (PDF/Word/Excel/HTML) base64-uploaded for server-side parsing.
  const [files, setFiles] = useState<{ base64: string; mimeType: string; fileName: string }[]>([]);
  const [dragging, setDragging] = useState(false);

  const [targets, setTargets] = useState<Target[]>(() =>
    initialFocus ? [resolveTarget(initialFocus.kind, initialFocus.id, { contacts, clients, projects, deals }, true)] : [],
  );

  const [detecting, startDetect] = useTransition();
  const [detectNote, setDetectNote] = useState<string | null>(null);
  const [addContactOpen, setAddContactOpen] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const hasContent = content.trim().length >= 20 || emailBlock.trim().length >= 20 || files.length > 0;

  function titleFromFile(name: string) {
    if (!title.trim()) setTitle(name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim());
  }

  function loadFile(file: File) {
    const lower = file.name.toLowerCase();
    if (file.size > MAX_FILE_BYTES) {
      setError(`"${file.name}" is too large (max 25 MB).`);
      return;
    }
    const isText = TEXT_EXTS.some((e) => lower.endsWith(e)) || file.type.startsWith("text/") || file.type === "";
    if (isText) {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        setContent((prev) => (prev.trim() ? prev + "\n\n" + text : text));
        setFileName(file.name);
        setError(null);
        titleFromFile(file.name);
      };
      reader.onerror = () => setError("Couldn't read that file.");
      reader.readAsText(file);
      return;
    }
    if (!BINARY_EXTS.some((e) => lower.endsWith(e))) {
      setError(`"${file.name}" isn't a supported type. Supported: PDF, Word, Excel, HTML, Markdown, text.`);
      return;
    }
    // Binary — base64-upload for server-side parsing (extractFile on the server).
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      setFiles((prev) => [...prev, { base64, mimeType: file.type || "application/octet-stream", fileName: file.name }]);
      setError(null);
      titleFromFile(file.name);
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsDataURL(file);
  }

  function addTarget(kind: IngestTargetKind, id: string) {
    setTargets((prev) => {
      if (prev.some((t) => t.kind === kind && t.id === id)) return prev;
      const t = resolveTarget(kind, id, { contacts, clients, projects, deals }, prev.length === 0);
      return [...prev, t];
    });
  }

  function removeTarget(kind: IngestTargetKind, id: string) {
    setTargets((prev) => prev.filter((t) => !(t.kind === kind && t.id === id)));
  }

  function detect() {
    setDetectNote(null);
    setError(null);
    startDetect(async () => {
      try {
        const res = await detectTargets({ content, emailBlock: emailBlock || undefined, title: title || undefined });
        if (res.targets.length === 0) {
          setDetectNote("No known records matched the text. Add targets by hand below.");
          return;
        }
        setTargets((prev) => {
          const next = [...prev];
          for (const d of res.targets) {
            if (next.some((t) => t.kind === d.kind && t.id === d.id)) continue;
            next.push({ kind: d.kind, id: d.id, label: d.label, detected: true, focus: next.length === 0 });
          }
          return next;
        });
        setDetectNote(
          res.ambiguous
            ? `Detected ${res.targets.length} possible match(es) — review the chips; the match was ambiguous.`
            : `Detected ${res.targets.length} match(es).`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Detection failed");
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const focus = targets.find((t) => t.focus && t.id);
    startTransition(async () => {
      try {
        await extractUnified({
          ingestType,
          title: title.trim(),
          date,
          content,
          emailBlock: emailBlock.trim() || undefined,
          focus: focus ? { kind: focus.kind, id: focus.id } : null,
          targets: targets.filter((t) => t.id).map((t) => ({ kind: t.kind, id: t.id })),
          files: files.length ? files : undefined,
        });
        setSubmitted(true);
        router.refresh();
        setTimeout(onClose, 1100);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Extraction failed");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-12 px-4 bg-bitumen/85 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[760px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <FileInput size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>Ingest</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {submitted ? (
          <div className="px-5 py-12 flex flex-col items-center text-center gap-3">
            <span className="w-10 h-10 rounded-[var(--radius-pill)] bg-track-gold-dim/30 border border-track-gold/40 flex items-center justify-center text-track-gold">
              <Check size={18} strokeWidth={1.5} />
            </span>
            <span className="title-md">Queued for review</span>
            <span className="text-[13px] text-bone-dim max-w-[40ch] leading-relaxed">
              Claude is proposing changes across the targeted records. Nothing is written until you approve it below.
            </span>
          </div>
        ) : (
          <form onSubmit={submit} className="px-5 py-5 flex flex-col gap-5">
            {/* Ingest type — segmented */}
            <div className="flex flex-col gap-2">
              <Label>Type</Label>
              <div className="flex flex-wrap gap-2">
                {INGEST_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setIngestType(t)}
                    disabled={isPending}
                    className={cn(
                      "px-3 h-8 text-[12px] rounded-[var(--radius)] border transition-colors",
                      ingestType === t
                        ? "bg-track-gold-dim/20 text-track-gold border-track-gold/40"
                        : "bg-bitumen text-bone-dim border-graphite hover:text-bone hover:border-bone-mute",
                    )}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-bone-mute">{TYPE_HINTS[ingestType]}</span>
            </div>

            {/* Title + date */}
            <div className="grid grid-cols-[1fr_160px] gap-4">
              <div className="flex flex-col gap-2">
                <Label>Title <span className="text-flag-red">*</span></Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Brightline discovery call"
                  required
                  disabled={isPending}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={isPending} />
              </div>
            </div>

            {/* Targets */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label gold>Target records</Label>
                <button
                  type="button"
                  onClick={detect}
                  disabled={isPending || detecting || (!content.trim() && !emailBlock.trim())}
                  className="inline-flex items-center gap-1.5 text-[12px] text-track-gold hover:text-track-gold/80 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles size={12} strokeWidth={1.5} />
                  {detecting ? "Detecting…" : "Detect from text"}
                </button>
              </div>

              {targets.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {targets.map((t) => (
                    <span
                      key={`${t.kind}:${t.id}:${t.label}`}
                      className={cn(
                        "inline-flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-[var(--radius-pill)] border text-[12px]",
                        t.focus
                          ? "bg-track-gold-dim/20 text-track-gold border-track-gold/40"
                          : "bg-bitumen text-bone-dim border-graphite",
                      )}
                    >
                      <span className="label text-[9px] opacity-70">{t.kind}</span>
                      <span className={cn(t.focus ? "text-track-gold" : "text-bone")}>{t.label}</span>
                      {t.detected && <Sparkles size={10} strokeWidth={1.5} className="opacity-60" />}
                      {!t.focus && t.id && (
                        <button
                          type="button"
                          title="Make focus"
                          onClick={() =>
                            setTargets((prev) =>
                              prev.map((x) => ({ ...x, focus: x.kind === t.kind && x.id === t.id })),
                            )
                          }
                          className="text-bone-mute hover:text-track-gold text-[10px] uppercase tracking-wide"
                        >
                          set focus
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeTarget(t.kind, t.id)}
                        className="text-bone-mute hover:text-bone"
                      >
                        <X size={12} strokeWidth={1.5} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-bone-mute">
                  Add the contact / client / project / deal this is about — or hit Detect to let Claude suggest matches.
                </p>
              )}

              {detectNote && (
                <div className="flex items-start gap-2 px-3 py-2 border border-track-gold/40 bg-track-gold-dim/10 rounded-[var(--radius)] shadow-[var(--shadow-sm)]">
                  <CircleAlert size={13} strokeWidth={1.5} className="text-track-gold mt-0.5 shrink-0" />
                  <span className="text-[12px] text-bone-dim">{detectNote}</span>
                </div>
              )}

              {/* Manual add */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <RecordPicker
                  placeholder="Add contact…"
                  options={contacts.map((c) => ({ id: c.id, label: `${c.name} · ${c.company}` }))}
                  onPick={(id) => addTarget("contact", id)}
                  disabled={isPending}
                />
                <RecordPicker
                  placeholder="Add client…"
                  options={clients.map((c) => ({ id: c.id, label: c.company }))}
                  onPick={(id) => addTarget("client", id)}
                  disabled={isPending}
                />
                <RecordPicker
                  placeholder="Add deal…"
                  options={deals.map((d) => ({ id: d.id, label: d.name }))}
                  onPick={(id) => addTarget("deal", id)}
                  disabled={isPending}
                />
                <RecordPicker
                  placeholder="Add project…"
                  options={projects.map((p) => ({ id: p.id, label: p.name }))}
                  onPick={(id) => addTarget("project", id)}
                  disabled={isPending}
                />
              </div>

              <button
                type="button"
                onClick={() => setAddContactOpen((v) => !v)}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 text-[12px] text-bone-dim hover:text-bone self-start pt-0.5"
              >
                <UserPlus size={12} strokeWidth={1.5} />
                {addContactOpen ? "Cancel new contact" : "Add a new contact"}
              </button>

              {addContactOpen && (
                <InlineAddContact
                  partners={partners}
                  currentPartnerId={currentPartnerId}
                  disabled={isPending}
                  onAdded={(c) => {
                    setAddContactOpen(false);
                    setTargets((prev) => {
                      if (prev.some((t) => t.kind === "contact" && t.id === c.id)) return prev;
                      return [
                        ...prev,
                        {
                          kind: "contact",
                          id: c.id,
                          label: `${c.name} · ${c.company}`,
                          focus: prev.length === 0,
                        },
                      ];
                    });
                  }}
                />
              )}
            </div>

            {/* Content */}
            <div className="flex flex-col gap-2">
              <Label>Content {ingestType !== "email" && <span className="text-flag-red">*</span>}</Label>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) loadFile(f); }}
                onClick={() => !isPending && fileInputRef.current?.click()}
                className={cn(
                  "border border-dashed rounded-[var(--radius)] px-4 py-3 flex items-center justify-center gap-2 text-center cursor-pointer transition-colors mb-1",
                  dragging ? "border-track-gold bg-track-gold-dim/10" : "border-graphite hover:border-bone-mute",
                  isPending && "opacity-50 pointer-events-none",
                )}
              >
                <Upload size={14} strokeWidth={1.5} className="text-track-gold shrink-0" />
                {fileName ? (
                  <span className="text-[12px] text-bone">Loaded <span className="text-track-gold">{fileName}</span> · appended below</span>
                ) : (
                  <span className="text-[12px] text-bone-dim">Drop a file or <span className="text-track-gold">click to browse</span> · PDF, Word, Excel, image, HTML, Markdown, text</span>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.markdown,.vtt,.srt,.text,.log,.rtf,.csv,.pdf,.docx,.xlsx,.xls,.html,.htm,.png,.jpg,.jpeg,.gif,.webp,text/*,application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }}
                />
              </div>
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-1">
                  {files.map((f, i) => (
                    <span
                      key={`${f.fileName}-${i}`}
                      className="inline-flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-[var(--radius-pill)] border border-track-gold/40 bg-track-gold-dim/15 text-[12px] text-track-gold"
                    >
                      {f.fileName}
                      <span className="text-[10px] text-bone-mute">parsed on extract</span>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                        disabled={isPending}
                        className="text-bone-mute hover:text-bone"
                      >
                        <X size={12} strokeWidth={1.5} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <Textarea
                rows={8}
                value={content}
                onChange={(e) => { setContent(e.target.value); if (fileName) setFileName(null); }}
                placeholder="Paste notes, a transcript, or document text here — or drop a file above…"
                disabled={isPending}
              />
            </div>

            {/* Dedicated email/thread box */}
            <div className="flex flex-col gap-2">
              <Label>Email / thread {ingestType === "email" && <span className="text-flag-red">*</span>}</Label>
              <Textarea
                rows={4}
                value={emailBlock}
                onChange={(e) => setEmailBlock(e.target.value)}
                placeholder="Paste an email or thread here — kept separate so Claude reads sender / recipients cleanly…"
                disabled={isPending}
              />
            </div>

            <div className="flex items-start gap-2 px-3 py-2 bg-bitumen rounded-[var(--radius)] shadow-[var(--shadow-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-track-gold shrink-0 mt-0.5" />
              <span className="text-[12px] text-bone-dim">
                Ingest proposes changes for your review across every targeted record — every add is approved, every overwrite shows before → after. Nothing is written until you approve it.
              </span>
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)] shadow-[var(--shadow-sm)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isPending}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={isPending || !title.trim() || !hasContent}
              >
                {isPending ? "Extracting…" : "Extract → review"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Resolve a {kind,id} into a chip Target with a display label from the loaded lists.
function resolveTarget(
  kind: IngestTargetKind,
  id: string,
  lists: { contacts: Opt[]; clients: ClientOpt[]; projects: ProjectOpt[]; deals: DealOpt[] },
  focus: boolean,
): Target {
  let label = id;
  if (kind === "contact") {
    const c = lists.contacts.find((x) => x.id === id);
    if (c) label = `${c.name} · ${c.company}`;
  } else if (kind === "client") {
    const c = lists.clients.find((x) => x.id === id);
    if (c) label = c.company;
  } else if (kind === "project") {
    const p = lists.projects.find((x) => x.id === id);
    if (p) label = p.name;
  } else if (kind === "deal") {
    const d = lists.deals.find((x) => x.id === id);
    label = d ? d.name : "Deal";
  }
  return { kind, id, label, focus };
}

// Searchable single-pick dropdown over a record list. Picks, then resets.
function RecordPicker({
  placeholder,
  options,
  onPick,
  disabled,
}: {
  placeholder: string;
  options: { id: string; label: string }[];
  onPick: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;
    return base.slice(0, 30);
  }, [q, options]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 w-full bg-bitumen border border-graphite rounded-[var(--radius)] px-2.5 h-8">
        <Search size={12} strokeWidth={1.5} className="text-bone-mute shrink-0" />
        <input
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full bg-transparent text-bone text-[12px] placeholder:text-bone-mute focus:outline-none"
        />
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full max-h-[220px] overflow-y-auto bg-asphalt rounded-[var(--radius)] shadow-[var(--shadow-lg)] py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-bone-mute">No matches</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => { onPick(o.id); setQ(""); setOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-[12px] text-bone-dim hover:bg-[var(--color-row-hover)] hover:text-bone"
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Inline new-contact sub-panel. Mirrors AddContactModal fields + a paste-email
// field; dup-checks on email blur and creates via addContactInline.
function InlineAddContact({
  partners,
  currentPartnerId,
  disabled,
  onAdded,
}: {
  partners: PartnerOpt[];
  currentPartnerId: string;
  disabled?: boolean;
  onAdded: (c: { id: string; name: string; company: string }) => void;
}) {
  const [name, setName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [industry, setIndustry] = useState("automotive");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [partnerLeadId, setPartnerLeadId] = useState(currentPartnerId || partners[0]?.id || "");

  const [dup, setDup] = useState<{ id: string; name: string; company: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const [adding, startAdd] = useTransition();

  function checkDup() {
    if (!email.trim()) return;
    setDup(null);
    startCheck(async () => {
      try {
        const res = await checkContactDuplicate({ email: email.trim(), name: name.trim() || undefined });
        setDup(res.duplicate);
      } catch {
        /* non-fatal — dup check is advisory */
      }
    });
  }

  function add() {
    setError(null);
    startAdd(async () => {
      try {
        const c = await addContactInline({
          name: name.trim(),
          title: contactTitle.trim() || undefined,
          company: company.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          industry,
          source: source.trim() || undefined,
          notes: notes.trim() || undefined,
          partnerLeadId,
        });
        onAdded(c);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add contact");
      }
    });
  }

  const busy = disabled || adding;

  return (
    <div className="bg-bitumen rounded-[var(--radius)] shadow-[var(--shadow-sm)] px-4 py-4 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Name <span className="text-flag-red">*</span></Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="h-8" disabled={busy} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Title</Label>
          <Input value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} placeholder="e.g. COO" className="h-8" disabled={busy} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Company <span className="text-flag-red">*</span></Label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" className="h-8" disabled={busy} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Email <span className="text-flag-red">*</span></Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={checkDup}
            placeholder="name@company.com"
            className="h-8"
            disabled={busy}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" className="h-8" disabled={busy} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Industry</Label>
          <Select value={industry} onChange={(e) => setIndustry(e.target.value)} disabled={busy} className="h-8 text-[12px]">
            {Object.entries(industryLabels).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Source</Label>
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Referral, event…" className="h-8" disabled={busy} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Partner lead</Label>
          <Select value={partnerLeadId} onChange={(e) => setPartnerLeadId(e.target.value)} disabled={busy} className="h-8 text-[12px]">
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Notes / pasted email (optional)</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering — or paste their email signature to capture details…" disabled={busy} />
      </div>

      {checking && <span className="text-[11px] text-bone-mute">Checking for a duplicate…</span>}
      {dup && (
        <div className="flex items-start gap-2 px-3 py-2 border border-track-gold/40 bg-track-gold-dim/10 rounded-[var(--radius)]">
          <CircleAlert size={13} strokeWidth={1.5} className="text-track-gold mt-0.5 shrink-0" />
          <span className="text-[12px] text-bone-dim">
            A contact with this email already exists: <span className="text-bone">{dup.name} · {dup.company}</span>. Adding will still create a new row — confirm before you proceed.
          </span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
          <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
          <span className="text-[12px] text-bone-dim">{error}</span>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={add}
          disabled={busy || !name.trim() || !company.trim() || !email.trim()}
        >
          <Plus size={12} strokeWidth={1.5} />
          {adding ? "Adding…" : "Add & target"}
        </Button>
      </div>
    </div>
  );
}
