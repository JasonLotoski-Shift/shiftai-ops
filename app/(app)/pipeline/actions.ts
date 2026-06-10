"use server";

// Pipeline board mutations.
//
// Canonical mutation recipe (see app/(app)/dashboard/actions.ts header).
// Per-deal conversion lives in pipeline/[id]/actions.ts; this is the
// board-level drag-to-restage move.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor, agentActor } from "@/lib/audit";
import { generate } from "@/lib/ai";
import { linkContact } from "@/lib/contact-links";
import type { DealStage, Industry } from "@/lib/generated/prisma/enums";

const STAGE_LABELS: Record<DealStage, string> = {
  lead: "Lead",
  qualified: "Qualified",
  discovery: "Discovery Call",
  discussion: "Discussion Call",
  proposal: "Proposal",
  negotiation: "Negotiation",
  signed: "Signed",
};

// Stages a card can be dragged into. "signed" is intentionally excluded —
// signing a deal runs the convert-deal flow (creates Client + Project +
// Drive folder), not a bare stage flip.
const DRAGGABLE_STAGES: DealStage[] = ["lead", "qualified", "discovery", "discussion", "proposal", "negotiation"];

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

const VALID_STAGES: DealStage[] = ["lead", "qualified", "discovery", "discussion", "proposal", "negotiation", "signed"];
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
    select: { id: true, name: true, company: true, industry: true, domain: true },
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

  // Seed the deal's web identity from the contact's normalized domain (D40) —
  // the company profile starts with whatever we already know.
  const domain = contact.domain?.trim() || null;

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
        ...(domain ? { domain, website: domain } : {}),
      },
    });

    // The deal's contact is on the buying committee from day one —
    // works-there + primary. Single write path: lib/contact-links.
    await linkContact(tx, {
      contactId: contact.id,
      dealId: created.id,
      relationship: "works_there",
      isPrimary: true,
      addedBy: partnerLabel,
    });

    await writeAudit(tx, {
      actor,
      action: "create.deal",
      targetType: "Deal",
      targetId: created.id,
      changes: { company, stage, valueEstimate: value, industry, contactId: contact.id, domain },
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

  // ── AI pass: structure the note + lift durable contact facts ──────────
  // Best-effort enrichment AFTER the deal is safely persisted. If the model
  // call, the JSON parse, or the follow-up writes fail, we swallow it and
  // keep the raw note — the deal must still exist. The raw note already saved
  // above, so a failure here is a no-op, not a rollback.
  const rawNote = input.notes?.trim();
  if (rawNote) {
    try {
      await structureDealNotes({
        dealId: deal.id,
        contactId: contact.id,
        contactName: contact.name,
        company,
        rawNote,
      });
    } catch (err) {
      // Non-fatal — the deal is already saved with the raw note.
      console.error("structure-deal-notes failed (kept raw note):", err);
    }
  }

  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  revalidatePath(`/contacts/${contact.id}`);
  revalidatePath("/contacts");
  return { id: deal.id };
}

// ──────────────────────────────────────────────────────────────────────
// structureDealNotes — the structure-deal-notes skill, applied to a deal's
// raw note right after creation.
//
// Two outputs from one call:
//   1. structuredNote → replaces Deal.notes (tidy, skimmable)
//   2. contactKeyFacts → APPEND-ONLY merge into the linked Contact.keyFacts
//      (case-insensitive dedupe — never overwrites; mirrors the merge in
//      contacts/[id]/actions.ts applyEnrichment).
//
// Attributed to agentActor("structure-deal-notes"). Resilient by contract:
// the caller wraps this in try/catch so any failure keeps the raw note.
// ──────────────────────────────────────────────────────────────────────

function parseStructuredNotes(raw: string): {
  structuredNote: string | null;
  contactKeyFacts: string[];
} {
  let text = raw.trim();
  // Strip a ```json fence if the model added one despite instructions.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  // Otherwise slice to the outermost braces.
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  }

  const obj = JSON.parse(text) as { structuredNote?: unknown; contactKeyFacts?: unknown };

  const structuredNote =
    typeof obj.structuredNote === "string" && obj.structuredNote.trim()
      ? obj.structuredNote.trim()
      : null;

  const contactKeyFacts = Array.isArray(obj.contactKeyFacts)
    ? obj.contactKeyFacts
        .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
        .map((f) => f.trim())
    : [];

  return { structuredNote, contactKeyFacts };
}

async function structureDealNotes(args: {
  dealId: string;
  contactId: string;
  contactName: string;
  company: string;
  rawNote: string;
}) {
  const { dealId, contactId, contactName, company, rawNote } = args;

  // Context: a short summary of the linked contact so the model knows who the
  // durable facts attach to and avoids duplicating what's already on record.
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      name: true,
      title: true,
      company: true,
      industry: true,
      persona: true,
      keyFacts: true,
    },
  });
  if (!contact) return; // contact vanished between writes — nothing to do

  const ctx: string[] = [
    "## Linked contact (the deal's primary person)",
    `Name: ${contact.name}`,
    `Title: ${contact.title}`,
    `Company: ${contact.company}`,
    `Industry: ${contact.industry}`,
  ];
  if (contact.persona) ctx.push(`Persona: ${contact.persona}`);
  ctx.push(
    `Existing key facts: ${contact.keyFacts.length ? contact.keyFacts.join("; ") : "(none)"}`,
  );

  const intake = [
    "## Raw deal note (the partner's words)",
    rawNote,
    "",
    `(This deal is for ${company}.)`,
  ].join("\n");

  const raw = await generate({
    skill: "structure-deal-notes",
    context: ctx.join("\n"),
    intake,
    maxTokens: 800,
  });

  const { structuredNote, contactKeyFacts } = parseStructuredNotes(raw);

  // Append-only merge of new durable facts into Contact.keyFacts (never
  // overwrite; case-insensitive dedupe against what's already there).
  const merged = [...contact.keyFacts];
  const newFacts: string[] = [];
  for (const fact of contactKeyFacts) {
    if (!merged.some((v) => v.toLowerCase() === fact.toLowerCase())) {
      merged.push(fact);
      newFacts.push(fact);
    }
  }

  const noteChanged = !!structuredNote && structuredNote !== rawNote;
  if (!noteChanged && newFacts.length === 0) return; // nothing worth writing

  const aiActor = agentActor("structure-deal-notes");

  await prisma.$transaction(async (tx) => {
    if (noteChanged) {
      await tx.deal.update({
        where: { id: dealId },
        data: { notes: structuredNote },
      });
    }
    if (newFacts.length > 0) {
      await tx.contact.update({
        where: { id: contactId },
        data: { keyFacts: merged, enrichedAt: new Date() },
      });
    }

    await writeAudit(tx, {
      actor: aiActor,
      action: "update.deal.structure-notes",
      targetType: "Deal",
      targetId: dealId,
      changes: {
        contactId,
        structuredNote: noteChanged,
        keyFactsAdded: newFacts,
      },
    });

    if (newFacts.length > 0) {
      await writeActivity(tx, {
        actor: aiActor,
        type: "ai",
        target: contactName,
        detail: `Lifted ${newFacts.length} durable fact(s) from a deal note — ${company}`,
        link: `/contacts/${contactId}`,
      });
    }
  });
}
