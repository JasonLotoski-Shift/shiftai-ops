"use client";

// Delete-deal confirm modal. Destructive, so it's a deliberate two-step:
// the header Delete button opens this, and only the red Delete here fires the
// deleteDeal action. On success it routes back to the pipeline board (the deal
// page it was on no longer exists). Mirrors the shell of DealEditModal.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Trash2, ShieldAlert } from "lucide-react";
import { Button, Label } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { deleteDeal } from "@/app/(app)/pipeline/[id]/actions";

export function DeleteDealModal({
  dealId,
  company,
  onClose,
}: {
  dealId: string;
  company: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteDeal(dealId);
        router.push("/pipeline");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete deal");
      }
    });
  }

  return (
    <ModalShell onClose={onClose}>
      <div
        className="w-full max-w-[460px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Trash2 size={14} strokeWidth={1.5} className="text-flag-red" />
            <Label>Delete deal</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          <p className="text-[13px] text-bone-dim">
            Permanently delete <span className="text-bone">{company}</span> and everything scoped to it —
            estimate, drafts, tasks, prototypes, and this deal&apos;s contact links. This can&apos;t be
            undone. Any files already saved to Drive stay in Drive.
          </p>

          <div className="flex items-start gap-2 px-3 py-2 bg-bitumen rounded-[var(--radius)] shadow-[var(--shadow-sm)]">
            <ShieldAlert size={13} strokeWidth={1.5} className="text-track-gold shrink-0 mt-0.5" />
            <span className="text-[12px] text-bone-dim">
              For mistakes and dead leads. A deal you genuinely lost is better kept with a lost reason on the record.
            </span>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)] shadow-[var(--shadow-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" type="button" onClick={confirm} disabled={isPending}>
              <Trash2 size={13} strokeWidth={1.5} />
              {isPending ? "Deleting…" : "Delete deal"}
            </Button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
