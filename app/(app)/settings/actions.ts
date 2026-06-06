"use server";

// Firm settings mutations. Today: the rate card (RateTier bill/pay rates) — the
// firm's standard tiers that seed every estimate + project economics line.
// Editing here is an explicit rate-card change, audited like any other write.
//
// Canonical mutation recipe (validate → actor → update + writeAudit in one
// $transaction → revalidate).

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";
import { requireManagingPartner } from "@/lib/permissions";

async function getActor() {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  // The rate card is firm economics — managing partners only (matches the
  // Settings page gating; guards direct calls that skip the hidden UI).
  await requireManagingPartner();
  return {
    actor: partnerActor(
      session.user.partnerId,
      session.user.name ?? session.user.email ?? "Unknown",
    ),
  };
}

function validCents(raw: number | undefined, label: string): number | undefined {
  if (raw === undefined) return undefined;
  const cents = Math.round(Number(raw));
  if (!Number.isFinite(cents) || cents < 0) throw new Error(`Enter a valid ${label} (≥ 0)`);
  return cents;
}

export async function updateRateTier(
  tierId: string,
  input: { billRateCents?: number; payRateCents?: number },
) {
  const { actor } = await getActor();

  const before = await prisma.rateTier.findUnique({
    where: { id: tierId },
    select: { id: true, name: true, billRateCents: true, payRateCents: true },
  });
  if (!before) throw new Error("Rate tier not found");

  const data: { billRateCents?: number; payRateCents?: number } = {};
  const bill = validCents(input.billRateCents, "bill rate");
  const pay = validCents(input.payRateCents, "pay rate");
  if (bill !== undefined) data.billRateCents = bill;
  if (pay !== undefined) data.payRateCents = pay;
  if (Object.keys(data).length === 0) return { ok: true as const };

  await prisma.$transaction(async (tx) => {
    await tx.rateTier.update({ where: { id: tierId }, data });
    await writeAudit(tx, {
      actor,
      action: "update.rateTier",
      targetType: "RateTier",
      targetId: tierId,
      changes: {
        billRateCents: data.billRateCents !== undefined ? { before: before.billRateCents, after: data.billRateCents } : undefined,
        payRateCents: data.payRateCents !== undefined ? { before: before.payRateCents, after: data.payRateCents } : undefined,
      },
    });
  });

  revalidatePath("/settings");
  revalidatePath("/financials");
  return { ok: true as const };
}
