"use server";

// Targeting server actions (Lead Agent — Phase A).
//
// A TargetSegment is an editable ideal-customer spec the Lead Agent hunts
// against — partners build, tune, toggle, and delete them here. Plain CRUD.
// Each mutation follows the canonical recipe: write + writeAudit in one
// transaction, then revalidate. Defining/changing a segment is feed-worthy,
// so it also writes an Activity row in the same transaction.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";

// One value per line — strip leading bullets/numbers, trim, drop blanks.
// (Same pattern as splitTasks in agents/actions.ts.)
function splitLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.replace(/^[-*•\d.\s]+/, "").trim())
    .filter(Boolean);
}

// UI passes number bounds as strings (or empty). Coerce to int or null —
// empty/NaN must become null, never 0.
function parseBound(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

export type TargetSegmentInput = {
  name: string;
  description: string;
  active?: boolean;
  priority?: string | number | null;
  /** One value per line — split + trimmed server-side. */
  industries: string;
  geographies: string;
  buyerPersonas: string;
  buyingSignals: string;
  disqualifiers: string;
  anchorCompanies: string;
  revenueMin?: string | number | null;
  revenueMax?: string | number | null;
  employeeMin?: string | number | null;
  employeeMax?: string | number | null;
};

function dataFromInput(input: TargetSegmentInput) {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    priority: parseBound(input.priority) ?? 0,
    industries: splitLines(input.industries),
    geographies: splitLines(input.geographies),
    buyerPersonas: splitLines(input.buyerPersonas),
    buyingSignals: splitLines(input.buyingSignals),
    disqualifiers: splitLines(input.disqualifiers),
    anchorCompanies: splitLines(input.anchorCompanies),
    revenueMin: parseBound(input.revenueMin),
    revenueMax: parseBound(input.revenueMax),
    employeeMin: parseBound(input.employeeMin),
    employeeMax: parseBound(input.employeeMax),
  };
}

export async function createSegment(input: TargetSegmentInput) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const data = dataFromInput(input);
  if (!data.name) throw new Error("Name is required");
  if (!data.description) throw new Error("Description is required");

  const segment = await prisma.$transaction(async (tx) => {
    const created = await tx.targetSegment.create({
      data: {
        ...data,
        active: input.active ?? true,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.targetSegment",
      targetType: "TargetSegment",
      targetId: created.id,
      changes: { name: data.name, industries: data.industries, priority: data.priority },
    });

    await writeActivity(tx, {
      actor,
      type: "ai",
      target: data.name,
      detail: `Defined a target segment — ${data.name}`,
      link: "/targeting",
    });

    return created;
  });

  revalidatePath("/targeting");
  return { id: segment.id };
}

export async function updateSegment(id: string, input: TargetSegmentInput) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const data = dataFromInput(input);
  if (!data.name) throw new Error("Name is required");
  if (!data.description) throw new Error("Description is required");

  const existing = await prisma.targetSegment.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new Error("Target segment not found");

  await prisma.$transaction(async (tx) => {
    await tx.targetSegment.update({
      where: { id },
      data: {
        ...data,
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });

    await writeAudit(tx, {
      actor,
      action: "update.targetSegment",
      targetType: "TargetSegment",
      targetId: id,
      changes: { name: data.name, industries: data.industries, priority: data.priority },
    });

    await writeActivity(tx, {
      actor,
      type: "ai",
      target: data.name,
      detail: `Updated target segment — ${data.name}`,
      link: "/targeting",
    });
  });

  revalidatePath("/targeting");
  return { id };
}

export async function toggleSegmentActive(id: string, active: boolean) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const segment = await prisma.targetSegment.findUnique({ where: { id }, select: { name: true } });
  if (!segment) throw new Error("Target segment not found");

  await prisma.$transaction(async (tx) => {
    await tx.targetSegment.update({ where: { id }, data: { active } });

    await writeAudit(tx, {
      actor,
      action: "update.targetSegment.active",
      targetType: "TargetSegment",
      targetId: id,
      changes: { active },
    });

    await writeActivity(tx, {
      actor,
      type: "ai",
      target: segment.name,
      detail: `Target segment ${segment.name} ${active ? "activated" : "paused"}`,
      link: "/targeting",
    });
  });

  revalidatePath("/targeting");
  return { id, active };
}

export async function deleteSegment(id: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const segment = await prisma.targetSegment.findUnique({ where: { id }, select: { name: true } });
  if (!segment) throw new Error("Target segment not found");

  await prisma.$transaction(async (tx) => {
    await tx.targetSegment.delete({ where: { id } });

    await writeAudit(tx, {
      actor,
      action: "delete.targetSegment",
      targetType: "TargetSegment",
      targetId: id,
      changes: { name: segment.name },
    });
  });

  revalidatePath("/targeting");
  return { id };
}
