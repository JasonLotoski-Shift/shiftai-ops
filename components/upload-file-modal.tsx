"use client";

import { useRef, useState, useTransition } from "react";
import { X, Upload, ShieldAlert } from "lucide-react";
import { Button, Label, Input, Textarea } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { uploadClientFile } from "@/app/(app)/clients/[id]/actions";

// Upload client files — ingest, not generation. Drop in meeting notes (e.g. a
// Fireflies transcript) or any text/markdown doc: it's filed to the client's
// Drive, registered as an Artifact, and — if it's a meeting — logged as an
// Interaction so the touch lands on the timeline.
export function UploadFileModal({
  clientId,
  company,
  onClose,
}: {
  clientId: string;
  company: string;
  onClose: () => void;
}) {
  const [fileName, setFileName] = useState("");
  const [content, setContent] = useState("");
  const [logAsMeeting, setLogAsMeeting] = useState(true);
  const [summary, setSummary] = useState("");
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    try {
      const text = await file.text();
      setContent(text);
      if (!fileName.trim()) setFileName(file.name);
    } catch {
      setErr("Couldn't read that file. Paste the text instead.");
    }
  }

  function save() {
    setErr(null);
    startSave(async () => {
      try {
        await uploadClientFile(clientId, {
          fileName: fileName.trim(),
          content,
          logAsMeeting,
          summary: summary.trim() || undefined,
        });
        setSaved(true);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to upload");
      }
    });
  }

  return (
    <ModalShell onClose={onClose} guard={!saved}>
      <div className="w-full max-w-[680px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Upload size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>Upload client files · {company}</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {saved ? (
          <div className="px-5 py-12 text-center">
            <div className="title-md text-track-gold mb-2 inline-block">Filed</div>
            <p className="text-[13px] text-bone-dim">
              Filed to {company}&apos;s Drive · registered on the Deliverables tab
              {logAsMeeting ? " · logged as a meeting interaction." : "."}
            </p>
            <div className="pt-5">
              <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-5 flex flex-col gap-4">
            <p className="text-[12px] text-bone-dim leading-snug">
              Pick a text/markdown file (e.g. a Fireflies meeting summary) or paste the notes below.
              It&apos;s filed to the client and round-tripped into the record — nothing happens silently.
            </p>

            <div className="flex items-center gap-3">
              <input ref={fileRef} type="file" accept=".md,.txt,.markdown,text/plain,text/markdown" onChange={onPickFile} className="hidden" />
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={isSaving}>
                <Upload size={13} strokeWidth={1.5} />
                Choose file
              </Button>
              <span className="text-[12px] text-bone-mute">or paste below</span>
            </div>

            <div className="flex flex-col gap-2">
              <Label>File name</Label>
              <Input placeholder="2026-05-29-acme-kickoff-notes.md" value={fileName} onChange={(e) => setFileName(e.target.value)} disabled={isSaving} />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Content <span className="text-flag-red">*</span></Label>
              <Textarea rows={12} className="font-mono text-[12px] leading-relaxed" placeholder="Paste the meeting notes / transcript here…" value={content} onChange={(e) => setContent(e.target.value)} disabled={isSaving} />
            </div>

            <label className="flex items-center gap-2 text-[13px] text-bone-dim cursor-pointer">
              <input type="checkbox" checked={logAsMeeting} onChange={(e) => setLogAsMeeting(e.target.checked)} className="accent-track-gold" disabled={isSaving} />
              Log this as a meeting interaction on the primary contact
            </label>

            {logAsMeeting && (
              <div className="flex flex-col gap-2">
                <Label>Interaction summary</Label>
                <Input placeholder="One line — what the meeting covered (optional)" value={summary} onChange={(e) => setSummary(e.target.value)} disabled={isSaving} />
              </div>
            )}

            {err && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{err}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>Cancel</Button>
              <Button variant="primary" size="sm" disabled={!content.trim() || !fileName.trim() || isSaving} onClick={save}>
                {isSaving ? "Filing…" : "Upload & file"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
