"use client";

// Invoice status actions with back-datable dates.
//
// "Send as-is" and "Mark paid" first reveal a small date field (defaulting to
// today) so a partner can record the REAL send / payment date — an invoice
// emailed last Tuesday but logged today, or a cheque that cleared days before
// it was entered. "Generate invoice" sends now (it produces the document).

import { useState, useTransition } from "react";
import { Send, Check, ShieldAlert, FileOutput, X } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { markInvoiceSent, markInvoicePaid } from "@/app/(app)/invoices/[id]/actions";
import { generateInvoice } from "@/app/(app)/projects/[id]/billing-actions";

type Status = "draft" | "sent" | "paid" | "overdue";

// Local YYYY-MM-DD (avoids the UTC shift toISOString would introduce).
function todayLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function InvoiceStatusActions({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: Status;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // null = showing the buttons; "send"/"paid" = showing the date confirm.
  const [picking, setPicking] = useState<null | "send" | "paid">(null);
  const [date, setDate] = useState(todayLocal());

  function run(fn: () => Promise<unknown>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      }
    });
  }

  if (picking) {
    const isSend = picking === "send";
    return (
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-7 text-[12px] w-[140px]"
          aria-label={isSend ? "Sent date" : "Paid date"}
        />
        <Button
          variant="primary"
          size="sm"
          disabled={isPending}
          onClick={() =>
            run(
              () => (isSend ? markInvoiceSent(invoiceId, date) : markInvoicePaid(invoiceId, date)),
              () => setPicking(null),
            )
          }
        >
          <Check size={13} strokeWidth={1.5} />
          {isPending ? "Saving…" : isSend ? "Confirm sent" : "Confirm paid"}
        </Button>
        <button
          onClick={() => {
            setPicking(null);
            setError(null);
          }}
          disabled={isPending}
          className="text-bone-mute hover:text-bone h-7 px-1"
          title="Cancel"
        >
          <X size={15} strokeWidth={1.5} />
        </button>
        {error && (
          <span className="flex items-center gap-1.5 text-[11px] text-flag-red">
            <ShieldAlert size={11} strokeWidth={1.5} />
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      {status === "draft" && (
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={isPending}
            onClick={() => {
              setDate(todayLocal());
              setPicking("send");
            }}
          >
            <Send size={13} strokeWidth={1.5} />
            Send as-is
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
          onClick={() => {
            setDate(todayLocal());
            setPicking("paid");
          }}
        >
          <Check size={13} strokeWidth={1.5} />
          Mark paid
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
