"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, ArrowRight, Check, FolderPlus } from "lucide-react";
import { Button, Textarea, Label, Hairline } from "@/components/ui";
import { Wordmark } from "@/components/wordmark";
import type {
  DealModel as Deal,
  PartnerModel as Partner,
  ContactModel as Contact,
} from "@/lib/generated/prisma/models";
import { formatCAD } from "@/lib/format";

/**
 * Convert-Deal flow.
 * In production: fires `engagement.created` event, triggers /new-client skill,
 * creates Drive folder + Claude workspace + engagement charter draft.
 */
export function ConvertDealModal({
  open,
  onClose,
  deal,
  partner,
  contact,
}: {
  open: boolean;
  onClose: () => void;
  deal: Deal;
  partner: Partner | null;
  contact: Contact | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"review" | "scaffolding" | "done">("review");
  const [scope, setScope] = useState(
    `Discovery (4 weeks) → Build (12 weeks) → Run (open-ended).\n\nScope: custom internal ops platform with AI layer, integrating with existing systems. Specifics confirmed during discovery embed.`,
  );

  function start() {
    setStep("scaffolding");
    setTimeout(() => setStep("done"), 2400);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-bitumen/85 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[680px] bg-asphalt border border-graphite mb-16"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-graphite">
          <div className="flex items-center gap-3">
            <ArrowRight size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>— Convert deal · {deal.company}</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {step === "review" && (
          <>
            <div className="px-6 py-6 flex flex-col gap-6">
              <div>
                <h2 className="display-md text-bone mb-2">SIGN IT.</h2>
                <p className="text-[13px] text-bone-dim leading-relaxed">
                  This converts the deal into a signed client and fires the{" "}
                  <code className="mono text-bone bg-graphite px-1.5 py-0.5">engagement.created</code> event.
                  Claude Code will scaffold the workspace and engagement charter automatically.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-bitumen border border-graphite p-4">
                  <Label>— Client</Label>
                  <div className="text-[14px] text-bone mt-2">{deal.company}</div>
                </div>
                <div className="bg-bitumen border border-graphite p-4">
                  <Label>— Contract value</Label>
                  <div className="mono text-[18px] text-track-gold mt-2 tabular-nums">
                    {formatCAD(deal.valueEstimate).replace("CA$", "$")}
                  </div>
                </div>
                <div className="bg-bitumen border border-graphite p-4">
                  <Label>— Partner lead</Label>
                  <div className="text-[14px] text-bone mt-2">{partner?.name ?? "—"}</div>
                </div>
                <div className="bg-bitumen border border-graphite p-4">
                  <Label>— Primary contact</Label>
                  <div className="text-[14px] text-bone mt-2">{contact?.name ?? "—"}</div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>— Engagement scope (drafts the charter)</Label>
                <Textarea
                  rows={5}
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                />
              </div>

              <div className="bg-bitumen border border-graphite p-4 flex flex-col gap-3">
                <Label gold>— On convert, the system will:</Label>
                <ul className="flex flex-col gap-1.5 text-[13px] text-bone-dim">
                  <li className="flex gap-2"><span className="text-track-gold">01</span>Create client record + project record in this ops tool</li>
                  <li className="flex gap-2"><span className="text-track-gold">02</span>Create Drive folder at <code className="mono text-bone-mute">/Shift AI/03-Clients/{deal.company}/</code></li>
                  <li className="flex gap-2"><span className="text-track-gold">03</span>Scaffold Claude workspace at <code className="mono text-bone-mute">ShiftAI-Clients/{deal.company.replace(/\s+/g, "")}/</code></li>
                  <li className="flex gap-2"><span className="text-track-gold">04</span>Generate engagement charter draft from the scope above</li>
                  <li className="flex gap-2"><span className="text-track-gold">05</span>Fire <code className="mono text-bone-mute">engagement.created</code> · partners notified</li>
                </ul>
              </div>
            </div>

            <Hairline />

            <div className="px-6 py-4 flex justify-between items-center">
              <span className="label">~30 seconds · then ready to work</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="md" onClick={onClose}>Cancel</Button>
                <Button variant="primary" size="md" onClick={start}>Convert & scaffold</Button>
              </div>
            </div>
          </>
        )}

        {step === "scaffolding" && (
          <div className="px-6 py-12 flex flex-col items-center gap-6">
            <Wordmark size="sm" />
            <div className="flex flex-col gap-3 w-full max-w-[420px]">
              {[
                "Creating client record…",
                "Creating Drive folder…",
                "Scaffolding Claude workspace…",
                "Drafting engagement charter…",
                "Firing engagement.created event…",
              ].map((line, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 text-[13px]"
                  style={{
                    opacity: 0,
                    animation: `fadeIn 0.4s ease forwards`,
                    animationDelay: `${i * 0.42}s`,
                  }}
                >
                  <span className="w-5 h-5 border border-track-gold/40 bg-track-gold-dim/20 flex items-center justify-center text-track-gold">
                    <Check size={11} strokeWidth={2} />
                  </span>
                  <span className="text-bone">{line}</span>
                </div>
              ))}
            </div>
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          </div>
        )}

        {step === "done" && (
          <div className="px-6 py-10 flex flex-col items-center gap-5 text-center">
            <div className="w-14 h-14 bg-track-gold-dim/30 border border-track-gold flex items-center justify-center">
              <Check size={24} strokeWidth={1.5} className="text-track-gold" />
            </div>
            <div>
              <h2 className="display-md text-bone mb-2">ENGAGED.</h2>
              <p className="text-[13px] text-bone-dim leading-relaxed max-w-[400px]">
                {deal.company} is now a client. Workspace scaffolded, charter drafted, Drive folder live.
                Open the project to begin.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="ghost"
                size="md"
                onClick={() => { onClose(); router.push("/projects"); }}
              >
                Stay in pipeline
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => { onClose(); router.push("/projects"); }}
              >
                <FolderPlus size={13} strokeWidth={1.5} />
                Open project
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
