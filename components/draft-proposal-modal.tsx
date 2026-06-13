"use client";

import { useEffect, useState, useTransition } from "react";
import { X, FileText, Sparkles, ShieldAlert } from "lucide-react";
import { Button, Label, Input, Textarea } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { useActionDraft } from "@/components/use-action-draft";
import { generateProposal, saveProposal } from "@/app/(app)/pipeline/[id]/actions";

type ProposalDraft = {
  focus: string;
  fee: string;
  timeline: string;
  notes: string;
  body: string;
};

// Draft proposal Quick Action. Same shape as DraftEmailModal:
// intake → generate (scope skill) → editable draft → save. The [NEEDS INPUT]
// gate (client + server) blocks saving anything Claude wouldn't invent.
// `reopenDraft` jumps straight to the editable step preloaded from a saved
// ActionDraft (the orange "step 1 of 2 saved" box).
export function DraftProposalModal({
  dealId,
  company,
  reopenDraft = false,
  onClose,
}: {
  dealId: string;
  company: string;
  reopenDraft?: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"inputs" | "draft" | "saved">("inputs");
  const [focus, setFocus] = useState("");
  const [fee, setFee] = useState("");
  const [timeline, setTimeline] = useState("");
  const [notes, setNotes] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [genErr, setGenErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [isGenerating, startGenerate] = useTransition();
  const [isSaving, startSave] = useTransition();

  const draft = useActionDraft<ProposalDraft>("scope", { dealId });

  const needsInputCount = (draftBody.match(/\[NEEDS INPUT/g) || []).length;

  // Reopen preloaded from the saved ActionDraft → land on the editable step.
  // Runs once per open (draft.load is a stable ref).
  useEffect(() => {
    if (!reopenDraft) return;
    let active = true;
    draft.load().then((c) => {
      if (!active || !c) return;
      setFocus(c.focus ?? "");
      setFee(c.fee ?? "");
      setTimeline(c.timeline ?? "");
      setNotes(c.notes ?? "");
      setDraftBody(c.body ?? "");
      setStep("draft");
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopenDraft]);

  // Keep the draft tracked so an autosave-on-close has the latest content.
  useEffect(() => {
    if (step === "draft") draft.track({ focus, fee, timeline, notes, body: draftBody });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, focus, fee, timeline, notes, draftBody]);

  function runGenerate() {
    setGenErr(null);
    startGenerate(async () => {
      try {
        const { body } = await generateProposal(dealId, { focus, fee, timeline, notes });
        setDraftBody(body);
        setStep("draft");
      } catch (err) {
        setGenErr(err instanceof Error ? err.message : "Failed to generate proposal");
      }
    });
  }

  // On the editable step, closing parks the draft (no "will be lost" warning —
  // nothing is lost). On the inputs step, keep the discard guard.
  const onEditable = step === "draft";
  function handleClose() {
    if (onEditable) void draft.autoSave();
    onClose();
  }

  return (
    <ModalShell onClose={handleClose} guard={!onEditable && step !== "saved"}>
      <div
        className="w-full max-w-[760px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <FileText size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>Draft proposal · {company}</Label>
          </div>
          <button onClick={handleClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Anti-hallucination banner */}
        <div className="flex items-start gap-3 px-5 py-3 bg-flag-red/5">
          <ShieldAlert size={15} strokeWidth={1.5} className="text-flag-red shrink-0 mt-0.5" />
          <p className="text-[12px] text-bone-dim leading-snug">
            Claude drafts from the deal&apos;s history and won&apos;t invent a fee, a date, or a
            commitment. Anything missing comes back as a <span className="mono text-flag-red">[NEEDS INPUT]</span>{" "}
            marker — never guessed, and the draft can&apos;t save until you resolve it.
          </p>
        </div>

        {step === "inputs" ? (
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>What should this proposal scope? <span className="text-flag-red">*</span></Label>
              <Textarea
                rows={3}
                placeholder="e.g. A 2-week dispatch pilot, then a Build phase for the work-order system they flagged"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                disabled={isGenerating}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Fee to state</Label>
                <Input placeholder="Leave blank — don't guess" value={fee} onChange={(e) => setFee(e.target.value)} disabled={isGenerating} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Timeline to state</Label>
                <Input placeholder="Leave blank — don't guess" value={timeline} onChange={(e) => setTimeline(e.target.value)} disabled={isGenerating} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Anything else to weave in</Label>
              <Textarea rows={2} placeholder="Optional — constraints, who else is involved, must-mentions" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isGenerating} />
            </div>

            <p className="flex items-start gap-2 text-[12px] text-bone-mute">
              <Sparkles size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-track-gold" />
              <span>
                Claude reads {company}&apos;s deal notes and recent interactions for context. Leave any fact
                blank and it stays <span className="mono text-flag-red">[NEEDS INPUT]</span> rather than invented.
              </span>
            </p>

            {genErr && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{genErr}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={handleClose} disabled={isGenerating}>Cancel</Button>
              <Button variant="primary" size="sm" disabled={!focus.trim() || isGenerating} onClick={runGenerate}>
                {isGenerating ? "Generating…" : "Generate proposal"}
              </Button>
            </div>
          </div>
        ) : step === "draft" ? (
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Sparkles size={13} strokeWidth={1.5} className="text-track-gold" />
              <span className="text-[13px] text-bone">Draft ready — edit freely, then save.</span>
            </div>
            <Textarea
              rows={20}
              className="font-mono text-[12px] leading-relaxed"
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              disabled={isSaving}
            />
            {needsInputCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red" />
                <span className="text-[12px] text-bone-dim">
                  Claude flagged {needsInputCount} item(s) it would not guess. Fill these in before saving.
                </span>
              </div>
            )}
            {saveErr && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5">
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
                    void draft.save({ focus, fee, timeline, notes, body: draftBody }).then(onClose);
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
                        await saveProposal(dealId, { body: draftBody });
                        await draft.clear();
                        setStep("saved");
                      } catch (err) {
                        setSaveErr(err instanceof Error ? err.message : "Failed to save proposal");
                      }
                    });
                  }}
                >
                  {isSaving ? "Saving…" : "Save proposal"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <div className="title-lg text-track-gold mb-2 inline-block">SAVED</div>
            <p className="text-[13px] text-bone-dim">
              Proposal saved to Drive · review it on the deal&apos;s Deliverables.
            </p>
            <div className="pt-5">
              <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
