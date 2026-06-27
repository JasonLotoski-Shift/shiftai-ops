"use client";

// Firm Knowledge — log a decision (ADR-style). The single highest-leverage new
// record type for a partner firm: what was decided, the options weighed, and the
// consequences. Lands as a draft; a partner approves before skills can read it.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Textarea, Select, Label } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { Plus, Loader2, AlertTriangle } from "lucide-react";
import { createDecisionRecord } from "@/app/(app)/firm-knowledge/actions";

export function NewDecisionDialog({
  categories,
  canSetManagingPartner = false,
}: {
  categories: { id: string; label: string }[];
  canSetManagingPartner?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [options, setOptions] = useState("");
  const [decision, setDecision] = useState("");
  const [consequences, setConsequences] = useState("");
  const [decidedAt, setDecidedAt] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sensitivity, setSensitivity] = useState<"firm_wide" | "managing_partner">("firm_wide");

  const dirty = !!(title || context || options || decision || consequences);

  function close() {
    setOpen(false);
    setTitle(""); setContext(""); setOptions(""); setDecision(""); setConsequences("");
    setDecidedAt(""); setCategoryId(""); setSensitivity("firm_wide");
    setBusy(false); setError(null);
  }

  async function onSubmit() {
    setError(null);
    if (!title.trim()) return setError("A title is required.");
    if (!decision.trim()) return setError("The decision is required.");
    setBusy(true);
    const res = await createDecisionRecord({
      title, context, optionsConsidered: options, decision, consequences,
      decidedAt: decidedAt || undefined,
      categoryId: categoryId || null,
      sensitivity,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Could not save.");
    close();
    router.refresh();
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <Plus size={14} strokeWidth={1.5} />
        Log a decision
      </Button>

      {open && (
        <ModalShell onClose={close} guard={dirty && !busy}>
          <div
            className="w-full max-w-[560px] bg-asphalt border border-graphite-2 rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-6 flex flex-col gap-4 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="title-md text-bone">Log a decision</span>

            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What was decided, in a line" disabled={busy} />
            </Field>

            <Field label="Context">
              <Textarea value={context} onChange={(e) => setContext(e.target.value)} rows={2} placeholder="The situation that forced the call" disabled={busy} />
            </Field>

            <Field label="Options considered">
              <Textarea value={options} onChange={(e) => setOptions(e.target.value)} rows={2} placeholder="What was weighed" disabled={busy} />
            </Field>

            <Field label="Decision">
              <Textarea value={decision} onChange={(e) => setDecision(e.target.value)} rows={2} placeholder="What was chosen" disabled={busy} />
            </Field>

            <Field label="Consequences">
              <Textarea value={consequences} onChange={(e) => setConsequences(e.target.value)} rows={2} placeholder="What it commits the firm to" disabled={busy} />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Decided on">
                <Input type="date" value={decidedAt} onChange={(e) => setDecidedAt(e.target.value)} disabled={busy} />
              </Field>
              <Field label="Category">
                <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={busy}>
                  <option value="">Uncategorised</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </Select>
              </Field>
              {canSetManagingPartner && (
                <Field label="Visibility">
                  <Select value={sensitivity} onChange={(e) => setSensitivity(e.target.value as "firm_wide" | "managing_partner")} disabled={busy}>
                    <option value="firm_wide">All partners</option>
                    <option value="managing_partner">MP only</option>
                  </Select>
                </Field>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 text-[12px] text-flag-red">
                <AlertTriangle size={14} strokeWidth={1.5} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={close} disabled={busy}>Cancel</Button>
              <Button size="sm" onClick={onSubmit} disabled={busy} className="gap-1.5">
                {busy && <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />}
                Save as draft
              </Button>
            </div>
          </div>
        </ModalShell>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
