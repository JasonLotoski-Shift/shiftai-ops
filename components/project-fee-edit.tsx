"use client";

// Inline editor for the project's fixed fee. Renders the fee figure with a
// small edit affordance; on save it calls setProjectFee and refreshes.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui";
import { formatCAD } from "@/lib/format";
import { setProjectFee } from "@/app/(app)/projects/[id]/actions";

export function ProjectFeeEdit({
  projectId,
  budgetFee,
  feeBurnPct,
}: {
  projectId: string;
  budgetFee: number;
  feeBurnPct: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(budgetFee));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await setProjectFee(projectId, Number(value || 0));
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save fee");
      }
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            step={1}
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            disabled={isPending}
            className="text-[18px]"
          />
          <button onClick={save} disabled={isPending} className="text-track-gold hover:text-bone" title="Save">
            <Check size={16} strokeWidth={1.5} />
          </button>
          <button onClick={() => { setEditing(false); setValue(String(budgetFee)); }} disabled={isPending} className="text-bone-mute hover:text-bone" title="Cancel">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        {error && <span className="text-[11px] text-flag-red">{error}</span>}
      </div>
    );
  }

  return (
    <div className="group flex flex-col gap-2">
      <span className="mono text-[28px] text-bone tabular-nums flex items-center gap-2">
        {formatCAD(budgetFee).replace("CA$", "$")}
        <button
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 text-bone-mute hover:text-track-gold transition-opacity"
          title="Edit fee"
        >
          <Pencil size={13} strokeWidth={1.5} />
        </button>
      </span>
      <span className="label text-[10px]">{Math.round(feeBurnPct)}% billed</span>
    </div>
  );
}
