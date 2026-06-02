"use client";

// Edit-deal modal — value, stage, industry, close-target date, company, notes.
// Mirrors the modal shell of DraftProposalModal; saves via updateDeal then
// refreshes. Stage excludes "signed" (signing runs Convert → Client). Opened
// from the deal header's Edit button (deal-actions.tsx).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Pencil, ShieldAlert } from "lucide-react";
import { Button, Label, Input, Textarea, Select } from "@/components/ui";
import { stageLabels, industryLabels } from "@/lib/data/seed";
import { updateDeal } from "@/app/(app)/pipeline/[id]/actions";
import type { DealModel as Deal } from "@/lib/generated/prisma/models";

// Stages settable here — "signed" is intentionally excluded (Convert owns it).
const EDIT_STAGES = ["lead", "qualified", "discovery", "discussion", "proposal", "negotiation"] as const;
const INDUSTRIES = ["automotive", "motorsport", "engineering", "construction", "other"] as const;

function toISODate(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

export function DealEditModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const router = useRouter();

  const [company, setCompany] = useState(deal.company);
  const [value, setValue] = useState(String(deal.valueEstimate));
  const [stage, setStage] = useState<string>(deal.stage);
  const [industry, setIndustry] = useState<string>(deal.industry);
  const [closeDate, setCloseDate] = useState(toISODate(deal.closeTargetDate));
  const [notes, setNotes] = useState(deal.notes ?? "");

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await updateDeal(deal.id, {
          company,
          valueEstimate: Number(value),
          stage,
          industry,
          closeTargetDate: closeDate,
          notes,
        });
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save deal");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-bitumen/85 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Pencil size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>Edit deal</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={save} className="px-5 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Company <span className="text-flag-red">*</span></Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} required disabled={isPending} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Estimated value (CAD)</Label>
              <Input
                type="number"
                min={0}
                step={1000}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Close target</Label>
              <Input
                type="date"
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Stage</Label>
              <Select value={stage} onChange={(e) => setStage(e.target.value)} disabled={isPending}>
                {EDIT_STAGES.map((s) => (
                  <option key={s} value={s}>{stageLabels[s]}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Industry</Label>
              <Select value={industry} onChange={(e) => setIndustry(e.target.value)} disabled={isPending}>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>{industryLabels[i]}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Notes</Label>
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Latest note on this deal…"
              disabled={isPending}
            />
          </div>

          <div className="flex items-start gap-2 px-3 py-2 bg-bitumen rounded-[var(--radius)] shadow-[var(--shadow-sm)]">
            <ShieldAlert size={13} strokeWidth={1.5} className="text-track-gold shrink-0 mt-0.5" />
            <span className="text-[12px] text-bone-dim">
              To sign this deal, use <span className="text-bone">Convert → Client</span> — it scaffolds the engagement.
              Moving the stage here resets the board&apos;s aging clock.
            </span>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)] shadow-[var(--shadow-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" disabled={isPending || !company.trim()}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
