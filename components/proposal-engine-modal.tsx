"use client";

import { useState, useTransition } from "react";
import { X, Sparkles, ShieldAlert, FlaskConical, Presentation, Eye, Code, FileText } from "lucide-react";
import { Button, Label, Textarea } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { cn } from "@/lib/cn";
import {
  generatePrototypeBrief,
  savePrototypeBrief,
  generatePrototypeHtml,
  savePrototype,
  generateProposalDeck,
  saveProposalDeck,
} from "@/app/(app)/pipeline/[id]/proposal-engine";

type EngineMode = "prototype" | "deck";

// prototype: inputs → brief (review/edit) → build → saved
// deck:      inputs → build → saved   (no brief step)
type Step = "inputs" | "brief" | "build" | "saved";

const MODE = {
  prototype: {
    title: "Build prototype",
    icon: FlaskConical,
    focusLabel: "What problem should the prototype show?",
    focusPlaceholder: "e.g. Show a dispatcher assigning jobs and seeing ETA-risk flags update live",
    inputsHint: (company: string) =>
      `Claude reads ${company}'s deal plus every file in its Drive folder — transcripts, discovery report, survey, call notes, screenshots.`,
    briefing: "Reading the client's files and drafting the brief — transcripts, discovery, survey, notes, plus a web look at their brand colors.",
    building: "Building the prototype from the brief — multi-tab, clickable, with mockup data. This Opus build can take a minute or two.",
  },
  deck: {
    title: "Build proposal deck",
    icon: Presentation,
    focusLabel: "What should the deck emphasize?",
    focusPlaceholder: "e.g. Phased build, the IP they own, fixed fee; lead with the prototype demo",
    inputsHint: (company: string) =>
      `Claude reads ${company}'s deal, contact, and recent interactions for context.`,
    briefing: "",
    building: "Writing the proposal deck — scope, timeline, deliverables, price, and the prototype demo link.",
  },
} as const;

