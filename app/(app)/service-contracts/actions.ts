"use server";

// On-going service-contract mutations. Firm money — managing-partner gated.
// Canonical recipe: mutate + writeAudit in one $transaction, then revalidate.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";
import { requireManagingPartner } from "@/lib/permissions";

async function getActor() {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  await requireManagingPartner();
  return partnerActor(session.user.partnerId, session.user.name ?? session.user.email ?? "Unknown");
}

/** Mark one month's recurring commission payout paid (unified CommissionPayout). */
export async function markRecurringCommissionPaid(payoutId: string) {
  const actor = await getActor();
  const payout = await prisma.commissionPayout.findUnique({
    where: { id: payoutId },
    select: {
      id: true,
      stream: true,
      amount: true,
      periodIndex: true,
      commissionLine: { select: { projectId: true } },
    },
  });
  if (!payout) throw new Error("Commission payout not found");
  if (payout.stream !== "recurring") throw new Error("Not a recurring payout");

  const projectId = payout.commissionLine.projectId;
  const contract = projectId
    ? await prisma.serviceContract.findUnique({ where: { projectId }, select: { id: true } })
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.commissionPayout.update({
      where: { id: payoutId },
      data: { status: "paid", paidAt: new Date() },
    });
    await writeAudit(tx, {
      actor,
      action: "update.commissionPayout.paid",
      targetType: "CommissionPayout",
      targetId: payoutId,
      changes: { stream: "recurring", periodIndex: payout.periodIndex, amount: payout.amount, projectId },
    });
  });

  if (contract) revalidatePath(`/service-contracts/${contract.id}`);
  revalidatePath("/service-contracts");
  revalidatePath("/financials");
  return { ok: true as const };
}
