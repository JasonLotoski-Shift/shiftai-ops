// Run-status + saved-draft maps for the Actions panel.
//
// Two server-side reads, shared by the deal / client / contact detail pages:
//
//   • ranAtBySkill  — the latest time each Quick Action produced a real
//     deliverable for this entity (max Artifact.createdAt per generatedFromSkill).
//     The Actions panel turns the matching box GREEN ("last ran DATE").
//   • savedAtBySkill — the latest saved (unfinished) ActionDraft per skill for
//     this entity. The box turns ORANGE ("step 1 of 2 saved") and reopens
//     preloaded.
//
// These are plain helpers (NOT "use server") — server components call them with
// the singleton Prisma client. The action box key → generatedFromSkill mapping
// is the caller's job (keys and skill names differ, e.g. "questionnaire" vs
// "discovery-questionnaire"); these return maps keyed by the real skill value.

import { prisma } from "@/lib/prisma";

// Artifact has only client/project/deal scope FKs (NO contactId) — so run-status
// from Artifact is restricted to those. ActionDraft adds contactId, so saved
// drafts can be queried per contact too.
type ArtifactFk = { clientId: string } | { dealId: string } | { projectId: string };
type DraftFk = ArtifactFk | { contactId: string };

/** Max Artifact.createdAt per generatedFromSkill for one entity. */
export async function ranAtBySkill(where: ArtifactFk): Promise<Record<string, Date>> {
  const rows = await prisma.artifact.findMany({
    where: { ...where, generatedFromSkill: { not: null } },
    select: { generatedFromSkill: true, createdAt: true },
  });
  const out: Record<string, Date> = {};
  for (const r of rows) {
    const skill = r.generatedFromSkill;
    if (!skill) continue;
    if (!out[skill] || r.createdAt > out[skill]) out[skill] = r.createdAt;
  }
  return out;
}

/** Latest saved (status="draft") ActionDraft.updatedAt per skill for one entity. */
export async function savedAtBySkill(where: DraftFk): Promise<Record<string, Date>> {
  const rows = await prisma.actionDraft.findMany({
    where: { ...where, status: "draft" },
    select: { skill: true, updatedAt: true },
  });
  const out: Record<string, Date> = {};
  for (const r of rows) {
    if (!out[r.skill] || r.updatedAt > out[r.skill]) out[r.skill] = r.updatedAt;
  }
  return out;
}