function countNeedsInput(s: string): number {
  return (s.match(/\[NEEDS INPUT/g) || []).length;
}

export function ProposalEngineModal({
  dealId,
  company,
  mode,
  onClose,
}: {
  dealId: string;
  company: string;
  mode: EngineMode;
  onClose: () => void;
}) {
  const cfg = MODE[mode];
  const Icon = cfg.icon;
  const isPrototype = mode === "prototype";

  const [step, setStep] = useState<Step>("inputs");
  const [focus, setFocus] = useState("");
  const [brief, setBrief] = useState("");
  const [html, setHtml] = useState("");
  const [view, setView] = useState<"preview" | "code">("preview");
  const [genErr, setGenErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [isGenerating, startGenerate] = useTransition();
  const [isSaving, startSave] = useTransition();

  const briefNeedsInput = countNeedsInput(brief);
  const htmlNeedsInput = countNeedsInput(html);

  // Stage 1 — from the focus, either draft the brief (prototype) or the deck (deck).
  function runFromInputs() {
    setGenErr(null);
    startGenerate(async () => {
      try {
        if (isPrototype) {
          const { brief: out } = await generatePrototypeBrief(dealId, { focus });
          setBrief(out);
          setStep("brief");
        } else {
          const { html: out } = await generateProposalDeck(dealId, { focus });
          setHtml(out);
          setView("preview");
          setStep("build");
        }
      } catch (err) {
        setGenErr(err instanceof Error ? err.message : "Generation failed");
      }
    });
  }

  // Prototype only — re-run stage 1 to redraft the brief.
  function regenerateBrief() {
    setGenErr(null);
    startGenerate(async () => {
      try {
        const { brief: out } = await generatePrototypeBrief(dealId, { focus });
        setBrief(out);
      } catch (err) {
        setGenErr(err instanceof Error ? err.message : "Generation failed");
      }
    });
  }

  // Prototype only — save the approved brief, then build the HTML from it.
  function saveBriefAndBuild() {
    setSaveErr(null);
    startSave(async () => {
      try {
        await savePrototypeBrief(dealId, { brief });
      } catch (err) {
        setSaveErr(err instanceof Error ? err.message : "Failed to save brief");
        return;
      }
      setStep("build");
      startGenerate(async () => {
        try {
          const { html: out } = await generatePrototypeHtml(dealId, { brief });
          setHtml(out);
          setView("preview");
        } catch (err) {
          setGenErr(err instanceof Error ? err.message : "Build failed");
        }
      });
    });
  }

  // Stage 2 rebuild — prototype rebuilds from the brief; deck rebuilds from focus.
  function rebuild() {
    setGenErr(null);
    startGenerate(async () => {
      try {
        const { html: out } = isPrototype
          ? await generatePrototypeHtml(dealId, { brief })
          : await generateProposalDeck(dealId, { focus });
        setHtml(out);
      } catch (err) {
        setGenErr(err instanceof Error ? err.message : "Build failed");
      }
    });
  }

  function saveFinal() {
    setSaveErr(null);
    startSave(async () => {
      try {
        if (isPrototype) await savePrototype(dealId, { html });
        else await saveProposalDeck(dealId, { html });
        setStep("saved");
      } catch (err) {
        setSaveErr(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <ModalShell onClose={onClose} guard={step !== "saved"} positionClassName="items-start justify-center pt-12 px-4">
      <div
        className="w-full max-w-[920px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Icon size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>{cfg.title} · {company}</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex items-start gap-3 mx-5 mb-1 px-3 py-3 rounded-[var(--radius)] border border-flag-red/40 bg-flag-red/5">
          <ShieldAlert size={15} strokeWidth={1.5} className="text-flag-red shrink-0 mt-0.5" />
          <p className="text-[12px] text-bone-dim leading-snug">
            Built from the deal&apos;s history and files — it won&apos;t invent a fee, a date, or a client fact. Anything
            missing appears as a visible <span className="mono text-flag-red">[NEEDS INPUT]</span> marker and nothing
            can save until you resolve it. Review and edit before you share it.
          </p>
        </div>

        {step === "inputs" ? (
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>{cfg.focusLabel} <span className="text-flag-red">*</span></Label>
              <Textarea rows={3} placeholder={cfg.focusPlaceholder} value={focus} onChange={(e) => setFocus(e.target.value)} disabled={isGenerating} />
            </div>
            <p className="flex items-start gap-2 text-[12px] text-bone-mute">
              <Sparkles size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-track-gold" />
              <span>{isGenerating ? (isPrototype ? cfg.briefing : cfg.building) : cfg.inputsHint(company)}</span>
            </p>
            {genErr && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{genErr}</span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={isGenerating}>Cancel</Button>
              <Button variant="primary" size="sm" disabled={!focus.trim() || isGenerating} onClick={runFromInputs}>
                {isGenerating ? (isPrototype ? "Reading files…" : "Building…") : isPrototype ? "Read files & draft brief" : cfg.title}
              </Button>
            </div>
          </div>
        ) : step === "brief" ? (
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
              disabled={isSaving || isGenerating}
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
            {saveErr && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{saveErr}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("inputs")} disabled={isSaving || isGenerating}>← Edit focus</Button>
                <Button variant="ghost" size="sm" onClick={regenerateBrief} disabled={isSaving || isGenerating}>
                  {isGenerating ? "Redrafting…" : "↻ Regenerate brief"}
                </Button>
              </div>
              <Button
                variant="primary"
                size="sm"
                disabled={briefNeedsInput > 0 || isSaving || isGenerating || !brief.trim()}
                onClick={saveBriefAndBuild}
              >
                {isSaving ? "Saving brief…" : "Save brief & build →"}
              </Button>
            </div>
          </div>
        ) : step === "build" ? (
          <div className="px-5 py-5 flex flex-col gap-4">
            {isGenerating && !html ? (
              <div className="flex items-start gap-2 px-3 py-3 text-[12px] text-bone-dim">
                <Sparkles size={13} strokeWidth={1.5} className="text-track-gold mt-0.5 shrink-0" />
                <span>{cfg.building}</span>
              </div>
            ) : null}

            {html ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={13} strokeWidth={1.5} className="text-track-gold" />
                    <span className="text-[13px] text-bone">Draft ready — preview it, edit the HTML, then save.</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setView("preview")}
                      className={cn("inline-flex items-center gap-1.5 px-2.5 h-7 text-[12px] rounded-[var(--radius-sm)] border", view === "preview" ? "border-track-gold/40 text-track-gold bg-track-gold-dim/10" : "border-graphite text-bone-mute hover:text-bone")}
                    >
                      <Eye size={12} strokeWidth={1.5} /> Preview
                    </button>
                    <button
                      onClick={() => setView("code")}
                      className={cn("inline-flex items-center gap-1.5 px-2.5 h-7 text-[12px] rounded-[var(--radius-sm)] border", view === "code" ? "border-track-gold/40 text-track-gold bg-track-gold-dim/10" : "border-graphite text-bone-mute hover:text-bone")}
                    >
                      <Code size={12} strokeWidth={1.5} /> HTML
                    </button>
                  </div>
                </div>

                {view === "preview" ? (
                  <iframe
                    title="Prototype preview"
                    srcDoc={html}
                    sandbox="allow-scripts"
                    className="w-full h-[60vh] bg-white rounded-[var(--radius)] border border-graphite"
                  />
                ) : (
                  <Textarea
                    rows={22}
                    className="font-mono text-[11px] leading-relaxed"
                    value={html}
                    onChange={(e) => setHtml(e.target.value)}
                    disabled={isSaving}
                  />
                )}

                {htmlNeedsInput > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                    <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red" />
                    <span className="text-[12px] text-bone-dim">Claude flagged {htmlNeedsInput} item(s) it would not guess — find them in the HTML and fill them in before saving.</span>
                  </div>
                )}
              </>
            ) : null}

            {genErr && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{genErr}</span>
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(isPrototype ? "brief" : "inputs")}
                  disabled={isSaving || isGenerating}
                >
                  {isPrototype ? "← Edit brief" : "← Edit inputs"}
                </Button>
                <Button variant="ghost" size="sm" onClick={rebuild} disabled={isSaving || isGenerating || !html}>
                  {isGenerating ? "Rebuilding…" : "↻ Rebuild"}
                </Button>
              </div>
              <Button
                variant="primary"
                size="sm"
                disabled={htmlNeedsInput > 0 || isSaving || isGenerating || !html.trim()}
                onClick={saveFinal}
              >
                {isSaving ? "Saving…" : `Save ${cfg.title.replace("Build ", "")}`}
              </Button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <div className="title-lg text-track-gold mb-2 inline-block">SAVED</div>
            <p className="text-[13px] text-bone-dim">Filed to Drive · review it on the deal&apos;s Deliverables.</p>
            <div className="pt-5">
              <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
