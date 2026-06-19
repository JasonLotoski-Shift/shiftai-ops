"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Sparkles, ShieldAlert, Stamp } from "lucide-react";
import { Button, Label, Input, Textarea } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { useActionDraft } from "@/components/use-action-draft";
import {
  generateContract,
  saveContract,
  type ContractIntake,
} from "@/app/(app)/clients/[id]/actions";

// Generate Contract modal — collect the commercial + party terms, draft Appendix A
// from the approved SOW, assemble the fixed BC template, preview the fillable
// contract, then file it as self-contained HTML in the client's Drive folder.
// Never signature-ready: the DRAFT banner + [NEEDS INPUT] gate hold the line, and
// counsel reviews the binding terms before anyone signs.

type ContractDraft = ContractIntake & { body: string };

const today = () => new Date().toISOString().slice(0, 10);

export function ContractModal({
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
  const [f, setF] = useState<ContractIntake>({
    clientLegalName: company,
    clientAddress: "",
    effectiveDate: today(),
    projectName: "",
    buildFee: "",
    backgroundIpLicenseFee: "",
    supportFee: "",
    paymentTerms: "",
    scopeNotes: "",
  });
  const [draftBody, setDraftBody] = useState("");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [isGenerating, startGenerate] = useTransition();
  const [isSaving, startSave] = useTransition();

  const draft = useActionDraft<ContractDraft>("generate-contract", { clientId });

  const needsInputCount = (draftBody.match(/\[NEEDS INPUT/g) || []).length;
  const set = (patch: Partial<ContractIntake>) => setF((cur) => ({ ...cur, ...patch }));
  const required = f.clientLegalName.trim() && f.buildFee.trim() && f.backgroundIpLicenseFee.trim() && f.paymentTerms.trim();

  useEffect(() => {
    if (!reopenDraft) return;
    let active = true;
    draft.load().then((c) => {
      if (!active || !c) return;
      const { body, ...intake } = c;
      setF((cur) => ({ ...cur, ...intake }));
      setDraftBody(body ?? "");
      setStep("draft");
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopenDraft]);

  useEffect(() => {
    if (step === "draft") draft.track({ ...f, body: draftBody });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, f, draftBody]);

  function runGenerate() {
    setGenErr(null);
    startGenerate(async () => {
      try {
        const { body } = await generateContract(clientId, f);
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
      <div
        className="w-full max-w-[900px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Stamp size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>Generate contract · {company}</Label>
          </div>
          <button onClick={handleClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex items-start gap-3 mx-5 mb-1 px-3 py-3 rounded-[var(--radius)] border border-flag-red/40 bg-flag-red/5">
          <ShieldAlert size={15} strokeWidth={1.5} className="text-flag-red shrink-0 mt-0.5" />
          <p className="text-[12px] text-bone-dim leading-snug">
            This drafts the firm&apos;s standard agreement on a
            <span className="text-bone"> fixed, BC-researched template</span> — the legal terms are not rewritten,
            only the parties, fees, dates, and the Appendix A scope are filled. It is
            <span className="text-bone"> never signature-ready</span>: a BC lawyer reviews the binding terms (IP,
            liability, privacy, indemnity, dispute resolution) before anyone signs. Anything it doesn&apos;t have comes
            back as a <span className="mono text-flag-red">[NEEDS INPUT]</span> marker and the draft can&apos;t save until
            those are resolved.
          </p>
        </div>

        {step === "inputs" ? (
          <div className="px-5 py-5 flex flex-col gap-4 max-h-[68vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Client legal name <span className="text-flag-red">*</span></Label>
                <Input value={f.clientLegalName} onChange={(e) => set({ clientLegalName: e.target.value })} placeholder="Acme Holdings Ltd." disabled={isGenerating} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Effective date</Label>
                <Input value={f.effectiveDate} onChange={(e) => set({ effectiveDate: e.target.value })} placeholder="2026-06-18" disabled={isGenerating} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Client address</Label>
                <Input value={f.clientAddress} onChange={(e) => set({ clientAddress: e.target.value })} placeholder="Street, City, Province, Postal code" disabled={isGenerating} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Engagement / project name</Label>
                <Input value={f.projectName} onChange={(e) => set({ projectName: e.target.value })} placeholder="e.g. Parts-intake system — Phase 1" disabled={isGenerating} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>One-time build fee (CAD) <span className="text-flag-red">*</span></Label>
                <Input value={f.buildFee} onChange={(e) => set({ buildFee: e.target.value })} placeholder="$60,000" disabled={isGenerating} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Background IP Licence Fee — monthly (CAD) <span className="text-flag-red">*</span></Label>
                <Input value={f.backgroundIpLicenseFee} onChange={(e) => set({ backgroundIpLicenseFee: e.target.value })} placeholder="$3,500" disabled={isGenerating} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Operate &amp; support fee — annual (optional)</Label>
                <Input value={f.supportFee} onChange={(e) => set({ supportFee: e.target.value })} placeholder="e.g. $12,000" disabled={isGenerating} />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Payment schedule <span className="text-flag-red">*</span></Label>
              <Textarea rows={2} value={f.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} placeholder="e.g. 40% on signing, 40% at build start, 20% on acceptance. Net 30." disabled={isGenerating} />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Scope notes for Schedule A (optional)</Label>
              <Textarea rows={3} value={f.scopeNotes} onChange={(e) => set({ scopeNotes: e.target.value })} placeholder="Anything beyond the approved SOW: specific modules, acceptance tests, milestones. Leave blank to build Schedule A from the SOW and project scope." disabled={isGenerating} />
            </div>

            <p className="flex items-start gap-2 text-[12px] text-bone-mute">
              <Sparkles size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-track-gold" />
              <span>Claude drafts Schedule A (the Deliverable) from {company}&apos;s approved SOW and projects. The legal terms come from the firm&apos;s fixed BC template; the commercials above are filled in as written.</span>
            </p>
            {genErr && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{genErr}</span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={handleClose} disabled={isGenerating}>Cancel</Button>
              <Button variant="primary" size="sm" disabled={!required || isGenerating} onClick={runGenerate}>
                {isGenerating ? "Drafting…" : "Generate contract draft"}
              </Button>
            </div>
          </div>
        ) : step === "draft" ? (
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Sparkles size={13} strokeWidth={1.5} className="text-track-gold" />
              <span className="text-[13px] text-bone">Draft ready — preview below, edit the source if needed, then save. The saved file is fillable and has a Download-PDF button.</span>
            </div>
            <iframe
              srcDoc={draftBody}
              title="Contract preview"
              className="w-full h-[460px] rounded-[var(--radius)] border border-graphite bg-white"
            />
            <details className="rounded-[var(--radius)] border border-graphite">
              <summary className="cursor-pointer px-3 py-2 text-[12px] text-bone-dim select-none">Edit HTML source</summary>
              <Textarea rows={14} className="font-mono text-[11px] leading-relaxed rounded-t-none border-0" value={draftBody} onChange={(e) => setDraftBody(e.target.value)} disabled={isSaving} />
            </details>
            {needsInputCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red" />
                <span className="text-[12px] text-bone-dim">{needsInputCount} field(s) still read <span className="mono text-flag-red">[NEEDS INPUT]</span> — including Shift&apos;s own legal details if you haven&apos;t set them in lib/contract/firm-party.ts. Fill them in the source before saving.</span>
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
                    void draft.save({ ...f, body: draftBody }).then(onClose);
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
                        const { driveUrl } = await saveContract(clientId, { body: draftBody });
                        await draft.clear();
                        setSavedUrl(driveUrl);
                        setStep("saved");
                      } catch (err) {
                        setSaveErr(err instanceof Error ? err.message : "Failed to save");
                      }
                    });
                  }}
                >
                  {isSaving ? "Saving…" : "Save to Drive"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <div className="title-lg text-track-gold mb-2 inline-block">SAVED</div>
            <p className="text-[13px] text-bone-dim">Filed to the client&apos;s Drive folder. Open it, fill any remaining fields in the browser, then use Download PDF. Counsel reviews the binding terms before signature.</p>
            <div className="pt-5 flex justify-center gap-2">
              {savedUrl && (
                <a href={savedUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="primary" size="sm">Open the contract →</Button>
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
