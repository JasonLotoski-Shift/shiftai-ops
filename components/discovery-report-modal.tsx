"use client";

import { useState, useTransition } from "react";
import { X, Sparkles, ShieldAlert, Presentation } from "lucide-react";
import { Button, Label, Textarea } from "@/components/ui";
import { generateDiscoveryReport, saveDiscoveryReport } from "@/app/(app)/clients/[id]/actions";

// Discovery report modal — intake (findings + time-back + outcomes) → generate
// the client-facing HTML deck → preview (rendered) + edit source → save. The
// [NEEDS INPUT] gate blocks saving. Output is HTML, so the draft step shows a
// live iframe preview plus a collapsible source editor.
export function DiscoveryReportModal({
  clientId,
  company,
  onClose,
}: {
  clientId: string;
  company: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"inputs" | "draft" | "saved">("inputs");
  const [findings, setFindings] = useState("");
  const [timeBack, setTimeBack] = useState("");
  const [outcomes, setOutcomes] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [genErr, setGenErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [isGenerating, startGenerate] = useTransition();
  const [isSaving, startSave] = useTransition();

  const needsInputCount = (draftBody.match(/\[NEEDS INPUT/g) || []).length;

  function runGenerate() {
    setGenErr(null);
    startGenerate(async () => {
      try {
        const { body } = await generateDiscoveryReport(clientId, { findings, timeBack, outcomes });
        setDraftBody(body);
        setStep("draft");
      } catch (err) {
        setGenErr(err instanceof Error ? err.message : "Failed to generate");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-bitumen/85 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div className="w-full max-w-[860px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Presentation size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>Discovery report · {company}</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex items-start gap-3 mx-5 mb-1 px-3 py-3 rounded-[var(--radius)] border border-flag-red/40 bg-flag-red/5">
          <ShieldAlert size={15} strokeWidth={1.5} className="text-flag-red shrink-0 mt-0.5" />
          <p className="text-[12px] text-bone-dim leading-snug">
            Claude drafts a client-facing deck from the discovery and your findings, in the client&apos;s
            brand colors when we have them. It won&apos;t invent the time-back number or the outcomes — those
            come back as a <span className="mono text-flag-red">[NEEDS INPUT]</span> marker and the draft
            can&apos;t save until you resolve it.
          </p>
        </div>

        {step === "inputs" ? (
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Discovery findings <span className="text-flag-red">*</span></Label>
              <Textarea rows={5} placeholder="What you found, the system(s) worth building, and the one new insight to surface. Plain notes — Claude shapes them into the deck." value={findings} onChange={(e) => setFindings(e.target.value)} disabled={isGenerating} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Time-back target</Label>
              <Textarea rows={2} placeholder="The measurable target, e.g. 'about 12 hours/week back on dispatch + 3 days off the monthly close'" value={timeBack} onChange={(e) => setTimeBack(e.target.value)} disabled={isGenerating} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>The two outcomes to confirm (X and Y)</Label>
              <Textarea rows={2} placeholder="What the close asks them to confirm they see, e.g. 'X = one board for every job, Y = the month-end close runs itself'" value={outcomes} onChange={(e) => setOutcomes(e.target.value)} disabled={isGenerating} />
            </div>
            <p className="flex items-start gap-2 text-[12px] text-bone-mute">
              <Sparkles size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-track-gold" />
              <span>Claude reads {company}&apos;s discovery interactions and saved brand colors for context.</span>
            </p>
            {genErr && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{genErr}</span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={isGenerating}>Cancel</Button>
              <Button variant="primary" size="sm" disabled={!findings.trim() || isGenerating} onClick={runGenerate}>
                {isGenerating ? "Generating…" : "Generate discovery report"}
              </Button>
            </div>
          </div>
        ) : step === "draft" ? (
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Sparkles size={13} strokeWidth={1.5} className="text-track-gold" />
              <span className="text-[13px] text-bone">Draft ready — preview below, edit the source if needed, then save.</span>
            </div>
            <iframe
              srcDoc={draftBody}
              title="Discovery report preview"
              className="w-full h-[440px] rounded-[var(--radius)] border border-graphite bg-white"
            />
            <details className="rounded-[var(--radius)] border border-graphite">
              <summary className="cursor-pointer px-3 py-2 text-[12px] text-bone-dim select-none">Edit HTML source</summary>
              <Textarea rows={14} className="font-mono text-[11px] leading-relaxed rounded-t-none border-0" value={draftBody} onChange={(e) => setDraftBody(e.target.value)} disabled={isSaving} />
            </details>
            {needsInputCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red" />
                <span className="text-[12px] text-bone-dim">Claude flagged {needsInputCount} item(s) it would not guess (likely the time-back number or the outcomes). Fill these in the source before saving.</span>
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
              <Button
                variant="primary"
                size="sm"
                disabled={needsInputCount > 0 || isSaving || !draftBody.trim()}
                onClick={() => {
                  setSaveErr(null);
                  startSave(async () => {
                    try {
                      await saveDiscoveryReport(clientId, { body: draftBody });
                      setStep("saved");
                    } catch (err) {
                      setSaveErr(err instanceof Error ? err.message : "Failed to save");
                    }
                  });
                }}
              >
                {isSaving ? "Saving…" : "Save discovery report"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <div className="title-lg text-track-gold mb-2 inline-block">SAVED</div>
            <p className="text-[13px] text-bone-dim">Saved to Drive · review it on the Deliverables tab.</p>
            <div className="pt-5">
              <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
