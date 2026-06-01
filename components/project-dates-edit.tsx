"use client";

// Inline editor for the project's start + target-end dates. Read mode shows the
// "Start → End" range with a pencil-on-hover; editing swaps in two date inputs.
// Calls setProjectDates then refreshes. Mirrors project-fee-edit / -type-edit.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { setProjectDates } from "@/app/(app)/projects/[id]/actions";

// Date → "YYYY-MM-DD" for the native date input (the stored values are
// midnight-UTC, so the UTC slice is the calendar day we want).
function toISODate(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

export function ProjectDatesEdit({
  projectId,
  startDate,
  targetEndDate,
}: {
  projectId: string;
  startDate: Date;
  targetEndDate: Date;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(toISODate(startDate));
  const [end, setEnd] = useState(toISODate(targetEndDate));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await setProjectDates(projectId, { startDate: start, targetEndDate: end });
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save dates");
      }
    });
  }

  function cancel() {
    setEditing(false);
    setStart(toISODate(startDate));
    setEnd(toISODate(targetEndDate));
    setError(null);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={start}
            autoFocus
            onChange={(e) => setStart(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            disabled={isPending}
            className="h-7 text-[12px] w-[150px]"
          />
          <span className="text-bone-mute text-[12px]">→</span>
          <Input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            disabled={isPending}
            className="h-7 text-[12px] w-[150px]"
          />
          <button onClick={save} disabled={isPending} className="text-track-gold hover:text-bone" title="Save">
            <Check size={15} strokeWidth={1.5} />
          </button>
          <button onClick={cancel} disabled={isPending} className="text-bone-mute hover:text-bone" title="Cancel">
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>
        {error && <span className="text-[11px] text-flag-red">{error}</span>}
      </div>
    );
  }

  return (
    <span className="group inline-flex items-center gap-2">
      <span className="mono text-[12px] text-bone-dim tabular-nums">
        {formatDate(startDate).split(",")[0]} → {formatDate(targetEndDate).split(",")[0]}
      </span>
      <button
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 text-bone-mute hover:text-track-gold transition-opacity"
        title="Edit project dates"
      >
        <Pencil size={12} strokeWidth={1.5} />
      </button>
    </span>
  );
}
