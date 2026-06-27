"use client";

// Firm Knowledge — document upload. The browser flow is:
//   1. requestKnowledgeUpload() → pending row + signed Storage URL
//   2. PUT the file bytes STRAIGHT to Supabase Storage (never through Vercel —
//      respects the 4.5 MB function-body cap; 25 MB files are fine)
//   3. finalizeKnowledgeUpload() → server parses text + hash + summary
// The item lands as a draft; a partner approves it before any skill can read it.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Label } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { requestKnowledgeUpload, finalizeKnowledgeUpload } from "@/app/(app)/firm-knowledge/actions";

type Stage = "idle" | "signing" | "uploading" | "parsing" | "done" | "error";

export function KnowledgeUploadDialog({
  categories,
  defaultCategoryId,
  canSetManagingPartner = false,
}: {
  categories: { id: string; label: string }[];
  defaultCategoryId?: string | null;
  canSetManagingPartner?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string>(defaultCategoryId ?? "");
  const [sensitivity, setSensitivity] = useState<"firm_wide" | "managing_partner">("firm_wide");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setTitle("");
    setCategoryId(defaultCategoryId ?? "");
    setSensitivity("firm_wide");
    setFile(null);
    setStage("idle");
    setMessage(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function close() {
    setOpen(false);
    reset();
  }

  const busy = stage === "signing" || stage === "uploading" || stage === "parsing";

  async function onSubmit() {
    if (!file) {
      setStage("error");
      setMessage("Choose a file first.");
      return;
    }
    setStage("signing");
    setMessage(null);

    const requested = await requestKnowledgeUpload({
      title: title.trim() || file.name,
      fileName: file.name,
      mimeType: file.type || undefined,
      byteSize: file.size,
      categoryId: categoryId || null,
      sensitivity,
    });

    if (!requested.ok) {
      setStage("error");
      setMessage(requested.error);
      return;
    }

    // Direct-to-Storage PUT — the bytes never touch the Vercel function.
    setStage("uploading");
    try {
      const put = await fetch(requested.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream", "x-upsert": "true" },
        body: file,
      });
      if (!put.ok) throw new Error(`Storage upload failed (${put.status})`);
    } catch (e) {
      setStage("error");
      setMessage(e instanceof Error ? e.message : "Upload failed.");
      return;
    }

    // Parse server-side (text + hash + summary). The cron is the backstop.
    setStage("parsing");
    const finalized = await finalizeKnowledgeUpload(requested.id);
    if (finalized.ok) {
      setStage("done");
      setMessage("Uploaded and parsed. Review it, then approve so skills can use it.");
    } else if (finalized.status === "empty") {
      setStage("done");
      setMessage("Uploaded, but no text could be extracted (scanned image or empty file).");
    } else {
      setStage("done");
      setMessage(finalized.note ?? "Uploaded. Parsing will retry on the next cron run.");
    }
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} className="gap-1.5">
        <Upload size={14} strokeWidth={1.5} />
        Upload document
      </Button>

      {open && (
        <ModalShell onClose={close} guard={stage === "idle" && (title.length > 0 || !!file) ? true : false}>
          <div
            className="w-full max-w-[480px] bg-asphalt border border-graphite-2 rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-6 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1">
              <span className="title-md text-bone">Upload a document</span>
              <span className="text-[12px] text-bone-dim leading-relaxed">
                PDF, Word, Excel, HTML, Markdown or text. It files into Firm Knowledge as a draft, gets parsed for
                search, and waits for your approval before any skill reads it.
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>File</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.tsv,.html,.htm,.md,.markdown,.txt,.text,.rtf,.json,.log,.vtt,.srt"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !title.trim()) setTitle(f.name.replace(/\.[a-z0-9]+$/i, ""));
                }}
                className="text-[13px] text-bone-dim file:mr-3 file:rounded-[var(--radius)] file:border-0 file:bg-graphite file:px-3 file:py-1.5 file:text-bone file:text-[12px] file:cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What this document is"
                disabled={busy}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={busy}>
                  <option value="">Uncategorised</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
              {canSetManagingPartner && (
                <div className="flex flex-col gap-1.5">
                  <Label>Visibility</Label>
                  <Select
                    value={sensitivity}
                    onChange={(e) => setSensitivity(e.target.value as "firm_wide" | "managing_partner")}
                    disabled={busy}
                  >
                    <option value="firm_wide">All partners</option>
                    <option value="managing_partner">Managing partners only</option>
                  </Select>
                </div>
              )}
            </div>

            {message && (
              <div
                className={`flex items-start gap-2 text-[12px] leading-relaxed ${
                  stage === "error" ? "text-flag-red" : "text-bone-dim"
                }`}
              >
                {stage === "error" ? (
                  <AlertTriangle size={14} strokeWidth={1.5} className="shrink-0 mt-0.5" />
                ) : stage === "done" ? (
                  <CheckCircle2 size={14} strokeWidth={1.5} className="shrink-0 mt-0.5 text-[#4f9d57]" />
                ) : null}
                <span>{message}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={close} disabled={busy}>
                {stage === "done" ? "Close" : "Cancel"}
              </Button>
              {stage !== "done" && (
                <Button size="sm" onClick={onSubmit} disabled={busy || !file} className="gap-1.5">
                  {busy && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
                  {stage === "signing" || stage === "uploading"
                    ? "Uploading…"
                    : stage === "parsing"
                      ? "Parsing…"
                      : "Upload"}
                </Button>
              )}
            </div>
          </div>
        </ModalShell>
      )}
    </>
  );
}
