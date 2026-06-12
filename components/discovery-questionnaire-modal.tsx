"use client";

// Discovery questionnaire — generate → review/edit → create Tally form.
// Step 1: focus → generate structured questions. Step 2: edit the list (label,
// type, options, required; add/remove) + a title. Step 3: the live form URL +
// Copy. The server actions live in pipeline/[id]/tally-actions.ts; the Tally
// form is created on "Create form".

import { useState, useTransition } from "react";
import { X, Sparkles, Plus, Trash2, Check, Copy, ShieldAlert, ClipboardList } from "lucide-react";
import { Button, Label, Input, Textarea, Select, Badge } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { generateQuestionnaire, createDiscoveryQuestionnaireForm } from "@/app/(app)/pipeline/[id]/tally-actions";
import type { SurveyQuestion, SurveyQuestionType } from "@/lib/tally";

const TYPE_LABELS: Record<SurveyQuestionType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  number: "Number",
  email: "Email",
  single_select: "Single choice",
  multi_select: "Multi choice",
  dropdown: "Dropdown",
  rating: "Rating 1–5",
  linear_scale: "Scale 1–10",
  ranking: "Ranking",
  file_upload: "File / link",
};
const OPTION_TYPES = new Set<SurveyQuestionType>(["single_select", "multi_select", "dropdown", "ranking"]);

export function DiscoveryQuestionnaireModal({
  dealId,
  company,
  onClose,
}: {
  dealId: string;
  company: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"gen" | "edit" | "done">("gen");
  const [focus, setFocus] = useState("");
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState(`${company} · Discovery questionnaire`);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [formUrl, setFormUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function gen() {
    setErr(null);
    start(async () => {
      try {
        const res = await generateQuestionnaire(dealId, { focus, notes });
        setQuestions(res.questions);
        setStep("edit");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't generate the questionnaire.");
      }
    });
  }

  function createForm() {
    setErr(null);
    start(async () => {
      try {
        const res = await createDiscoveryQuestionnaireForm(dealId, { title, questions });
        setFormUrl(res.tallyFormUrl);
        setStep("done");
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't create the form.");
      }
    });
  }

  function patch(i: number, p: Partial<SurveyQuestion>) {
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...p } : q)));
  }
  function remove(i: number) {
    setQuestions((qs) => qs.filter((_, j) => j !== i));
  }
  function add() {
    setQuestions((qs) => [...qs, { type: "long_text", label: "", required: false, section: qs[qs.length - 1]?.section }]);
  }

  return (
    <ModalShell onClose={onClose} guard={step !== "done"} positionClassName="items-start justify-center pt-12 px-4">
      <div className="w-full max-w-[760px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <ClipboardList size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>Discovery questionnaire · {company}</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone"><X size={16} strokeWidth={1.5} /></button>
        </div>

        {err && (
          <div className="mx-5 mb-3 flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
            <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
            <span className="text-[12px] text-bone-dim">{err}</span>
          </div>
        )}

        {step === "gen" && (
          <div className="px-5 py-5 flex flex-col gap-4">
            <p className="text-[12px] text-bone-dim leading-snug">
              Generates a deep questionnaire tailored to {company}&apos;s business from the call transcripts, notes, and files in the deal&apos;s Drive folder. You review and edit it before a form is created.
            </p>
            <div className="flex flex-col gap-2">
              <Label>Focus / must-ask areas</Label>
              <Textarea rows={3} placeholder="e.g. Dig into dispatch and the re-keying into the parent company's systems; quantify the hours lost." value={focus} onChange={(e) => setFocus(e.target.value)} disabled={busy} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Notes (optional)</Label>
              <Input placeholder="Anything else to weave in" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={gen} disabled={busy}>
                <Sparkles size={13} strokeWidth={1.5} />
                {busy ? "Generating…" : "Generate questions"}
              </Button>
            </div>
          </div>
        )}

        {step === "edit" && (
          <div className="px-5 py-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-bone-mute">{questions.length} questions — edit, remove, or add before creating the form.</span>
              <Button variant="secondary" size="sm" onClick={add} disabled={busy}><Plus size={13} strokeWidth={1.5} />Add</Button>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Form title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
            </div>

            <div className="flex flex-col gap-3 max-h-[46vh] overflow-y-auto pr-1">
              {questions.map((q, i) => {
                const showSection = i === 0 || q.section !== questions[i - 1]?.section;
                return (
                  <div key={i}>
                    {showSection && q.section && (
                      <div className="label text-[10px] text-track-gold pt-2 pb-1">{q.section}</div>
                    )}
                    <div className="rounded-[var(--radius)] border border-graphite/50 bg-bitumen p-3 flex flex-col gap-2">
                      <div className="flex items-start gap-2">
                        <Textarea rows={2} className="text-[12px]" value={q.label} placeholder="Question…" onChange={(e) => patch(i, { label: e.target.value })} disabled={busy} />
                        <button onClick={() => remove(i)} disabled={busy} className="text-bone-mute hover:text-flag-red shrink-0 mt-1" aria-label="Remove"><Trash2 size={14} strokeWidth={1.5} /></button>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Select value={q.type} onChange={(e) => patch(i, { type: e.target.value as SurveyQuestionType })} disabled={busy} className="w-[140px]">
                          {(Object.keys(TYPE_LABELS) as SurveyQuestionType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                        </Select>
                        {OPTION_TYPES.has(q.type) && (
                          <Input
                            className="flex-1 min-w-[180px] text-[12px]"
                            placeholder="Options, comma-separated"
                            value={(q.options ?? []).join(", ")}
                            onChange={(e) => patch(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                            disabled={busy}
                          />
                        )}
                        <label className="flex items-center gap-1.5 text-[11px] text-bone-mute cursor-pointer ml-auto">
                          <input type="checkbox" checked={!!q.required} onChange={(e) => patch(i, { required: e.target.checked })} className="accent-track-gold" disabled={busy} />
                          Required
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setStep("gen")} disabled={busy}>Back</Button>
              <Button variant="primary" size="sm" onClick={createForm} disabled={busy || questions.length === 0}>
                {busy ? "Creating form…" : "Create Tally form"}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && formUrl && (
          <div className="px-5 py-8 flex flex-col items-center gap-4 text-center">
            <Check size={26} strokeWidth={1.5} className="text-track-gold" />
            <div className="title-md text-track-gold">Form created</div>
            <p className="text-[12px] text-bone-dim max-w-[440px]">Send this link in your follow-up email. When {company} submits, the answers land on the deal automatically and feed the discovery report.</p>
            <div className="flex items-center gap-2 w-full max-w-[520px]">
              <Input readOnly value={formUrl} className="text-[12px]" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="secondary" size="sm" onClick={() => { void navigator.clipboard?.writeText(formUrl); setCopied(true); }}>
                <Copy size={13} strokeWidth={1.5} />{copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="pt-2"><Button variant="primary" size="sm" onClick={onClose}>Done</Button></div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
