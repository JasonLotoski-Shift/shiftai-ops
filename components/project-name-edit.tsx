"use client";

// Inline editor for the project name, rendered as the page title. Read mode
// shows the same display the rest of the app uses (codename prefix before the
// "·" stripped off); editing operates on the FULL stored name so the canonical
// value round-trips. Mirrors project-fee-edit / project-type-edit.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui";
import { setProjectName } from "@/app/(app)/projects/[id]/actions";

// Strip an optional "Codename · " prefix for display (matches the header /
// invoice convention elsewhere in the app).
function displayTitle(name: string): string {
  return name.split("·")[1]?.trim() ?? name;
}

export function ProjectNameEdit({
  projectId,
  name,
}: {
  projectId: string;
  name: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await setProjectName(projectId, value);
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save name");
      }
    });
  }

  function cancel() {
    setEditing(false);
    setValue(name);
    setError(null);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Input
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            disabled={isPending}
            className="display-md text-bone w-[520px] max-w-full"
          />
          <button onClick={save} disabled={isPending} className="text-track-gold hover:text-bone" title="Save">
            <Check size={18} strokeWidth={1.5} />
          </button>
          <button onClick={cancel} disabled={isPending} className="text-bone-mute hover:text-bone" title="Cancel">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        {error && <span className="text-[12px] text-flag-red">{error}</span>}
      </div>
    );
  }

  return (
    <span className="group inline-flex items-center gap-3">
      <span className="display-md text-bone">{displayTitle(name)}</span>
      <button
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 text-bone-mute hover:text-track-gold transition-opacity"
        title="Edit project name"
      >
        <Pencil size={15} strokeWidth={1.5} />
      </button>
    </span>
  );
}
