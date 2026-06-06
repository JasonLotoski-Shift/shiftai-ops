"use client";

// FEATURE 5 — Send / raise invoice from a project.
//
// A button that opens a modal: pick a planned installment (preset fills the
// amount) OR override with a free CAD amount, set due-in-days, submit. On
// success it links through to the freshly-created draft invoice.
//
// Server-page → client-child pattern (see components/deal-actions.tsx).
// Writes go through createInvoiceFromProject in billing-actions.ts.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Receipt, X, ShieldAlert } from "lucide-react";
import { Button, Label, Input, Select } from "@/components/ui";
import { formatCAD } from "@/lib/format";
import { createInvoiceFromProject, markInvoiceManual } from "@/app/(app)/projects/[id]/billing-actions";

export type InvoiceableInstallment = {
  id: string;
  label: string;
  amount: number;
  status: "planned" | "invoiced" | "paid";
};

// Local YYYY-MM-DD (avoids the UTC shift toISOString would introduce).
function todayLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function SendInvoiceModal({
  projectId,
  installments,
  remainingFee,
}: {
  projectId: string;
  installments: InvoiceableInstallment[];
  remainingFee: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Only planned installments can be raised into a new invoice.
  const presets = installments.filter((i) => i.status === "planned");

  // "" = custom override; otherwise the chosen installment id.
  const [presetId, setPresetId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [dueInDays, setDueInDays] = useState<string>("30");
  // false = raise a draft through the tool; true = log an invoice already sent
  // manually (Shane Nolan case) — creates a SENT invoice, no generated doc.
  const [manual, setManual] = useState(false);
  // Sent date for the manual path — back-datable (an invoice sent last week,
  // logged today). Defaults to today. Ignored on the draft path.
  const [sentDate, setSentDate] = useState<string>(todayLocal);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setPresetId("");
    setAmount("");
    setDueInDays("30");
    setManual(false);
    setSentDate(todayLocal());
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function choosePreset(id: string) {
    setPresetId(id);
    const preset = presets.find((p) => p.id === id);
    if (preset) setAmount(String(preset.amount));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const res = manual
          ? await markInvoiceManual(projectId, {
              installmentId: presetId || undefined,
              amount: Number(amount),
              issuedAt: sentDate || undefined,
              dueInDays: Number(dueInDays),
            })
          : await createInvoiceFromProject(projectId, {
              installmentId: presetId || undefined,
              amount: Number(amount),
              dueInDays: Number(dueInDays),
            });
        close();
        router.push(`/invoices/${res.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't raise the invoice");
      }
    });
  }

  const amountValid = amount !== "" && Number.isFinite(Number(amount)) && Number(amount) > 0;

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Receipt size={13} strokeWidth={1.5} />
        Raise invoice
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-bitumen/85 backdrop-blur-sm overflow-y-auto"
          onClick={close}
        >
          <div
            className="w-full max-w-[520px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-16"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <Receipt size={14} strokeWidth={1.5} className="text-track-gold" />
                <Label gold>Raise invoice</Label>
              </div>
              <button onClick={close} className="text-bone-mute hover:text-bone">
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>

            <div className="px-6 py-6 flex flex-col gap-5">
              <p className="text-[13px] text-bone-dim leading-relaxed">
                {manual
                  ? "Logs an invoice you already sent outside the tool — no document is generated. It records as sent and updates the ledger."
                  : "Raises a draft invoice for this project. Pick a planned installment to preset the amount, or enter a custom amount. It lands in the Invoices tab as a draft you can review and send."}
              </p>

              <label className="flex items-center gap-2 text-[12px] text-bone-dim cursor-pointer">
                <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} className="accent-track-gold" />
                I already sent this invoice manually (just log it)
              </label>

              {manual && (
                <div className="flex flex-col gap-2">
                  <Label>Sent date</Label>
                  <Input
                    type="date"
                    className="tabular-nums"
                    value={sentDate}
                    onChange={(e) => setSentDate(e.target.value)}
                  />
                  <span className="text-[11px] text-bone-mute">
                    When it actually went out — back-date it if you&apos;re logging it after the fact.
                  </span>
                </div>
              )}

              {presets.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Label>Installment</Label>
                  <Select value={presetId} onChange={(e) => choosePreset(e.target.value)}>
                    <option value="">Custom amount…</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} — {formatCAD(p.amount).replace("CA$", "$")}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Amount (CAD)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    className="tabular-nums"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      // Editing the amount detaches it from a preset.
                      if (presetId) setPresetId("");
                    }}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Due in (days)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={dueInDays}
                    onChange={(e) => setDueInDays(e.target.value)}
                  />
                </div>
              </div>

              <div className="bg-bitumen rounded-[var(--radius)] p-3 flex items-center justify-between">
                <Label>Unbilled on this project</Label>
                <span
                  className={`mono text-[14px] tabular-nums ${
                    remainingFee < 0 ? "text-flag-red" : "text-bone-dim"
                  }`}
                >
                  {formatCAD(remainingFee).replace("CA$", "$")}
                </span>
              </div>

              {error && (
                <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                  <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                  <span className="text-[12px] text-bone-dim">{error}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 flex justify-end gap-2">
              <Button variant="ghost" size="md" onClick={close}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={submit}
                disabled={isPending || !amountValid}
              >
                {isPending ? "Saving…" : manual ? "Log manual invoice" : "Raise draft invoice"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
