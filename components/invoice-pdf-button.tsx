"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui";
import { generateInvoicePdf } from "@/app/(app)/invoices/[id]/actions";

// Generates the invoice PDF (deterministic render from the Invoice record),
// files it to the client's Drive folder, and opens it. Works on any status.
export function InvoicePdfButton({ invoiceId }: { invoiceId: string }) {
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      title={err ?? "Generate the invoice PDF and file it to Drive"}
      onClick={() => {
        setErr(null);
        start(async () => {
          try {
            const { driveUrl } = await generateInvoicePdf(invoiceId);
            window.open(driveUrl, "_blank", "noopener");
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed to generate the PDF");
          }
        });
      }}
    >
      <Download size={13} strokeWidth={1.5} />
      {busy ? "Generating…" : "PDF"}
    </Button>
  );
}
