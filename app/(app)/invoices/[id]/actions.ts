"use server";

// Invoice-status mutations. Two named actions so each has its own audit
// verb + its own valid-from-state guard. Add more (markOverdue, revert
// drafts, etc.) when partner workflows ask for them.
//
// Canonical mutation recipe (see app/(app)/dashboard/actions.ts header).

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";

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

export async function markInvoiceSent(invoiceId: string) {
  const { actor } = await getActor();

  const before = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true },
  });
  if (!before) throw new Error("Invoice not found");
  if (before.status !== "draft") {
    throw new Error(`Can't send invoice from status "${before.status}" (must be draft)`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "sent" },
    });
    await writeAudit(tx, {
      actor,
      action: "update.invoice.sent",
      targetType: "Invoice",
      targetId: invoiceId,
      changes: { status: { before: "draft", after: "sent" } },
    });
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { status: "sent" as const };
}

export async function markInvoicePaid(invoiceId: string) {
  const { actor } = await getActor();

  const before = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, paidAt: true },
  });
  if (!before) throw new Error("Invoice not found");
  if (before.status !== "sent" && before.status !== "overdue") {
    throw new Error(`Can't mark paid from status "${before.status}" (must be sent or overdue)`);
  }

  const paidAt = new Date();

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
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { status: "paid" as const, paidAt };
}
