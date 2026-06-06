"use server";

// Invoice-status mutations. Two named actions so each has its own audit
// verb + its own valid-from-state guard. Add more (markOverdue, revert
// drafts, etc.) when partner workflows ask for them.
//
// Canonical mutation recipe (see app/(app)/dashboard/actions.ts header).

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";

async function getActor() {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  return {
    actor: partnerActor(
      session.user.partnerId,
      session.user.name ?? session.user.email ?? "Unknown",
    ),
  };
}

// Mark a draft sent. `sentDate` (YYYY-MM-DD) is optional — pass it to back-date
// the send (an invoice emailed last week, logged today); omit for "now". The
// date is stored on Invoice.sentAt so the ledger reflects the real send date.
export async function markInvoiceSent(invoiceId: string, sentDate?: string | null) {
  const { actor } = await getActor();

  const before = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, number: true },
  });
  if (!before) throw new Error("Invoice not found");
  if (before.status !== "draft") {
    throw new Error(`Can't send invoice from status "${before.status}" (must be draft)`);
  }

  const sentAt = sentDate ? new Date(sentDate) : new Date();
  if (Number.isNaN(sentAt.getTime())) throw new Error("Enter a valid sent date");

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "sent", sentAt },
    });
    await writeAudit(tx, {
      actor,
      action: "update.invoice.sent",
      targetType: "Invoice",
      targetId: invoiceId,
      changes: { status: { before: "draft", after: "sent" }, sentAt: sentAt.toISOString() },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: `Invoice ${before.number}`,
      detail: "Marked sent",
      link: `/invoices/${invoiceId}`,
    });
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { status: "sent" as const };
}

// Mark a sent/overdue invoice paid. `paidDate` (YYYY-MM-DD) is optional —
// pass it to record the real payment date (a cheque that cleared Tuesday,
// logged Friday); omit for "now".
export async function markInvoicePaid(invoiceId: string, paidDate?: string | null) {
  const { actor } = await getActor();

  const before = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, paidAt: true, number: true },
  });
  if (!before) throw new Error("Invoice not found");
  if (before.status !== "sent" && before.status !== "overdue") {
    throw new Error(`Can't mark paid from status "${before.status}" (must be sent or overdue)`);
  }

  const paidAt = paidDate ? new Date(paidDate) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw new Error("Enter a valid paid date");

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "paid", paidAt },
    });
    await writeAudit(tx, {
      actor,
      action: "update.invoice.paid",
      targetType: "Invoice",
      targetId: invoiceId,
      changes: {
        status: { before: before.status, after: "paid" },
        paidAt: paidAt.toISOString(),
      },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: `Invoice ${before.number}`,
      detail: "Marked paid",
      link: `/invoices/${invoiceId}`,
    });
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { status: "paid" as const, paidAt };
}
