"use client";

import { useState, useTransition } from "react";
import { X, Mail, Sparkles, ShieldAlert, Check } from "lucide-react";
import { Button, Label, Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { generateEmailDraft, saveEmailDraft, sendEmail } from "@/app/(app)/contacts/[id]/actions";

// Shared draft-email modal — used from the contact page (Draft email) and the
// deal page (post-discovery Follow-up email, via defaultPurpose). Wraps the
// draft-email skill: intake → generate → editable draft → save/send, with the
// anti-hallucination [NEEDS INPUT] gate blocking save/send. Persistence reuses
// the contact-scoped generateEmailDraft / saveEmailDraft / sendEmail actions
// (deal-scope-aware via resolveEmailScope), so a deal email files + logs an
// interaction on the deal's contact automatically.
export function DraftEmailModal({
  contactId,
  contactName,
  partnerName,
  defaultPurpose,
  titleSuffix,
  onClose,
}: {
  contactId: string;
  contactName: string;
  partnerName?: string;
  /** Pre-fill the purpose textarea (e.g. the post-discovery follow-up brief). */
  defaultPurpose?: string;
  /** Override the modal title suffix (defaults to the contact name). */
  titleSuffix?: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"inputs" | "draft" | "saved">("inputs");
  const [purpose, setPurpose] = useState(defaultPurpose ?? "");
  const [senderRole, setSenderRole] = useState("");
  const [pricePoint, setPricePoint] = useState("");
  const [timeline, setTimeline] = useState("");
  const [ask, setAsk] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [genErr, setGenErr] = useState<string | null>(null);
  const [persistErr, setPersistErr] = useState<string | null>(null);
  const [savedKind, setSavedKind] = useState<"draft" | "sent" | null>(null);
  const [isGenerating, startGenerate] = useTransition();
  const [isPersisting, startPersist] = useTransition();

  const needsInputCount = (draftBody.match(/\[NEEDS INPUT/g) || []).length;

  function runGenerate() {
    setGenErr(null);
    startGenerate(async () => {
      try {
        const { body } = await generateEmailDraft(contactId, {
          purpose,
          ask,
          senderRole,
          pricePoint,
          timeline,
          partnerName,
        });
        setDraftBody(body);
        setStep("draft");
      } catch (err) {
        setGenErr(err instanceof Error ? err.message : "Failed to generate draft");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-bitumen/85 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[680px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Mail size={14} strokeWidth={1.5} className="text-track-gold" />
            <span className="title-md">Draft email · {titleSuffix ?? contactName}</span>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Anti-hallucination banner — always visible */}
        <div className="flex items-start gap-3 mx-5 mb-1 px-3 py-3 border-l-2 border-flag-red bg-flag-red/5 rounded-[var(--radius-sm)]">
          <ShieldAlert size={15} strokeWidth={1.5} className="text-flag-red shrink-0 mt-0.5" />
          <p className="text-[12px] text-bone-dim leading-snug">
            Claude will <span className="text-bone">not assume</span> a price, your role, a timeline, or any
            commitment it wasn&apos;t given. Anything missing comes back as a <span className="mono text-flag-red">[NEEDS INPUT]</span> marker
            in the draft — it is never guessed, and the draft can&apos;t save or send until you resolve it.
          </p>
        </div>

        {step === "inputs" ? (
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>What&apos;s this email for? <span className="text-flag-red">*</span></Label>
              <Textarea rows={3} placeholder="e.g. Follow up on the 2-week pilot Heather asked for" value={purpose} onChange={(e) => setPurpose(e.target.value)} disabled={isGenerating} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Specific ask / CTA</Label>
                <Input placeholder="e.g. 20 min Thursday?" value={ask} onChange={(e) => setAsk(e.target.value)} disabled={isGenerating} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Your role / sign-off</Label>
                <Input placeholder="Managing Partner" value={senderRole} onChange={(e) => setSenderRole(e.target.value)} disabled={isGenerating} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Price / number to state</Label>
                <Input placeholder="Leave blank — don't guess" value={pricePoint} onChange={(e) => setPricePoint(e.target.value)} disabled={isGenerating} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Date / timeline to commit</Label>
                <Input placeholder="Leave blank — don't guess" value={timeline} onChange={(e) => setTimeline(e.target.value)} disabled={isGenerating} />
              </div>
            </div>

            <p className="flex items-start gap-2 text-[12px] text-bone-mute">
              <Sparkles size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-track-gold" />
              <span>
                Claude reads {contactName.split(" ")[0]}&apos;s record and recent interactions for context. Leave any fact blank and it stays
                <span className="mono text-flag-red"> [NEEDS INPUT]</span> rather than invented.
              </span>
            </p>

            {genErr && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-sm)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{genErr}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={isGenerating}>Cancel</Button>
              <Button variant="primary" size="sm" disabled={!purpose.trim() || isGenerating} onClick={runGenerate}>
                {isGenerating ? "Generating…" : "Generate draft"}
              </Button>
            </div>
          </div>
        ) : step === "draft" ? (
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Sparkles size={13} strokeWidth={1.5} className="text-track-gold" />
              <span className="text-[13px] text-bone">Draft ready — edit freely, then save or send.</span>
            </div>
            <Textarea
              rows={14}
              className="font-body text-[13px] leading-relaxed"
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              disabled={isPersisting}
            />
            {needsInputCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-sm)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red" />
                <span className="text-[12px] text-bone-dim">
                  Claude flagged {needsInputCount} item(s) it would not guess. Fill these in before this can save or send.
                </span>
              </div>
            )}
            {persistErr && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-sm)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{persistErr}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("inputs")} disabled={isPersisting || isGenerating}>← Edit inputs</Button>
                <Button variant="ghost" size="sm" onClick={runGenerate} disabled={isPersisting || isGenerating}>
                  {isGenerating ? "Regenerating…" : "↻ Regenerate"}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={needsInputCount > 0 || isPersisting || !draftBody.trim()}
                  onClick={() => {
                    setPersistErr(null);
                    startPersist(async () => {
                      try {
                        await saveEmailDraft(contactId, { body: draftBody });
                        setSavedKind("draft");
                        setStep("saved");
                      } catch (err) {
                        setPersistErr(err instanceof Error ? err.message : "Failed to save draft");
                      }
                    });
                  }}
                >
                  {isPersisting && savedKind === null ? "Saving…" : "Save draft"}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={needsInputCount > 0 || isPersisting || !draftBody.trim()}
                  onClick={() => {
                    setPersistErr(null);
                    startPersist(async () => {
                      try {
                        await sendEmail(contactId, { body: draftBody });
                        setSavedKind("sent");
                        setStep("saved");
                      } catch (err) {
                        setPersistErr(err instanceof Error ? err.message : "Failed to send");
                      }
                    });
                  }}
                >
                  {isPersisting && savedKind === null ? "Sending…" : "Send"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className={cn("px-5 py-12 flex flex-col items-center text-center gap-3")}>
            <Check size={28} strokeWidth={1.5} className="text-track-gold" />
            <p className="text-[15px] text-bone leading-relaxed">
              {savedKind === "sent"
                ? `Email logged as sent to ${contactName} · interaction recorded.`
                : `Draft saved to Drive · review on the Deliverables tab.`}
            </p>
            <div className="pt-2">
              <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
