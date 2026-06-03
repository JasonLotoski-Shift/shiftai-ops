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
import { draftSegment, type CurrentSegmentValues, type DraftResult } from "@/lib/segment-drafter";

// The chip/row builder passes arrays directly now. Trim each entry, drop
// blanks, and de-dupe so the stored String[] is clean.
function cleanTags(raw: string[] | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    const t = v.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

// Persona rows: keep only rows with both a department and a seniority.
function cleanPersonas(
  raw: { department: string; seniority: string }[] | undefined,
): { department: string; seniority: string }[] {
  if (!raw) return [];
  return raw
    .map((p) => ({ department: (p.department ?? "").trim(), seniority: (p.seniority ?? "").trim() }))
    .filter((p) => p.department && p.seniority);
}

// Anchor rows: keep rows with a name; blank domain → undefined.
function cleanAnchors(
  raw: { name: string; domain?: string }[] | undefined,
): { name: string; domain?: string }[] {
  if (!raw) return [];
  return raw
    .map((a) => {
      const name = (a.name ?? "").trim();
      const domain = (a.domain ?? "").trim();
      return domain ? { name, domain } : { name };
    })
    .filter((a) => a.name);
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
  /** Chip/row builder passes arrays — cleaned (trim + dedupe) server-side. */
  industries: string[];
  geographies: string[];
  buyingSignals: string[];
  disqualifiers: string[];
  personas: { department: string; seniority: string }[];
  anchors: { name: string; domain?: string }[];
  /** Starred geography — coerced to null if not present in geographies. */
  priorityLocation?: string | null;
  revenueMin?: string | number | null;
  revenueMax?: string | number | null;
  employeeMin?: string | number | null;
  employeeMax?: string | number | null;
};

function dataFromInput(input: TargetSegmentInput) {
  const geographies = cleanTags(input.geographies);
  const priorityRaw = (input.priorityLocation ?? "").trim();
  // Invariant: priorityLocation must be one of the selected geographies.
  const priorityLocation = priorityRaw && geographies.includes(priorityRaw) ? priorityRaw : null;

  return {
    name: input.name.trim(),
    description: input.description.trim(),
    priority: parseBound(input.priority) ?? 0,
    industries: cleanTags(input.industries),
    geographies,
    buyingSignals: cleanTags(input.buyingSignals),
    disqualifiers: cleanTags(input.disqualifiers),
    personas: cleanPersonas(input.personas),
    anchors: cleanAnchors(input.anchors),
    priorityLocation,
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

// ── Draft with Claude ────────────────────────────────────────────────────────
// Thin wrapper around draftSegment — keeps ANTHROPIC_API_KEY server-side. The
// draft is ephemeral: NO DB write, NO audit, NO revalidate. Persistence happens
// only when the partner clicks Save (createSegment/updateSegment), which audits.
export async function draftSegmentAction(input: {
  name: string;
  brief: string;
  current?: CurrentSegmentValues;
}): Promise<DraftResult> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  return draftSegment(input);
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
