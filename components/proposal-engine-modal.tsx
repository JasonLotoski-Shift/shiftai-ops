"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Sparkles, ShieldAlert, FlaskConical, FileText } from "lucide-react";
import { Button, Label, Textarea } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { cn } from "@/lib/cn";
import { generatePrototypeBrief } from "@/app/(app)/pipeline/[id]/proposal-engine";
import { proposePrototypeKickoff } from "@/app/(app)/pipeline/[id]/prototype-kickoff";
import type { KickoffCandidate } from "@/lib/prototype-brief/types";
import { startPrototypeBuild } from "@/app/(app)/pipeline/[id]/prototype-actions";

// Build prototype — step before the deck in the proposal chain. Two-stage with a
// partner review gate: inputs (kickoff target pick) → brief (review/edit) → launch
// the worker loop, which opens the run view in a new tab. The deck is its own modal
// (deck-build-modal.tsx) now that both ride the worker loop.
type Step = "inputs" | "brief";

function countNeedsInput(s: string): number {
  return (s.match(/\[NEEDS INPUT/g) || []).length;
}

export function ProposalEngineModal({
  dealId,
  company,
  onClose,
}: {
  dealId: string;
  company: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("inputs");
  // Stage 0 kickoff: the ranked targets Claude proposes from the discovery report +
  // discussion notes, the partner's pick, and an optional steer.
  const [kickoff, setKickoff] = useState<{
    mode: "preselect" | "ask";
    preselected?: KickoffCandidate;
    options: KickoffCandidate[];
    reason: string;
  } | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [steer, setSteer] = useState("");
  const [loadingKickoff, setLoadingKickoff] = useState(false);
  const [brief, setBrief] = useState("");
  const [genErr, setGenErr] = useState<string | null>(null);
  const [isGenerating, startGenerate] = useTransition();
  const [startErr, setStartErr] = useState<string | null>(null);
  const [isStarting, startBuild] = useTransition();

  // Read the discovery report once when the modal opens, propose a target, and
  // pre-select the winner when Claude is confident.
  useEffect(() => {
    if (kickoff) return;
    setLoadingKickoff(true);
    proposePrototypeKickoff(dealId)
      .then((k) => {
        setKickoff(k);
        setChosenId(k.preselected?.id ?? null);
      })
      .catch(() => setKickoff({ mode: "ask", options: [], reason: "Could not read the discovery report." }))
      .finally(() => setLoadingKickoff(false));
  }, [dealId, kickoff]);

  const briefNeedsInput = countNeedsInput(brief);

  // Stage 1 — from the chosen target, draft the brief.
  function runFromInputs() {
    setGenErr(null);
    startGenerate(async () => {
      try {
        const chosen = kickoff?.options.find((o) => o.id === chosenId);
        if (!chosen) throw new Error("Pick where the prototype should start");
        const seed = { candidate: chosen, steer: steer.trim() || undefined };
        const { brief: out } = await generatePrototypeBrief(dealId, { seed });
        setBrief(out);
        setStep("brief");
      } catch (err) {
        setGenErr(err instanceof Error ? err.message : "Generation failed");
      }
    });
  }

  // Re-run stage 1 to redraft the brief.
  function regenerateBrief() {
    setGenErr(null);
    startGenerate(async () => {
      try {
        const chosen = kickoff?.options.find((o) => o.id === chosenId);
        if (!chosen) throw new Error("Pick where the prototype should start");
        const seed = { candidate: chosen, steer: steer.trim() || undefined };
        const { brief: out } = await generatePrototypeBrief(dealId, { seed });
        setBrief(out);
      } catch (err) {
        setGenErr(err instanceof Error ? err.message : "Generation failed");
      }
    });
  }

  // Hand the brief to the worker loop, then open the run in its own tab. Open the run
  // tab SYNCHRONOUSLY in the click gesture, before any await — a window.open() after
  // `await` is treated as programmatic and gets popup-blocked.
  const launch = () => {
    const win = window.open("about:blank", "_blank");
    startBuild(async () => {
      setStartErr(null);
      try {
        const { runId } = await startPrototypeBuild(dealId, brief);
        const url = `/prototype/${runId}`;
        if (win && !win.closed) win.location.href = url;
        else window.open(url, "_blank");
        onClose();
      } catch (e) {
        if (win && !win.closed) win.close();
        setStartErr(e instanceof Error ? e.message : "Could not start the build");
      }
    });
  };

  return (
    <ModalShell onClose={onClose} guard positionClassName="items-start justify-center pt-12 px-4">
      <div
        className="w-full max-w-[920px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <FlaskConical size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>Build prototype · {company}</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex items-start gap-3 mx-5 mb-1 px-3 py-3 rounded-[var(--radius)] border border-flag-red/40 bg-flag-red/5">
          <ShieldAlert size={15} strokeWidth={1.5} className="text-flag-red shrink-0 mt-0.5" />
          <p className="text-[12px] text-bone-dim leading-snug">
            Built from the deal&apos;s history and files: it won&apos;t invent a fee, a date, or a client fact. Anything
            missing appears as a visible <span className="mono text-flag-red">[NEEDS INPUT]</span> marker and nothing
            can save until you resolve it. Review and edit before you share it.
          </p>
        </div>

        {step === "inputs" ? (
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Where should the prototype start?{kickoff?.mode === "ask" ? " (pick one)" : ""}</Label>
              {loadingKickoff && <p className="text-[12px] text-bone-mute">Reading the discovery report…</p>}
              {!loadingKickoff && kickoff?.reason && <p className="text-[12px] text-bone-mute">{kickoff.reason}</p>}
              <div className="flex flex-col gap-1.5">
                {kickoff?.options.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setChosenId(o.id)}
                    disabled={isGenerating}
                    className={cn(
                      "rounded-[var(--radius-sm)] border px-2.5 py-2 text-left text-[12px] transition-colors",
                      chosenId === o.id
                        ? "border-track-gold/70 bg-track-gold-dim/10"
                        : "border-graphite bg-asphalt/40 hover:border-bone-mute/40",
                    )}
                  >
                    <div className="font-medium text-bone">{o.title}</div>
                    <div className="text-bone-mute">{o.pain}</div>
                    {o.rationale && <div className="text-bone-mute/80 mt-0.5">{o.rationale}</div>}
                  </button>
                ))}
              </div>
              <Label className="mt-1">Optional steer</Label>
              <Textarea
                rows={2}
                placeholder="e.g. lean into the live routing map"
                value={steer}
                onChange={(e) => setSteer(e.target.value)}
                disabled={isGenerating}
              />
            </div>
            <p className="flex items-start gap-2 text-[12px] text-bone-mute">
              <Sparkles size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-track-gold" />
              <span>
                {isGenerating
                  ? "Reading the client's files and drafting the brief — transcripts, discovery, survey, notes, plus a web look at their brand colors."
                  : `Claude reads ${company}'s deal plus every file in its Drive folder — transcripts, discovery report, survey, call notes, screenshots.`}
              </span>
            </p>
            {genErr && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{genErr}</span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={isGenerating}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!chosenId || isGenerating || loadingKickoff}
                onClick={runFromInputs}
              >
                {isGenerating ? "Reading files…" : "Read files & draft brief"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <FileText size={13} strokeWidth={1.5} className="text-track-gold" />
              <span className="text-[13px] text-bone">Brief ready — edit the user stories and features, then build.</span>
            </div>
            <Textarea
              rows={20}
              className="font-mono text-[11px] leading-relaxed"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              disabled={isStarting || isGenerating}
            />
            {briefNeedsInput > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red" />
                <span className="text-[12px] text-bone-dim">Claude flagged {briefNeedsInput} item(s) it would not guess — fill them in before building.</span>
              </div>
            )}
            {genErr && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{genErr}</span>
              </div>
            )}
            {startErr && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{startErr}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("inputs")} disabled={isStarting || isGenerating}>
                  ← Edit target
                </Button>
                <Button variant="ghost" size="sm" onClick={regenerateBrief} disabled={isStarting || isGenerating}>
                  {isGenerating ? "Redrafting…" : "↻ Regenerate brief"}
                </Button>
              </div>
              <Button
                variant="primary"
                size="sm"
                disabled={briefNeedsInput > 0 || isStarting || isGenerating || !brief.trim()}
                onClick={launch}
              >
                {isStarting ? "Starting…" : "Build prototype →"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
