"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Sparkles, ShieldAlert, type LucideIcon } from "lucide-react";
import { Button, Label, Textarea } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { useActionDraft } from "@/components/use-action-draft";
import { generateDealDoc, saveDealDoc } from "@/app/(app)/pipeline/[id]/actions";

// Generic generative deal-doc modal — drives Discovery prep and the
// Book-a-meeting note. Same shape as the proposal modals: intake → generate
// (skill) → editable draft → save. The [NEEDS INPUT] gate blocks saving.
export type DealDocSkill = "discovery-prep" | "book-meeting";

type DealDocDraft = { focus: string; notes: string; body: string };

export function DealDocModal({
  dealId,
  company,
  skill,
  title,
  icon: Icon,
  focusLabel,
  focusPlaceholder,
  reopenDraft = false,
  onClose,
}: {
  dealId: string;
  company: string;
  skill: DealDocSkill;
  title: string;
  icon: LucideIcon;
  focusLabel: string;
  focusPlaceholder: string;
  reopenDraft?: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"inputs" | "draft" | "saved">("inputs");
  const [focus, setFocus] = useState("");
  const [notes, setNotes] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [genErr, setGenErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [isGenerating, startGenerate] = useTransition();
  const [isSaving, startSave] = useTransition();

  // The saved draft is keyed on the real skill ("discovery-prep" / "book-meeting").
  const draft = useActionDraft<DealDocDraft>(skill, { dealId });

  const needsInputCount = (draftBody.match(/\[NEEDS INPUT/g) || []).length;

  useEffect(() => {
    if (!reopenDraft) return;
    let active = true;
    draft.load().then((c) => {
      if (!active || !c) return;
      setFocus(c.focus ?? "");
      setNotes(c.notes ?? "");
      setDraftBody(c.body ?? "");
      setStep("draft");
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopenDraft]);

  useEffect(() => {
    if (step === "draft") draft.track({ focus, notes, body: draftBody });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, focus, notes, draftBody]);

  function runGenerate() {
    setGenErr(null);
    startGenerate(async () => {
      try {
        const { body } = await generateDealDoc(dealId, { skill, focus, notes });
        setDraftBody(body);
        setStep("draft");
      } catch (err) {
        setGenErr(err instanceof Error ? err.message : "Failed to generate");
      }
    });
  }

  const onEditable = step === "draft";
  function handleClose() {
    if (onEditable) void draft.autoSave();
    onClose();
  }

  return (
    <ModalShell onClose={handleClose} guard={!onEditable && step !== "saved"}>
      <div className="w-full max-w-[760px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Icon size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>{title} · {company}</Label>
          </div>
          <button onClick={handleClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex items-start gap-3 mx-5 mb-1 px-3 py-3 rounded-[var(--radius)] border border-flag-red/40 bg-flag-red/5">
          <ShieldAlert size={15} strokeWidth={1.5} className="text-flag-red shrink-0 mt-0.5" />
          <p className="text-[12px] text-bone-dim leading-snug">
            Claude drafts from the deal&apos;s history and recent interactions — it won&apos;t invent facts.
            Anything missing comes back as a <span className="mono text-flag-red">[NEEDS INPUT]</span> marker
            and the draft can&apos;t save until you resolve it.
          </p>
        </div>

        {step === "inputs" ? (
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>{focusLabel} <span className="text-flag-red">*</span></Label>
              <Textarea rows={3} placeholder={focusPlaceholder} value={focus} onChange={(e) => setFocus(e.target.value)} disabled={isGenerating} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Anything else to weave in</Label>
              <Textarea rows={2} placeholder="Optional — constraints, who's involved, must-mentions" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isGenerating} />
            </div>
            <p className="flex items-start gap-2 text-[12px] text-bone-mute">
              <Sparkles size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-track-gold" />
              <span>Claude reads {company}&apos;s deal, contact, and recent interactions for context.</span>
            </p>
            {genErr && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{genErr}</span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={handleClose} disabled={isGenerating}>Cancel</Button>
              <Button variant="primary" size="sm" disabled={!focus.trim() || isGenerating} onClick={runGenerate}>
                {isGenerating ? "Generating…" : `Generate ${title.toLowerCase()}`}
              </Button>
            </div>
          </div>
        ) : step === "draft" ? (
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Sparkles size={13} strokeWidth={1.5} className="text-track-gold" />
              <span className="text-[13px] text-bone">Draft ready — edit freely, then save.</span>
            </div>
            <Textarea rows={20} className="font-mono text-[12px] leading-relaxed" value={draftBody} onChange={(e) => setDraftBody(e.target.value)} disabled={isSaving} />
            {needsInputCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red" />
                <span className="text-[12px] text-bone-dim">Claude flagged {needsInputCount} item(s) it would not guess. Fill these in before saving.</span>
              </div>
            )}
            {saveErr && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{saveErr}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("inputs")} disabled={isSaving || isGenerating}>← Edit inputs</Button>
                <Button variant="ghost" size="sm" onClick={runGenerate} disabled={isSaving || isGenerating}>
                  {isGenerating ? "Regenerating…" : "↻ Regenerate"}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isSaving || isGenerating || draft.busy || !draftBody.trim()}
                  onClick={() => {
                    void draft.save({ focus, notes, body: draftBody }).then(onClose);
                  }}
                  title="Park this for later — finish it from the orange box on the deal"
                >
                  {draft.busy ? "Saving…" : "Save draft"}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={needsInputCount > 0 || isSaving || !draftBody.trim()}
                  onClick={() => {
                    setSaveErr(null);
                    startSave(async () => {
                      try {
                        await saveDealDoc(dealId, { skill, body: draftBody });
                        await draft.clear();
                        setStep("saved");
                      } catch (err) {
                        setSaveErr(err instanceof Error ? err.message : "Failed to save");
                      }
                    });
                  }}
                >
                  {isSaving ? "Saving…" : `Save ${title.toLowerCase()}`}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <div className="title-lg text-track-gold mb-2 inline-block">SAVED</div>
            <p className="text-[13px] text-bone-dim">Saved to Drive · review it on the deal&apos;s Deliverables.</p>
            <div className="pt-5">
              <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
