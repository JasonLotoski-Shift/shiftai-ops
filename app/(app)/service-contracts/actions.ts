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

/** Mark one month's recurring commission accrual paid. */
export async function markAccrualPaid(accrualId: string) {
  const actor = await getActor();
  const accrual = await prisma.ongoingContractCommissionAccrual.findUnique({
    where: { id: accrualId },
    include: { commission: { select: { contractId: true } } },
  });
  if (!accrual) throw new Error("Accrual not found");
  const contractId = accrual.commission.contractId;

  await prisma.$transaction(async (tx) => {
    await tx.ongoingContractCommissionAccrual.update({
      where: { id: accrualId },
      data: { status: "paid", paidAt: new Date() },
    });
    await writeAudit(tx, {
      actor,
      action: "update.commissionAccrual.paid",
      targetType: "OngoingContractCommissionAccrual",
      targetId: accrualId,
      changes: { periodIndex: accrual.periodIndex, amount: accrual.amount, contractId },
    });
  });

  revalidatePath(`/service-contracts/${contractId}`);
  revalidatePath("/service-contracts");
  return { ok: true as const };
}
