"use server";

// Phase 2 — the firm cash-on-hand anchor. ONE MP-gated action to set/update the
// opening bank balance the cash strip carries forward (rebuild §3.1; v1 = one firm
// balance). Append-only: a new anchor deactivates the prior one (history kept), so
// the live balance is always the most recent active row. Writes one AuditLog (+ a
// figure-free Activity) in the same transaction — no firm-money figure reaches the
// all-partner feed.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor, type Actor } from "@/lib/audit";
import { requireManagingPartner } from "@/lib/permissions";

async function getActor(): Promise<{ actor: Actor; label: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const label = session.user.name ?? session.user.email ?? "Unknown";
  return { actor: partnerActor(session.user.partnerId, label), label };
}

export type SetOpeningBalanceInput = {
  amount: number; // whole CAD (may be negative if overdrawn)
  asOf: string; // ISO date the balance is true as of
  label?: string | null;
  note?: string | null;
};

export async function setOpeningBalance(input: SetOpeningBalanceInput): Promise<{ ok: true; id: string }> {
  await requireManagingPartner();
  const { actor, label } = await getActor();

  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount)) throw new Error("Amount must be a number");
  const asOf = new Date(input.asOf);
  if (Number.isNaN(asOf.getTime())) throw new Error("As-of date is invalid");
  if (asOf.getTime() > Date.now() + 86_400_000) throw new Error("As-of date can't be in the future");

  const row = await prisma.$transaction(async (tx) => {
    // One active anchor: retire any current ones, then append the new live row.
    await tx.openingBalance.updateMany({ where: { active: true }, data: { active: false } });
    const created = await tx.openingBalance.create({
      data: {
        amount,
        asOf,
        label: input.label?.trim() || null,
        note: input.note?.trim() || null,
        active: true,
        enteredBy: label,
      },
    });
    await writeAudit(tx, {
      actor,
      action: "update.opening_balance",
      targetType: "OpeningBalance",
      targetId: created.id,
      changes: { amount, asOf: asOf.toISOString(), label: input.label ?? null },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: "Financials",
      detail: "Updated the firm cash-on-hand anchor",
      link: "/financials",
    });
    return created;
  });

  revalidatePath("/financials");
  return { ok: true, id: row.id };
}
