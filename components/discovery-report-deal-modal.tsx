"use client";

// Build the client-facing Discovery Report for a DEAL, seeded from the returned
// questionnaire answers. Generate (optional framing) → edit the HTML → save to
// Drive + an Artifact on the deal. Actions: pipeline/[id]/tally-actions.ts.

import { useState, useTransition } from "react";
import { X, Sparkles, ShieldAlert, FileText, Check } from "lucide-react";
import { Button, Label, Input, Textarea } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { generateDiscoveryReportForDeal, saveDiscoveryReportForDeal } from "@/app/(app)/pipeline/[id]/tally-actions";

export function DiscoveryReportDealModal({
  dealId,
  company,
  onClose,
}: {
  dealId: string;
  company: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"in" | "edit" | "done">("in");
  const [findings, setFindings] = useState("");
  const [timeBack, setTimeBack] = useState("");
  const [outcomes, setOutcomes] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function gen() {
    setErr(null);
    start(async () => {
      try {
        const r = await generateDiscoveryReportForDeal(dealId, { findings, timeBack, outcomes });
        setBody(r.body);
        setStep("edit");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't generate the report.");
      }
    });
  }
  function save() {
    setErr(null);
    start(async () => {
      try {
        await saveDiscoveryReportForDeal(dealId, { body });
        setStep("done");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't save the report.");
      }
    });
  }

  return (
    <ModalShell onClose={onClose} guard={step !== "done"} positionClassName="items-start justify-center pt-12 px-4">
      <div className="w-full max-w-[760px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <FileText size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>Discovery report · {company}</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone"><X size={16} strokeWidth={1.5} /></button>
        </div>

        {err && (
          <div className="mx-5 mb-3 flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
            <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
            <span className="text-[12px] text-bone-dim">{err}</span>
          </div>
        )}

        {step === "in" && (
          <div className="px-5 py-5 flex flex-col gap-4">
            <p className="text-[12px] text-bone-dim leading-snug">Built from the questionnaire answers. Add your framing — leave blank to let the answers carry it. Fill in the time-back and the two outcomes the close confirms (or mark them in the draft).</p>
            <div className="flex flex-col gap-2">
              <Label>Findings / your framing (optional)</Label>
              <Textarea rows={3} placeholder="The system worth building, the one new insight to surface, anything the answers don't say." value={findings} onChange={(e) => setFindings(e.target.value)} disabled={busy} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2"><Label>Time-back target</Label><Input placeholder="e.g. ~12 hrs/week back on dispatch" value={timeBack} onChange={(e) => setTimeBack(e.target.value)} disabled={busy} /></div>
              <div className="flex flex-col gap-2"><Label>The two outcomes (X and Y)</Label><Input placeholder="e.g. one board per job; runouts predicted" value={outcomes} onChange={(e) => setOutcomes(e.target.value)} disabled={busy} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={gen} disabled={busy}><Sparkles size={13} strokeWidth={1.5} />{busy ? "Generating…" : "Generate report"}</Button>
            </div>
          </div>
        )}

        {step === "edit" && (
          <div className="px-5 py-5 flex flex-col gap-3">
            <span className="text-[12px] text-bone-mute">Edit the HTML if needed, then save. It files to Drive and lands on the deal.</span>
            <Textarea rows={16} className="font-mono text-[11px] leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setStep("in")} disabled={busy}>Back</Button>
              <Button variant="primary" size="sm" onClick={save} disabled={busy || !body.trim()}>{busy ? "Saving…" : "Save to deal"}</Button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="px-5 py-10 flex flex-col items-center gap-3 text-center">
            <Check size={24} strokeWidth={1.5} className="text-track-gold" />
            <div className="title-md text-track-gold">Saved</div>
            <p className="text-[12px] text-bone-dim">Filed to Drive and on the deal&apos;s deliverables. Refine and send when ready.</p>
            <div className="pt-2"><Button variant="primary" size="sm" onClick={onClose}>Done</Button></div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
