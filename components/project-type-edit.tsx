"use client";

// Inline editor for the project's type (discovery / pilot / subscription /
// full build / buy-out).
// Mirrors project-fee-edit: human label + pencil-on-hover → Select + check/cancel,
// calls setProjectType then refreshes. Sits under the page title like a subtitle.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { Select } from "@/components/ui";
import { setProjectType } from "@/app/(app)/projects/[id]/actions";

// Human labels for the ProjectType enum (underscored JS ids). Exported for reuse.
export const TYPE_LABELS: Record<string, string> = {
  discovery_report: "Discovery Report",
  pilot_project: "Pilot Project",
  subscription: "Subscription",
  full_build: "Full Build",
  buyout: "Buy-out",
};

const TYPE_ORDER = ["discovery_report", "pilot_project", "subscription", "full_build", "buyout"] as const;

export function ProjectTypeEdit({
  projectId,
  projectType,
}: {
  projectId: string;
  projectType: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(projectType ?? "discovery_report");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await setProjectType(projectId, value);
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save type");
      }
    });
  }

  function cancel() {
    setEditing(false);
    setValue(projectType ?? "discovery_report");
    setError(null);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Select
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            disabled={isPending}
            className="h-7 text-[12px] w-[180px]"
          >
            {TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
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

  const label = projectType ? TYPE_LABELS[projectType] ?? projectType.replace(/_/g, "-") : null;

  return (
    <span className="group inline-flex items-center gap-2">
      <span className={label ? "label-gold text-[11px]" : "label text-[11px] text-bone-mute"}>
        {label ?? "Set type"}
      </span>
      <button
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 text-bone-mute hover:text-track-gold transition-opacity"
        title="Edit project type"
      >
        <Pencil size={12} strokeWidth={1.5} />
      </button>
    </span>
  );
}
