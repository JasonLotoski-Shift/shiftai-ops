"use client";

// Compact inline delete control for a milestone sub-task. Idle: a trash icon.
// Click → a two-icon confirm (check = delete, x = cancel) so a stray click never
// deletes. Used on the project epic card and the board's milestone detail modal.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Check, X, Loader2 } from "lucide-react";
import { deleteTask } from "@/app/(app)/tasks/actions";

export function SubtaskDeleteControl({
  taskId,
  onDeleted,
}: {
  taskId: string;
  /** Optional optimistic hook fired before the server refresh. */
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await deleteTask(taskId);
      onDeleted?.();
      router.refresh();
    } catch (err) {
      console.error("deleteTask failed:", err);
      setBusy(false);
      setConfirming(false);
    }
  }

  if (busy) {
    return <Loader2 size={13} strokeWidth={1.5} className="text-bone-mute animate-spin" />;
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          onClick={remove}
          title="Confirm delete"
          aria-label="Confirm delete sub-task"
          className="text-flag-red hover:text-flag-red/80"
        >
          <Check size={13} strokeWidth={2} />
        </button>
        <button
          onClick={() => setConfirming(false)}
          title="Cancel"
          aria-label="Cancel delete"
          className="text-bone-mute hover:text-bone"
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      title="Delete sub-task"
      aria-label="Delete sub-task"
      className="text-bone-mute hover:text-flag-red transition-colors"
    >
      <Trash2 size={13} strokeWidth={1.5} />
    </button>
  );
}
