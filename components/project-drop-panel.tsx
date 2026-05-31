"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, ShieldAlert, CircleAlert, Sparkles, X } from "lucide-react";
import { Card, CardHeader, Label, Button, Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { extractProjectDrop } from "@/app/(app)/projects/[id]/drop-actions";

// Plain-text formats we can read in the browser straight into the drop field.
// Binary formats (.docx/.pdf) need server-side parsing — not wired; paste instead.
const TEXT_EXTS = [".txt", ".md", ".markdown", ".vtt", ".srt", ".text", ".log", ".rtf", ".csv", ".eml"];

export function ProjectDropPanel({ projectId }: { projectId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [isPending, startTransition] = useTransition();

  function loadFile(file: File) {
    const lower = file.name.toLowerCase();
    const okExt = TEXT_EXTS.some((e) => lower.endsWith(e));
    const okType = file.type.startsWith("text/") || file.type === "";
    if (!okExt && !okType) {
      setError(`"${file.name}" looks like a binary file (e.g. .docx / .pdf). Export it to text/markdown, or paste the content below.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setContent(String(reader.result ?? ""));
      setFileName(file.name);
      setError(null);
      if (!title.trim()) {
        setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim());
      }
    };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsText(file);
  }

  function reset() {
    setTitle("");
    setContent("");
    setFileName(null);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setQueued(false);
    startTransition(async () => {
      try {
        await extractProjectDrop(projectId, { content, title });
        reset();
        setQueued(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Extraction failed");
      }
    });
  }

  return (
    <Card className="border border-track-gold/40 bg-track-gold-dim/5">
      <CardHeader className="flex items-center gap-2">
        <Sparkles size={14} strokeWidth={1.5} className="text-track-gold" />
        <h2 className="title-md text-track-gold">Drop content into this project</h2>
      </CardHeader>
      <form onSubmit={submit} className="px-5 py-5 flex flex-col gap-4">
        <p className="text-[12px] text-bone-mute leading-relaxed">
          Drop a doc, an email thread, or paste notes. Claude extracts milestones, tasks, contact facts, and a summary —
          scoped to this project — then holds them in <span className="text-bone">Ingest</span> for your review. Nothing is
          written until you approve it.
        </p>

        <div className="flex flex-col gap-2">
          <Label>Title <span className="text-flag-red">*</span></Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kickoff thread · scope notes" required disabled={isPending} />
        </div>

        {/* Drop-zone */}
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
            <span className="text-[12px] text-bone-dim">Drop a file or <span className="text-track-gold">click to browse</span> · .txt .md .eml .vtt</span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.markdown,.vtt,.srt,.text,.log,.rtf,.csv,.eml,text/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Content <span className="text-flag-red">*</span></Label>
          <Textarea rows={8} value={content} onChange={(e) => { setContent(e.target.value); if (fileName) setFileName(null); }} placeholder="Paste the document or thread here — or drop a file above…" required disabled={isPending} />
        </div>

        <div className="flex items-start gap-2 px-3 py-2 bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
          <ShieldAlert size={13} strokeWidth={1.5} className="text-track-gold shrink-0 mt-0.5" />
          <span className="text-[12px] text-bone-dim">Extraction proposes records for your review — nothing is written to this project until you approve it in Ingest.</span>
        </div>

        {queued && (
          <div className="flex items-start gap-2 px-3 py-2 border border-track-gold/40 bg-track-gold-dim/10 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
            <CircleAlert size={13} strokeWidth={1.5} className="text-track-gold mt-0.5 shrink-0" />
            <span className="text-[12px] text-bone-dim">
              Queued for your review in <a href="/ingest" className="text-track-gold hover:underline">Ingest</a>.
            </span>
            <button type="button" onClick={() => setQueued(false)} className="ml-auto text-bone-mute hover:text-bone">
              <X size={13} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
            <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
            <span className="text-[12px] text-bone-dim">{error}</span>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="primary" size="sm" type="submit" disabled={isPending || !title.trim() || content.trim().length < 40}>
            {isPending ? "Extracting…" : "Extract → review"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
