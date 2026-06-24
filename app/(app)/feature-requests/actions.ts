"use server";

// Feature Requests & Fixes — server actions.
//
// The in-tool feedback board. Any authenticated partner can create an item AND
// move its status (firm decision: lightweight, everyone owns the board — no
// managing-partner gate). Follows the canonical mutation recipe: every write
// runs in a $transaction with writeAudit + revalidatePath. No Activity-feed row
// (this is meta/tool feedback, not firm activity).

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor, type Actor } from "@/lib/audit";
import { isValidArea, isValidSubTab, subTabsFor } from "@/lib/feature-area-taxonomy";
import type { FeatureRequestStatus, FeatureRequestType } from "@/lib/generated/prisma/enums";

const VALID_TYPES: FeatureRequestType[] = ["bug", "feature", "improvement", "broken"];
const VALID_STATUSES: FeatureRequestStatus[] = ["open", "in_progress", "done", "declined"];

async function requirePartner(): Promise<{ partnerId: string; actor: Actor }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerId = session.user.partnerId;
  return {
    partnerId,
    actor: partnerActor(partnerId, session.user.name ?? session.user.email ?? "Unknown"),
  };
}

// Validate the area key + (optional) sub-tab against the taxonomy constant, and
// normalise the sub-tab: a tab with no sub-tabs always stores null; a tab with
// sub-tabs stores the chosen one (or null when "the whole tab").
function resolveArea(areaTab: string, areaSubTab?: string | null): { areaTab: string; areaSubTab: string | null } {
  if (!isValidArea(areaTab)) throw new Error(`Unknown area: ${areaTab}`);
  const sub = areaSubTab?.trim() || null;
  if (sub && subTabsFor(areaTab).length === 0) {
    // A sub-tab was sent for a tab that has none — drop it rather than fail.
    return { areaTab, areaSubTab: null };
  }
  if (!isValidSubTab(areaTab, sub)) throw new Error(`"${sub}" is not a section of that tab`);
  return { areaTab, areaSubTab: sub };
}

/**
 * File a new feature request / fix. Open to every authenticated partner. The
 * submitter is taken from the session (not a form field). Status defaults to
 * "open".
 */
export async function createFeatureRequest(input: {
  title: string;
  description: string;
  type: string;
  areaTab: string;
  areaSubTab?: string | null;
}) {
  const { partnerId, actor } = await requirePartner();

  const title = input.title.trim();
  if (!title) throw new Error("A title is required");
  const description = input.description.trim();
  if (!description) throw new Error("A description is required");
  if (!VALID_TYPES.includes(input.type as FeatureRequestType)) {
    throw new Error(`Invalid type: ${input.type}`);
  }
  const { areaTab, areaSubTab } = resolveArea(input.areaTab, input.areaSubTab);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.featureRequest.create({
      data: {
        title,
        description,
        type: input.type as FeatureRequestType,
        areaTab,
        areaSubTab,
        createdById: partnerId,
      },
    });
    await writeAudit(tx, {
      actor,
      action: "create.featureRequest",
      targetType: "FeatureRequest",
      targetId: row.id,
      changes: { title, type: input.type, areaTab, areaSubTab },
    });
    return row;
  });

  revalidatePath("/feature-requests");
  return { id: created.id };
}

/**
 * Move an item across the board's columns. Open to every authenticated partner.
 */
export async function updateFeatureRequestStatus(id: string, status: string) {
  const { actor } = await requirePartner();
  if (!VALID_STATUSES.includes(status as FeatureRequestStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const before = await prisma.featureRequest.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!before) throw new Error("Request not found");
  if (before.status === status) return { ok: true as const };

  await prisma.$transaction(async (tx) => {
    await tx.featureRequest.update({
      where: { id },
      data: { status: status as FeatureRequestStatus },
    });
    await writeAudit(tx, {
      actor,
      action: "update.featureRequest.status",
      targetType: "FeatureRequest",
      targetId: id,
      changes: { status: { before: before.status, after: status } },
    });
  });

  revalidatePath("/feature-requests");
  return { ok: true as const };
}

/**
 * Edit an item's content (title / description / type / area). Open to every
 * authenticated partner. Only the provided fields change.
 */
export async function updateFeatureRequest(
  id: string,
  input: {
    title?: string;
    description?: string;
    type?: string;
    areaTab?: string;
    areaSubTab?: string | null;
  },
) {
  const { actor } = await requirePartner();

  const before = await prisma.featureRequest.findUnique({
    where: { id },
    select: { id: true, areaTab: true },
  });
  if (!before) throw new Error("Request not found");

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new Error("A title is required");
    data.title = t;
  }
  if (input.description !== undefined) {
    const d = input.description.trim();
    if (!d) throw new Error("A description is required");
    data.description = d;
  }
  if (input.type !== undefined) {
    if (!VALID_TYPES.includes(input.type as FeatureRequestType)) throw new Error(`Invalid type: ${input.type}`);
    data.type = input.type as FeatureRequestType;
  }
  // Area + sub-tab travel together: if either is sent, re-resolve the pair
  // against the (possibly new) tab so a stale sub-tab can't survive a tab change.
  if (input.areaTab !== undefined || input.areaSubTab !== undefined) {
    const nextTab = input.areaTab ?? before.areaTab;
    const { areaTab, areaSubTab } = resolveArea(nextTab, input.areaSubTab);
    data.areaTab = areaTab;
    data.areaSubTab = areaSubTab;
  }

  if (Object.keys(data).length === 0) return { ok: true as const };

  await prisma.$transaction(async (tx) => {
    await tx.featureRequest.update({ where: { id }, data });
    await writeAudit(tx, {
      actor,
      action: "update.featureRequest",
      targetType: "FeatureRequest",
      targetId: id,
      changes: { fields: Object.keys(data) },
    });
  });

  revalidatePath("/feature-requests");
  return { ok: true as const };
}

/**
 * Delete an item. Open to every authenticated partner (audited). For mistakes
 * and dupes — a real "won't do" is better kept with the Declined status.
 */
export async function deleteFeatureRequest(id: string) {
  const { actor } = await requirePartner();

  const before = await prisma.featureRequest.findUnique({
    where: { id },
    select: { id: true, title: true },
  });
  if (!before) throw new Error("Request not found");

  await prisma.$transaction(async (tx) => {
    await tx.featureRequest.delete({ where: { id } });
    await writeAudit(tx, {
      actor,
      action: "delete.featureRequest",
      targetType: "FeatureRequest",
      targetId: id,
      changes: { title: before.title },
    });
  });

  revalidatePath("/feature-requests");
  return { ok: true as const };
}
