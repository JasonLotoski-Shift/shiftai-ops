"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Sparkles, ShieldAlert, FileSignature } from "lucide-react";
import { Button, Label, Textarea } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { useActionDraft } from "@/components/use-action-draft";
import { generateSow, saveSow } from "@/app/(app)/clients/[id]/actions";

type SowDraft = { terms: string; scopeNotes: string; body: string };

// Statement of Work modal — intake (agreed terms + scope notes) → generate the
// contract draft → preview (rendered) + edit source → save as a Google Doc in
// the client's Drive folder. The draft is never signature-ready; the [NEEDS
// INPUT] gate blocks saving until fees/parties/dates are real.
export function SowModal({
  clientId,
  company,
  reopenDraft = false,
  onClose,
}: {
  clientId: string;
  company: string;
  reopenDraft?: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"inputs" | "draft" | "saved">("inputs");
  const [terms, setTerms] = useState("");
  const [scopeNotes, setScopeNotes] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [isGenerating, startGenerate] = useTransition();
  const [isSaving, startSave] = useTransition();

  const draft = useActionDraft<SowDraft>("sow", { clientId });

  const needsInputCount = (draftBody.match(/\[NEEDS INPUT/g) || []).length;

  useEffect(() => {
    if (!reopenDraft) return;
    let active = true;
    draft.load().then((c) => {
      if (!active || !c) return;
      setTerms(c.terms ?? "");
      setScopeNotes(c.scopeNotes ?? "");
      setDraftBody(c.body ?? "");
      setStep("draft");
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopenDraft]);

  useEffect(() => {
    if (step === "draft") draft.track({ terms, scopeNotes, body: draftBody });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, terms, scopeNotes, draftBody]);

  function runGenerate() {
    setGenErr(null);
    startGenerate(async () => {
      try {
        const { body } = await generateSow(clientId, { terms, scopeNotes });
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
      <div className="w-full max-w-[860px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <FileSignature size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>Statement of Work · {company}</Label>
          </div>
          <button onClick={handleClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex items-start gap-3 mx-5 mb-1 px-3 py-3 rounded-[var(--radius)] border border-flag-red/40 bg-flag-red/5">
          <ShieldAlert size={15} strokeWidth={1.5} className="text-flag-red shrink-0 mt-0.5" />
          <p className="text-[12px] text-bone-dim leading-snug">
            This drafts a structured starting point for you and counsel to redline. It is
            <span className="text-bone"> never signature-ready</span>: every fee, party, and date it
            doesn&apos;t have comes back as a <span className="mono text-flag-red">[NEEDS INPUT]</span> marker,
            binding wording is tagged <span className="mono">[for counsel]</span>, and the draft can&apos;t
            save until the markers are resolved. Counsel reviews before anything is signed.
          </p>
        </div>

        {step === "inputs" ? (
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Final agreed terms <span className="text-flag-red">*</span></Label>
              <Textarea rows={6} placeholder="The parties' legal names, the build fee, the monthly subscription (platform base + per-module), any buy-out price, milestone dates, and the deployment choice (Shift-hosted or in-house). Plain notes; Claude structures them." value={terms} onChange={(e) => setTerms(e.target.value)} disabled={isGenerating} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Scope notes</Label>
              <Textarea rows={3} placeholder="Optional — any scope, deliverable, or acceptance-criteria specifics beyond what's on the project. Leave blank to use the project scope." value={scopeNotes} onChange={(e) => setScopeNotes(e.target.value)} disabled={isGenerating} />
            </div>
            <p className="flex items-start gap-2 text-[12px] text-bone-mute">
              <Sparkles size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-track-gold" />
              <span>Claude reads {company}&apos;s engagement and projects, and applies the firm&apos;s IP and commercial model.</span>
            </p>
            {genErr && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{genErr}</span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={handleClose} disabled={isGenerating}>Cancel</Button>
              <Button variant="primary" size="sm" disabled={!terms.trim() || isGenerating} onClick={runGenerate}>
                {isGenerating ? "Generating…" : "Generate SOW draft"}
              </Button>
            </div>
          </div>
        ) : step === "draft" ? (
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Sparkles size={13} strokeWidth={1.5} className="text-track-gold" />
              <span className="text-[13px] text-bone">Draft ready — preview below, edit the source if needed, then save as a Google Doc.</span>
            </div>
            <iframe
              srcDoc={draftBody}
              title="SOW preview"
              className="w-full h-[440px] rounded-[var(--radius)] border border-graphite bg-white"
            />
            <details className="rounded-[var(--radius)] border border-graphite">
              <summary className="cursor-pointer px-3 py-2 text-[12px] text-bone-dim select-none">Edit HTML source</summary>
              <Textarea rows={14} className="font-mono text-[11px] leading-relaxed rounded-t-none border-0" value={draftBody} onChange={(e) => setDraftBody(e.target.value)} disabled={isSaving} />
            </details>
            {needsInputCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red" />
                <span className="text-[12px] text-bone-dim">Claude flagged {needsInputCount} item(s) it would not guess (fees, parties, dates, or counsel terms). Resolve them in the source before saving.</span>
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
                    void draft.save({ terms, scopeNotes, body: draftBody }).then(onClose);
                  }}
                  title="Park this for later — finish it from the orange box on the client"
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
                        const { driveUrl } = await saveSow(clientId, { body: draftBody });
                        await draft.clear();
                        setSavedUrl(driveUrl);
                        setStep("saved");
                      } catch (err) {
                        setSaveErr(err instanceof Error ? err.message : "Failed to save");
                      }
                    });
                  }}
                >
                  {isSaving ? "Saving…" : "Save as Google Doc"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <div className="title-lg text-track-gold mb-2 inline-block">SAVED</div>
            <p className="text-[13px] text-bone-dim">Filed to the client&apos;s Drive as a Google Doc. Open it to redline with counsel before signature.</p>
            <div className="pt-5 flex justify-center gap-2">
              {savedUrl && (
                <a href={savedUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="primary" size="sm">Open in Google Docs →</Button>
                </a>
              )}
              <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
