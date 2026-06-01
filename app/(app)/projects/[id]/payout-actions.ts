"use server";

// Consultant payout ledger actions — recompute what's owed per stage, edit the
// actual amount, and mark a payout paid / confirmed. Marking paid stamps
// whether the client invoice for that stage was already paid (clientPaidFirst)
// and warns (never blocks) when we're fronting money. Canonical recipe: auth →
// validate → mutate + writeAudit in a $transaction → revalidate.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { notifyPartner } from "@/lib/messaging";
import { recomputePayoutsTx } from "@/lib/billing/payouts";
import type { PayoutMethod } from "@/lib/generated/prisma/enums";

async function getActor() {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  return {
    partnerId: session.user.partnerId,
    label: session.user.name ?? session.user.email ?? "Unknown",
    actor: partnerActor(session.user.partnerId, session.user.name ?? session.user.email ?? "Unknown"),
  };
}

const VALID_METHODS: PayoutMethod[] = ["etransfer", "wire", "cheque", "other"];

// Recompute the whole project's payout ledger from current economics + schedule.
export async function recomputeAllPayouts(projectId: string) {
  const { actor } = await getActor();
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new Error("Project not found");

  const result = await prisma.$transaction(async (tx) => {
    const r = await recomputePayoutsTx(tx, projectId);
    await writeAudit(tx, {
      actor,
      action: "recompute.payouts",
      targetType: "Project",
      targetId: projectId,
      changes: r,
    });
    return r;
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/invoices");
  return result;
}

export async function updatePayout(payoutId: string, input: { amount?: number; notes?: string | null }) {
  const { actor } = await getActor();

  const before = await prisma.consultantPayout.findUnique({
    where: { id: payoutId },
    select: { id: true, projectId: true, amount: true },
  });
  if (!before) throw new Error("Payout not found");

  const data: { amount?: number; notes?: string | null } = {};
  if (input.amount !== undefined) {
    const amount = Math.round(Number(input.amount));
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid amount (≥ 0)");
    data.amount = amount;
  }
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

  await prisma.$transaction(async (tx) => {
    await tx.consultantPayout.update({ where: { id: payoutId }, data });
    await writeAudit(tx, {
      actor,
      action: "update.payout",
      targetType: "ConsultantPayout",
      targetId: payoutId,
      changes: { amount: data.amount !== undefined ? { before: before.amount, after: data.amount } : undefined },
    });
  });

  revalidatePath(`/projects/${before.projectId}`);
  revalidatePath("/invoices");
  return { id: payoutId };
}

export async function markPayoutPaid(payoutId: string, input: { method: string; paidAt?: string }) {
  const { actor, partnerId, label } = await getActor();

  const payout = await prisma.consultantPayout.findUnique({
    where: { id: payoutId },
    select: {
      id: true,
      projectId: true,
      status: true,
      consultant: { select: { name: true } },
      installment: { select: { label: true, invoice: { select: { status: true } } } },
      project: { select: { name: true, partnerLeadId: true } },
    },
  });
  if (!payout) throw new Error("Payout not found");
  if (payout.status === "paid" || payout.status === "confirmed") {
    throw new Error("This payout is already marked paid");
  }

  const method = VALID_METHODS.includes(input.method as PayoutMethod) ? (input.method as PayoutMethod) : "etransfer";
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw new Error("Enter a valid paid date");

  // Did the client pay this stage's invoice first? (warn-only)
  const clientPaidFirst = payout.installment.invoice?.status === "paid";

  await prisma.$transaction(async (tx) => {
    await tx.consultantPayout.update({
      where: { id: payoutId },
      data: { status: "paid", method, paidAt, clientPaidFirst },
    });
    await writeAudit(tx, {
      actor,
      action: "pay.payout",
      targetType: "ConsultantPayout",
      targetId: payoutId,
      changes: { status: { before: payout.status, after: "paid" }, method, clientPaidFirst },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: payout.project.name,
      detail: `Paid ${payout.consultant.name} — ${payout.installment.label}${clientPaidFirst ? "" : " (before client paid)"}`,
      link: `/projects/${payout.projectId}`,
    });

    // Fronting money — notify the project lead (unless they did it).
    if (!clientPaidFirst && payout.project.partnerLeadId !== partnerId) {
      await notifyPartner(
        tx,
        payout.project.partnerLeadId,
        "approval_needed",
        `${label} paid ${payout.consultant.name} on ${payout.project.name} before the client paid that stage`,
        { link: `/projects/${payout.projectId}` },
      );
    }
  });

  revalidatePath(`/projects/${payout.projectId}`);
  revalidatePath("/invoices");
  return { status: "paid" as const, clientPaidFirst };
}

export async function markPayoutConfirmed(payoutId: string) {
  const { actor } = await getActor();

  const before = await prisma.consultantPayout.findUnique({
    where: { id: payoutId },
    select: { id: true, projectId: true, status: true },
  });
  if (!before) throw new Error("Payout not found");
  if (before.status !== "paid") throw new Error("Mark the payout paid before confirming receipt");

  await prisma.$transaction(async (tx) => {
    await tx.consultantPayout.update({ where: { id: payoutId }, data: { status: "confirmed", confirmedAt: new Date() } });
    await writeAudit(tx, {
      actor,
      action: "confirm.payout",
      targetType: "ConsultantPayout",
      targetId: payoutId,
      changes: { status: { before: before.status, after: "confirmed" } },
    });
  });

  revalidatePath(`/projects/${before.projectId}`);
  revalidatePath("/invoices");
  return { status: "confirmed" as const };
}
