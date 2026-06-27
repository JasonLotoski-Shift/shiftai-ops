// Match an AR email (a payment / remittance) to the invoice the firm already
// issued, so reconciliation MARKS AN EXISTING invoice paid instead of creating a
// second AR record. Server-only (Prisma). Used by the Gmail finance-label poll
// (to show the suggested match in the review) and by reconcileInvoiceFromProposal
// (to re-verify at click time — the stored match can go stale between poll runs).

import { prisma } from "@/lib/prisma";

export type InvoiceMatch = { id: string; number: string; amount: number };

/**
 * The single outstanding (sent | overdue) invoice an AR email most likely refers
 * to. Strongest signal first: the firm's invoice number (globally unique on
 * Invoice). Falls back to client + amount (matching either subtotal or total).
 * Returns null when nothing matches OR the match is ambiguous (>1 candidate) —
 * the caller treats null as "reconcile manually" and never books a new record.
 */
export async function matchOutstandingInvoice(input: {
  clientId?: string | null;
  invoiceNumber?: string | null;
  amount?: number | null;
}): Promise<InvoiceMatch | null> {
  const num = input.invoiceNumber?.trim();
  if (num) {
    const byNumber = await prisma.invoice.findFirst({
      where: { status: { in: ["sent", "overdue"] }, number: { equals: num, mode: "insensitive" } },
      select: { id: true, number: true, amount: true },
    });
    if (byNumber) return byNumber;
  }

  const amt =
    typeof input.amount === "number" && Number.isFinite(input.amount) ? Math.round(input.amount) : null;
  if (input.clientId && amt && amt > 0) {
    const byAmount = await prisma.invoice.findMany({
      where: {
        status: { in: ["sent", "overdue"] },
        clientId: input.clientId,
        OR: [{ amount: amt }, { total: amt }],
      },
      select: { id: true, number: true, amount: true },
      take: 2, // one hit = confident; two = ambiguous, bail to manual
    });
    if (byAmount.length === 1) return byAmount[0];
  }

  return null;
}
