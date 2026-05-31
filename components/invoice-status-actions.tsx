"use client";

import { useState, useTransition } from "react";
import { Send, Check, ShieldAlert, FileOutput } from "lucide-react";
import { Button } from "@/components/ui";
import { markInvoiceSent, markInvoicePaid } from "@/app/(app)/invoices/[id]/actions";
import { generateInvoice } from "@/app/(app)/projects/[id]/billing-actions";

type Status = "draft" | "sent" | "paid" | "overdue";

export function InvoiceStatusActions({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: Status;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      }
    });
  }

  return (
    <>
      {status === "draft" && (
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={isPending}
            onClick={() => run(() => markInvoiceSent(invoiceId))}
          >
            <Send size={13} strokeWidth={1.5} />
            {isPending ? "Sending…" : "Send as-is"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={isPending}
            onClick={() => run(() => generateInvoice(invoiceId))}
          >
            <FileOutput size={13} strokeWidth={1.5} />
            {isPending ? "Generating…" : "Generate invoice"}
          </Button>
        </>
      )}
      {(status === "sent" || status === "overdue") && (
        <Button
          variant={status === "overdue" ? "danger" : "primary"}
          size="sm"
          disabled={isPending}
          onClick={() => run(() => markInvoicePaid(invoiceId))}
        >
          <Check size={13} strokeWidth={1.5} />
          {isPending ? "Marking…" : "Mark paid"}
        </Button>
      )}
      {error && (
        <span className="flex items-center gap-1.5 text-[11px] text-flag-red">
          <ShieldAlert size={11} strokeWidth={1.5} />
          {error}
        </span>
      )}
    </>
  );
}
