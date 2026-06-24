"use client";

// Inline "replace / new version" control for a document (Artifact). Click → pick a
// file → it's filed beside the original in Drive and recorded as a NEW version that
// supersedes the current one (the Documents card then shows one record + history).
// Pairs with ArtifactDeleteControl on each doc row.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, Loader2 } from "lucide-react";
import { replaceArtifact } from "@/app/(app)/artifacts/actions";

export function ArtifactReplaceControl({
  artifactId,
  className,
}: {
  artifactId: string;
  className?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same filename
    if (!file) return;
    setBusy(true);
    try {
      // readAsDataURL → "data:<mime>;base64,<payload>"; take the payload. Robust
      // for binary files of any size (no manual byte→char loop / stack blowups).
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1] ?? "";
      await replaceArtifact(artifactId, {
        base64,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
      });
      router.refresh();
    } catch (err) {
      console.error("replaceArtifact failed:", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={`inline-flex items-center ${className ?? ""}`}>
      <input ref={inputRef} type="file" onChange={onPick} className="hidden" />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Replace with a new version (keeps the history)"
        aria-label="Replace document with a new version"
        className="text-bone-mute hover:text-track-gold transition-colors disabled:opacity-50"
      >
        {busy ? (
          <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
        ) : (
          <GitBranch size={14} strokeWidth={1.5} />
        )}
      </button>
    </span>
  );
}
