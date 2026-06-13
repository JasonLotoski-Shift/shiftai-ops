"use server";

// ActionDraft — the saved step-1 of a two-step Quick Action.
//
// A two-step action (draft email, proposal, discovery report, SOW, discovery
// prep, book meeting, discovery questionnaire) generates an editable draft, then
// the partner reviews it and PROCEEDS to the finished deliverable (Drive +
// Artifact). "Save step 1" parks that editable draft in an ActionDraft row so
// the partner can finish later; the action box turns orange ("step 1 of 2
// saved") and reopens the editor preloaded.
//
// Canonical recipe: auth → validate → mutate + writeAudit in a $transaction →
// revalidate. There is ONE live draft per (entity, skill) — saveActionDraft
// UPSERTS (the table has no unique index, so we find-then-update/create) rather
// than piling a new row per save/auto-save.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";

// Exactly one FK is expected at write time — the loose-coupling convention the
// rest of the schema uses (Artifact, Task).
export type ActionDraftScope = {
  clientId?: string;
  dealId?: string;
  contactId?: string;
  projectId?: string;
};

export type ActionDraftRow = {
  id: string;
  skill: string;
  content: unknown;
  status: string;
  updatedAt: string; // ISO — Date doesn't survive the server→client boundary cleanly
};

async function getActor() {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const label = session.user.name ?? session.user.email ?? "Unknown";
  return { actor: partnerActor(session.user.partnerId, label), label };
}

// Normalize the scope to a single non-null FK; reject zero or multiple.
function resolveScope(scope: ActionDraftScope): {
  key: "clientId" | "dealId" | "contactId" | "projectId";
  id: string;
} {
  const entries = (["clientId", "dealId", "contactId", "projectId"] as const).filter(
    (k) => typeof scope[k] === "string" && scope[k]!.length > 0,
  );
  if (entries.length !== 1) {
    throw new Error("ActionDraft scope must set exactly one of clientId/dealId/contactId/projectId");
  }
  const key = entries[0];
  return { key, id: scope[key]! };
}

// The path to revalidate so the host page re-reads the draft state (orange box).
function scopePath(key: string, id: string): string | null {
  switch (key) {
    case "clientId":
      return `/clients/${id}`;
    case "dealId":
      return `/pipeline/${id}`;
    case "contactId":
      return `/contacts/${id}`;
    case "projectId":
      return `/projects/${id}`;
    default:
      return null;
  }
}

/** Read the live (latest) ActionDraft for one entity + skill, or null. */
export async function getActionDraft(
  scope: ActionDraftScope,
  skill: string,
): Promise<ActionDraftRow | null> {
  await getActor(); // gate to authenticated partners
  const { key, id } = resolveScope(scope);

  const row = await prisma.actionDraft.findFirst({
    where: { [key]: id, skill, status: "draft" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, skill: true, content: true, status: true, updatedAt: true },
  });
  if (!row) return null;
  return {
    id: row.id,
    skill: row.skill,
    content: row.content,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Save (upsert) the step-1 draft for one entity + skill. Updates the existing
 * live draft if one exists, else creates it — so repeated saves / auto-saves
 * never duplicate rows. Returns the row id + updatedAt for the UI's orange state.
 */
export async function saveActionDraft(input: {
  skill: string;
  scope: ActionDraftScope;
  content: unknown;
}): Promise<{ id: string; updatedAt: string }> {
  const { actor, label } = await getActor();
  const { key, id } = resolveScope(input.scope);
  const skill = input.skill?.trim();
  if (!skill) throw new Error("skill is required");

  const saved = await prisma.$transaction(async (tx) => {
    const existing = await tx.actionDraft.findFirst({
      where: { [key]: id, skill, status: "draft" },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    const row = existing
      ? await tx.actionDraft.update({
          where: { id: existing.id },
          data: { content: input.content as never, createdBy: label },
        })
      : await tx.actionDraft.create({
          data: {
            skill,
            content: input.content as never,
            status: "draft",
            createdBy: label,
            [key]: id,
          },
        });

    await writeAudit(tx, {
      actor,
      action: existing ? "update.action-draft" : "create.action-draft",
      targetType: "ActionDraft",
      targetId: row.id,
      changes: { skill, scope: { [key]: id } },
    });

    return row;
  });

  const path = scopePath(key, id);
  if (path) revalidatePath(path);
  return { id: saved.id, updatedAt: saved.updatedAt.toISOString() };
}

/**
 * Clear a saved draft once it's been consumed (proceeded to step 2) or
 * discarded. Idempotent — a missing row is a no-op.
 */
export async function clearActionDraft(id: string): Promise<void> {
  const { actor } = await getActor();

  const cleared = await prisma.$transaction(async (tx) => {
    const existing = await tx.actionDraft.findUnique({
      where: { id },
      select: { id: true, skill: true, clientId: true, dealId: true, contactId: true, projectId: true },
    });
    if (!existing) return null;

    await tx.actionDraft.delete({ where: { id } });

    await writeAudit(tx, {
      actor,
      action: "delete.action-draft",
      targetType: "ActionDraft",
      targetId: id,
      changes: { skill: existing.skill },
    });

    return existing;
  });

  if (!cleared) return;
  // Orphaned drafts (entity deleted → FKs SET NULL) have no path to revalidate.
  const fk =
    (cleared.clientId && (["clientId", cleared.clientId] as const)) ||
    (cleared.dealId && (["dealId", cleared.dealId] as const)) ||
    (cleared.contactId && (["contactId", cleared.contactId] as const)) ||
    (cleared.projectId && (["projectId", cleared.projectId] as const)) ||
    null;
  if (fk) {
    const path = scopePath(fk[0], fk[1]);
    if (path) revalidatePath(path);
  }
}
