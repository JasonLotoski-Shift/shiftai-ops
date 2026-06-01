"use client";

// Inline edit for a DRAFT invoice's amount + due date. Every save is audited
// (before/after) and shows up in the invoice change thread. Hidden once the
// invoice is sent.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { Input, Button } from "@/components/ui";
import { formatCAD } from "@/lib/format";
import { updateInvoiceFields } from "@/app/(app)/invoices/[id]/edit-actions";

export function InvoiceDraftEdit({
  invoiceId,
  amount,
  dueAt,
}: {
  invoiceId: string;
  amount: number;
  dueAt: string; // ISO
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [amt, setAmt] = useState(String(amount));
  const [due, setDue] = useState(dueAt.slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateInvoiceFields(invoiceId, { amount: Number(amt || 0), dueAt: due });
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-[12px] text-bone-mute hover:text-track-gold">
        <Pencil size={12} strokeWidth={1.5} />
        Edit amount / due
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="label text-[10px]">Amount</span>
          <Input type="number" min={1} value={amt} autoFocus onChange={(e) => setAmt(e.target.value)} className="h-8 text-[13px] w-[140px]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label text-[10px]">Due</span>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 text-[13px] w-[150px]" />
        </label>
        <Button size="sm" onClick={save} disabled={isPending}>
          <Check size={13} strokeWidth={1.5} />
          Save
        </Button>
        <button onClick={() => setEditing(false)} disabled={isPending} className="text-bone-mute hover:text-bone h-8 px-2">
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
      <span className="text-[11px] text-bone-mute">Current: {formatCAD(amount).replace("CA$", "$")}</span>
      {error && <span className="text-[11px] text-flag-red">{error}</span>}
    </div>
  );
}
