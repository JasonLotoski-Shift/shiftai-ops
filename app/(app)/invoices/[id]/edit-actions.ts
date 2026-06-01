"use server";

// Inline invoice field edits — partner corrections to a DRAFT invoice. Each
// change is audited (before/after) so it shows in the invoice change thread.
// amount/dueAt are only editable while the invoice is still a draft (mirrors
// the installment edit guard — once sent, the number is committed).

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";

export async function updateInvoiceFields(
  invoiceId: string,
  input: { amount?: number; dueAt?: string },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(session.user.partnerId, session.user.name ?? session.user.email ?? "Unknown");

  const before = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, amount: true, dueAt: true, projectId: true },
  });
  if (!before) throw new Error("Invoice not found");
  if (before.status !== "draft") {
    throw new Error("Only a draft invoice can be edited — this one is already sent");
  }

  const data: { amount?: number; dueAt?: Date } = {};
  const changes: Record<string, { before: unknown; after: unknown }> = {};

  if (input.amount !== undefined) {
    const amount = Math.round(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount (> 0)");
    if (amount !== before.amount) {
      data.amount = amount;
      changes.amount = { before: before.amount, after: amount };
    }
  }
  if (input.dueAt !== undefined) {
    const dueAt = new Date(input.dueAt);
    if (Number.isNaN(dueAt.getTime())) throw new Error("Enter a valid due date");
    if (dueAt.getTime() !== new Date(before.dueAt).getTime()) {
      data.dueAt = dueAt;
      changes.dueAt = { before: new Date(before.dueAt).toISOString().slice(0, 10), after: dueAt.toISOString().slice(0, 10) };
    }
  }

  if (Object.keys(data).length === 0) return { id: invoiceId };

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id: invoiceId }, data });
    await writeAudit(tx, {
      actor,
      action: "update.invoice.fields",
      targetType: "Invoice",
      targetId: invoiceId,
      changes,
    });
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  if (before.projectId) revalidatePath(`/projects/${before.projectId}`);
  return { id: invoiceId };
}
