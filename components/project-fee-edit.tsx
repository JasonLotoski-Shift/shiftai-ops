"use client";

// Inline editor for the project's fixed fee. Renders the fee figure with a
// small edit affordance; on save it calls setProjectFee and refreshes.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui";
import { formatCAD } from "@/lib/format";
import { setProjectFee } from "@/app/(app)/projects/[id]/actions";
import { generateStandardSchedule } from "@/app/(app)/projects/[id]/billing-actions";

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
  // After a fee change, prompt to regenerate the 50/25/25 schedule.
  const [regen, setRegen] = useState<null | { blocked: boolean }>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await setProjectFee(projectId, Number(value || 0));
        setEditing(false);
        setRegen(res.scheduleSuggestRegen ? { blocked: res.scheduleBlocked } : null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save fee");
      }
    });
  }

  function regenerate() {
    startTransition(async () => {
      try {
        await generateStandardSchedule(projectId, { force: true });
        setRegen(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to regenerate schedule");
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
      {regen && (
        <div className="flex flex-col gap-1.5 mt-1 p-2 rounded-[var(--radius-sm)] border border-track-gold/30 bg-track-gold-dim/10">
          <span className="text-[11px] text-bone-dim leading-snug">
            {regen.blocked
              ? "Value changed, but some installments are already invoiced — adjust the schedule manually."
              : "Value changed. Regenerate the 50/25/25 schedule to match?"}
          </span>
          {!regen.blocked && (
            <div className="flex items-center gap-2">
              <button
                onClick={regenerate}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 text-[11px] text-track-gold hover:text-bone disabled:opacity-40"
              >
                <RefreshCw size={11} strokeWidth={1.5} />
                Regenerate
              </button>
              <button onClick={() => setRegen(null)} disabled={isPending} className="text-[11px] text-bone-mute hover:text-bone">
                Dismiss
              </button>
            </div>
          )}
          {regen.blocked && (
            <button onClick={() => setRegen(null)} className="text-[11px] text-bone-mute hover:text-bone self-start">
              Dismiss
            </button>
          )}
          {error && <span className="text-[11px] text-flag-red">{error}</span>}
        </div>
      )}
    </div>
  );
}
