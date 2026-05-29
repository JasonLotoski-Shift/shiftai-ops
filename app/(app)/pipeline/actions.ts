"use server";

// Pipeline board mutations.
//
// Canonical mutation recipe (see app/(app)/dashboard/actions.ts header).
// Per-deal conversion lives in pipeline/[id]/actions.ts; this is the
// board-level drag-to-restage move.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import type { DealStage, Industry } from "@/lib/generated/prisma/enums";

const STAGE_LABELS: Record<DealStage, string> = {
  lead: "Lead",
  qualified: "Qualified",
  discovery: "Discovery",
  proposal: "Proposal",
  negotiation: "Negotiation",
  signed: "Signed",
};

// Stages a card can be dragged into. "signed" is intentionally excluded —
// signing a deal runs the convert-deal flow (creates Client + Project +
// Drive folder), not a bare stage flip.
const DRAGGABLE_STAGES: DealStage[] = ["lead", "qualified", "discovery", "proposal", "negotiation"];

export async function updateDealStage(dealId: string, newStage: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  if (!DRAGGABLE_STAGES.includes(newStage as DealStage)) {
    throw new Error(
      newStage === "signed"
        ? "Use Convert to sign a deal — it scaffolds the client."
        : `Invalid stage: ${newStage}`,
    );
  }
  const stage = newStage as DealStage;

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { stage: true, company: true },
  });
  if (!deal) throw new Error("Deal not found");
  if (deal.stage === "signed") throw new Error("Signed deals can't be moved back on the board");
  if (deal.stage === stage) return { stage }; // no-op (dropped on same column)

  await prisma.$transaction(async (tx) => {
    await tx.deal.update({
      where: { id: dealId },
      // Moving a deal forward is a touch — reset both clocks. stageEnteredAt
      // resets the board's aging color back to fresh/green.
      data: { stage, lastTouchAt: new Date(), stageEnteredAt: new Date() },
    });
    await writeAudit(tx, {
      actor,
      action: "update.deal.stage",
      targetType: "Deal",
      targetId: dealId,
      changes: { stage: { before: deal.stage, after: stage } },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: deal.company,
      detail: `Moved to ${STAGE_LABELS[stage]}`,
      link: `/pipeline/${dealId}`,
    });
  });

  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { stage };
}

// ──────────────────────────────────────────────────────────────────────
// createDeal — add a lead/deal to the funnel from an existing contact.
//
// A Deal requires a Contact (FK), so the funnel is built from people already
// in Contacts. Company + industry default from the contact; everything else
// is the partner's call. New stage deals start "fresh" (green) — stageEnteredAt
// defaults to now. Canonical recipe: create + writeAudit + writeActivity.
// ──────────────────────────────────────────────────────────────────────

const VALID_STAGES: DealStage[] = ["lead", "qualified", "discovery", "proposal", "negotiation", "signed"];
const VALID_INDUSTRIES: Industry[] = ["automotive", "motorsport", "engineering", "construction", "other"];

export async function createDeal(input: {
  contactId: string;
  company?: string;
  stage?: string;
  valueEstimate: number;
  industry?: string;
  closeTargetDate: string; // YYYY-MM-DD
  partnerLeadId?: string;
  notes?: string;
}) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const contact = await prisma.contact.findUnique({
    where: { id: input.contactId },
    select: { id: true, name: true, company: true, industry: true },
  });
  if (!contact) throw new Error("Pick a contact for this deal");

  const company = input.company?.trim() || contact.company;
  const stage = (input.stage && VALID_STAGES.includes(input.stage as DealStage)
    ? (input.stage as DealStage)
    : "lead");
  const industry = (input.industry && VALID_INDUSTRIES.includes(input.industry as Industry)
    ? (input.industry as Industry)
    : contact.industry);

  const value = Math.round(Number(input.valueEstimate));
  if (!Number.isFinite(value) || value < 0) throw new Error("Enter a valid estimated value");

  const closeTargetDate = new Date(input.closeTargetDate);
  if (Number.isNaN(closeTargetDate.getTime())) throw new Error("Enter a valid close-target date");

  // Default the deal lead to whoever's signed in; allow an explicit override.
  const partnerLeadId = input.partnerLeadId?.trim() || session.user.partnerId;
  const lead = await prisma.partner.findUnique({ where: { id: partnerLeadId }, select: { id: true } });
  if (!lead) throw new Error("Partner lead not found");

  const now = new Date();

  const deal = await prisma.$transaction(async (tx) => {
    const created = await tx.deal.create({
      data: {
        company,
        stage,
        valueEstimate: value,
        industry,
        closeTargetDate,
        lastTouchAt: now,
        stageEnteredAt: now,
        notes: input.notes?.trim() || null,
        contactId: contact.id,
        partnerLeadId,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.deal",
      targetType: "Deal",
      targetId: created.id,
      changes: { company, stage, valueEstimate: value, industry, contactId: contact.id },
    });

    await writeActivity(tx, {
      actor,
      type: "status",
      target: company,
      detail: `Added to pipeline at ${STAGE_LABELS[stage]} — ${contact.name}`,
      link: `/pipeline/${created.id}`,
    });

    return created;
  });

  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { id: deal.id };
}
