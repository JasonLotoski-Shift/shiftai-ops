"use client";

// Compact inline delete control for a document (Artifact). Idle: a trash icon.
// Click → two-icon confirm (check = delete, x = cancel) so a stray click never
// deletes — and deletion is permanent (it also removes the file from Drive).
// Mirrors SubtaskDeleteControl; used on the project / deal / client document lists.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Check, X, Loader2 } from "lucide-react";
import { deleteArtifact } from "@/app/(app)/artifacts/actions";

export function ArtifactDeleteControl({
  artifactId,
  className,
}: {
  artifactId: string;
  /** Positioning/visibility classes from the host row (e.g. hover reveal). */
  className?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await deleteArtifact(artifactId);
      router.refresh();
    } catch (err) {
      console.error("deleteArtifact failed:", err);
      setBusy(false);
      setConfirming(false);
    }
  }

  const wrap = (children: React.ReactNode) => (
    <span className={`inline-flex items-center ${className ?? ""}`}>{children}</span>
  );

  if (busy) {
    return wrap(<Loader2 size={14} strokeWidth={1.5} className="text-bone-mute animate-spin" />);
  }

  if (confirming) {
    return wrap(
      <span className="inline-flex items-center gap-2">
        <button
          onClick={remove}
          title="Confirm — permanently deletes the file from Drive too"
          aria-label="Confirm delete document"
          className="text-flag-red hover:text-flag-red/80"
        >
          <Check size={14} strokeWidth={2} />
        </button>
        <button
          onClick={() => setConfirming(false)}
          title="Cancel"
          aria-label="Cancel delete"
          className="text-bone-mute hover:text-bone"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </span>,
    );
  }

  return wrap(
    <button
      onClick={() => setConfirming(true)}
      title="Delete document (removes it from Drive too)"
      aria-label="Delete document"
      className="text-bone-mute hover:text-flag-red transition-colors"
    >
      <Trash2 size={14} strokeWidth={1.5} />
    </button>,
  );
}
