"use server";

// Consultant roster CRUD — the firm's pay rate card. A Consultant is someone
// we PAY on projects (team member or external sub-consultant), not a login.
//
// Canonical recipe: auth → validate → mutate + writeAudit in a $transaction →
// revalidate. Rates come in as DOLLARS from the UI and are stored as cents.

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

function dollarsToCents(raw: number): number {
  const cents = Math.round(Number(raw) * 100);
  if (!Number.isFinite(cents) || cents < 0) throw new Error("Enter a valid pay rate (≥ 0)");
  return cents;
}

export async function createConsultant(input: {
  name: string;
  role: string;
  payRate: number; // dollars/hr
  email?: string;
  partnerId?: string | null;
}) {
  const { actor } = await getActor();

  const name = input.name?.trim();
  if (!name) throw new Error("Consultant name is required");
  const role = input.role?.trim() || "Consultant";
  const defaultPayRateCents = dollarsToCents(input.payRate);
  const email = input.email?.trim() || null;
  const partnerId = input.partnerId?.trim() || null;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.consultant.create({
      data: { name, role, defaultPayRateCents, email, partnerId },
    });
    await writeAudit(tx, {
      actor,
      action: "create.consultant",
      targetType: "Consultant",
      targetId: row.id,
      changes: { name, role, defaultPayRateCents, email, partnerId },
    });
    return row;
  });

  revalidatePath("/consultants");
  return { id: created.id };
}

export async function updateConsultant(
  consultantId: string,
  input: { name?: string; role?: string; payRate?: number; email?: string | null; active?: boolean; partnerId?: string | null },
) {
  const { actor } = await getActor();

  const before = await prisma.consultant.findUnique({
    where: { id: consultantId },
    select: { id: true, name: true, role: true, defaultPayRateCents: true, email: true, active: true, partnerId: true },
  });
  if (!before) throw new Error("Consultant not found");

  const data: {
    name?: string;
    role?: string;
    defaultPayRateCents?: number;
    email?: string | null;
    active?: boolean;
    partnerId?: string | null;
  } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Consultant name is required");
    data.name = name;
  }
  if (input.role !== undefined) data.role = input.role.trim() || "Consultant";
  if (input.payRate !== undefined) data.defaultPayRateCents = dollarsToCents(input.payRate);
  if (input.email !== undefined) data.email = input.email?.trim() || null;
  if (input.active !== undefined) data.active = input.active;
  if (input.partnerId !== undefined) data.partnerId = input.partnerId?.trim() || null;

  await prisma.$transaction(async (tx) => {
    await tx.consultant.update({ where: { id: consultantId }, data });
    await writeAudit(tx, {
      actor,
      action: "update.consultant",
      targetType: "Consultant",
      targetId: consultantId,
      changes: {
        name: data.name !== undefined ? { before: before.name, after: data.name } : undefined,
        role: data.role !== undefined ? { before: before.role, after: data.role } : undefined,
        payRateCents: data.defaultPayRateCents !== undefined ? { before: before.defaultPayRateCents, after: data.defaultPayRateCents } : undefined,
        active: data.active !== undefined ? { before: before.active, after: data.active } : undefined,
      },
    });
  });

  revalidatePath("/consultants");
  return { id: consultantId };
}

// Soft delete — keep the row (payouts/economics may reference it) but drop it
// from active rosters.
export async function deactivateConsultant(consultantId: string) {
  return updateConsultant(consultantId, { active: false });
}
