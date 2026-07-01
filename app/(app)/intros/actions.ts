"use server";

// Intro-pipeline server actions (Lane 4, Phase 8).
//
// An Intro is a single introduction in flight from a channel-partner Contact
// toward a named target. It is the pre-deal opportunity-via-relationship: the
// board tracks its status (proposed → … → converted), follow-up tasks hang off
// Task.introId, and on convert it produces a Deal + a ContactLink(introduced_us)
// so the deal pipeline picks up exactly where the intro ends.
//
// Canonical mutation recipe (see shiftai-ops/CLAUDE.md "Wire a Quick Action
// end-to-end"): every write runs inside a $transaction with writeAudit; the
// feed-worthy ones also writeActivity.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { linkContact } from "@/lib/contact-links";
import type { IntroStatus, DealStage } from "@/lib/generated/prisma/enums";

const VALID_INTRO_STATUSES: IntroStatus[] = [
  "proposed",
  "requested",
  "made",
  "meeting_set",
  "converted",
  "declined",
  "dead",
];

// A convert can be reached only from a live intro (not one already declined /
// dead). The board's drag-to-converted routes through convertIntro, so a bare
// status flip to "converted" is rejected everywhere below — it would skip the
// Deal + ContactLink handoff the status is meant to represent.
const TERMINAL_STATUSES: IntroStatus[] = ["converted", "declined", "dead"];

// ──────────────────────────────────────────────────────────────────────
// setChannelPartner — the Contact-side marker (Lane 4). Flags a person as a
// channel partner (someone who sends intros) and holds the relationship
// context in channelNotes. Powers the Contacts "Channel Partners" filter and
// the per-contact panel. A flag, not a type swap — a person can be both a
// prospect and a connector.
// ──────────────────────────────────────────────────────────────────────
export async function setChannelPartner(
  contactId: string,
  input: { isChannelPartner?: boolean; channelNotes?: string | null },
): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(session.user.partnerId, session.user.name ?? session.user.email ?? "Unknown");

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, isChannelPartner: true, channelNotes: true },
  });
  if (!contact) throw new Error("Contact not found");

  const data: { isChannelPartner?: boolean; channelNotes?: string | null } = {};
  const changes: Record<string, { before: unknown; after: unknown }> = {};

  if (input.isChannelPartner !== undefined && input.isChannelPartner !== contact.isChannelPartner) {
    data.isChannelPartner = input.isChannelPartner;
    changes.isChannelPartner = { before: contact.isChannelPartner, after: input.isChannelPartner };
  }
  if (input.channelNotes !== undefined) {
    const notes = input.channelNotes?.trim() || null;
    if (notes !== (contact.channelNotes ?? null)) {
      data.channelNotes = notes;
      changes.channelNotes = { before: contact.channelNotes ?? null, after: notes };
    }
  }

  if (Object.keys(changes).length === 0) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.contact.update({ where: { id: contactId }, data });
    await writeAudit(tx, {
      actor,
      action: "update.contact.channelPartner",
      targetType: "Contact",
      targetId: contactId,
      changes,
    });
  });

  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/contacts");
  revalidatePath("/intros");
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────
// createIntro — a channel partner (introducer contact) offers an intro to a
// named target company. Owner is the partner who'll follow up. Nothing on the
// company side is created yet; the Deal comes at convert.
// ──────────────────────────────────────────────────────────────────────
export async function createIntro(input: {
  introducerId: string;
  targetCompany: string;
  ownerId?: string | null;
  targetContactId?: string | null;
  notes?: string | null;
  status?: string;
}): Promise<{ id: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const targetCompany = input.targetCompany.trim();
  if (!targetCompany) throw new Error("Target company is required");
  if (targetCompany.length > 200) throw new Error("Target company is too long (max 200 chars)");

  const introducer = await prisma.contact.findUnique({
    where: { id: input.introducerId },
    select: { id: true, name: true, isChannelPartner: true },
  });
  if (!introducer) throw new Error("Introducer contact not found");

  const status = (input.status as IntroStatus) ?? "proposed";
  if (!VALID_INTRO_STATUSES.includes(status)) throw new Error(`Invalid status: ${input.status}`);
  // Convert is a handoff, not a starting state — an intro reaches "converted"
  // only through convertIntro (which creates the Deal).
  if (status === "converted") throw new Error("Use Convert to move an intro to converted");

  const ownerId = input.ownerId || null;
  if (ownerId) {
    const owner = await prisma.partner.findUnique({ where: { id: ownerId }, select: { id: true } });
    if (!owner) throw new Error("Owner not found");
  }
  const targetContactId = input.targetContactId || null;
  if (targetContactId) {
    const tc = await prisma.contact.findUnique({ where: { id: targetContactId }, select: { id: true } });
    if (!tc) throw new Error("Target contact not found");
  }

  const intro = await prisma.$transaction(async (tx) => {
    const created = await tx.intro.create({
      data: {
        introducerId: introducer.id,
        targetCompany,
        status,
        ownerId,
        targetContactId,
        notes: input.notes?.trim() || null,
        createdBy: partnerLabel,
      },
    });
    // Stamp the channel-partner marker if the introducer isn't flagged yet — a
    // person making intros IS a channel partner (keeps the Contacts filter true).
    if (!introducer.isChannelPartner) {
      await tx.contact.update({ where: { id: introducer.id }, data: { isChannelPartner: true } });
    }
    await writeAudit(tx, {
      actor,
      action: "create.intro",
      targetType: "Intro",
      targetId: created.id,
      changes: { introducerId: introducer.id, targetCompany, status, ownerId, targetContactId },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: targetCompany,
      detail: `Intro logged — via ${introducer.name}`,
      link: "/intros",
    });
    return created;
  });

  revalidatePath("/intros");
  revalidatePath(`/contacts/${introducer.id}`);
  return { id: intro.id };
}

// ──────────────────────────────────────────────────────────────────────
// updateIntro — edit an intro's core fields (target, owner, target contact,
// notes) from the board's detail modal. Status moves go through
// updateIntroStatus; convert goes through convertIntro.
// ──────────────────────────────────────────────────────────────────────
export async function updateIntro(
  introId: string,
  input: {
    targetCompany?: string;
    ownerId?: string | null;
    targetContactId?: string | null;
    notes?: string | null;
  },
): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(session.user.partnerId, session.user.name ?? session.user.email ?? "Unknown");

  const intro = await prisma.intro.findUnique({
    where: { id: introId },
    select: { id: true, targetCompany: true, ownerId: true, targetContactId: true, notes: true, introducerId: true },
  });
  if (!intro) throw new Error("Intro not found");

  const data: {
    targetCompany?: string;
    ownerId?: string | null;
    targetContactId?: string | null;
    notes?: string | null;
  } = {};
  const changes: Record<string, { before: unknown; after: unknown }> = {};

  if (input.targetCompany !== undefined) {
    const targetCompany = input.targetCompany.trim();
    if (!targetCompany) throw new Error("Target company is required");
    if (targetCompany.length > 200) throw new Error("Target company is too long (max 200 chars)");
    if (targetCompany !== intro.targetCompany) {
      data.targetCompany = targetCompany;
      changes.targetCompany = { before: intro.targetCompany, after: targetCompany };
    }
  }
  if (input.ownerId !== undefined) {
    const ownerId = input.ownerId || null;
    if (ownerId) {
      const owner = await prisma.partner.findUnique({ where: { id: ownerId }, select: { id: true } });
      if (!owner) throw new Error("Owner not found");
    }
    if (ownerId !== (intro.ownerId ?? null)) {
      data.ownerId = ownerId;
      changes.ownerId = { before: intro.ownerId ?? null, after: ownerId };
    }
  }
  if (input.targetContactId !== undefined) {
    const targetContactId = input.targetContactId || null;
    if (targetContactId) {
      const tc = await prisma.contact.findUnique({ where: { id: targetContactId }, select: { id: true } });
      if (!tc) throw new Error("Target contact not found");
    }
    if (targetContactId !== (intro.targetContactId ?? null)) {
      data.targetContactId = targetContactId;
      changes.targetContactId = { before: intro.targetContactId ?? null, after: targetContactId };
    }
  }
  if (input.notes !== undefined) {
    const notes = input.notes?.trim() || null;
    if (notes !== (intro.notes ?? null)) {
      data.notes = notes;
      changes.notes = { before: intro.notes ?? null, after: notes };
    }
  }

  if (Object.keys(changes).length === 0) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.intro.update({ where: { id: introId }, data });
    await writeAudit(tx, {
      actor,
      action: "update.intro",
      targetType: "Intro",
      targetId: introId,
      changes,
    });
  });

  revalidatePath("/intros");
  revalidatePath(`/contacts/${intro.introducerId}`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────
// updateIntroStatus — move an intro card across the board's status columns.
// "converted" is NOT settable here (it's the Deal handoff — convertIntro
// scaffolds the Deal + ContactLink); a converted intro is frozen (its deal
// owns it now). Every other IntroStatus is a plain move.
// ──────────────────────────────────────────────────────────────────────
export async function updateIntroStatus(introId: string, status: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(session.user.partnerId, session.user.name ?? session.user.email ?? "Unknown");

  const intro = await prisma.intro.findUnique({
    where: { id: introId },
    select: { id: true, status: true, targetCompany: true, introducerId: true, dealId: true },
  });
  if (!intro) throw new Error("Intro not found");

  if (!VALID_INTRO_STATUSES.includes(status as IntroStatus)) throw new Error(`Invalid status: ${status}`);
  if (status === "converted") {
    throw new Error("Use Convert → Deal to convert an intro — it scaffolds the deal.");
  }
  if (intro.status === "converted") {
    throw new Error("This intro is converted — it became a deal. Manage it there.");
  }
  if (status === intro.status) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.intro.update({ where: { id: introId }, data: { status: status as IntroStatus } });
    await writeAudit(tx, {
      actor,
      action: "update.intro.status",
      targetType: "Intro",
      targetId: introId,
      changes: { status: { before: intro.status, after: status } },
    });
  });

  revalidatePath("/intros");
  revalidatePath(`/contacts/${intro.introducerId}`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────
// deleteIntro — remove an intro. Only before convert: a converted intro
// produced a Deal (which owns the provenance link), so deleting it here would
// orphan that. Follow-up tasks (Task.introId) default to SET NULL, so they
// stay on the board as standalone tasks — we don't delete them.
// ──────────────────────────────────────────────────────────────────────
export async function deleteIntro(introId: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(session.user.partnerId, session.user.name ?? session.user.email ?? "Unknown");

  const intro = await prisma.intro.findUnique({
    where: { id: introId },
    select: { id: true, targetCompany: true, status: true, dealId: true, introducerId: true },
  });
  if (!intro) throw new Error("Intro not found");
  if (intro.dealId || intro.status === "converted") {
    throw new Error("This intro converted into a deal — manage it on the pipeline, not here.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.intro.delete({ where: { id: introId } });
    await writeAudit(tx, {
      actor,
      action: "delete.intro",
      targetType: "Intro",
      targetId: introId,
      changes: { targetCompany: intro.targetCompany, status: intro.status },
    });
  });

  revalidatePath("/intros");
  revalidatePath(`/contacts/${intro.introducerId}`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────
// convertIntro — the handoff. An intro that produced a real opportunity
// becomes a Deal at stage "lead" (or a caller-chosen early stage). In one
// transaction:
//   - Create the Deal (company = target; contact = the target contact if known,
//     else the introducer; industry / partner-lead inherited from the deal's
//     contact so the row is valid).
//   - linkContact(introducer → deal, relationship "introduced_us") — the single
//     ContactLink write path records the intro→deal provenance. DealSourceCommission
//     (the economics) is a separate flow; this only records who introduced us.
//   - Set Intro.status = "converted" + Intro.dealId.
//
// The intro pipeline ends exactly where the deal pipeline begins. A deal at
// "lead" then moves through the normal stages and converts to a client via the
// existing convertDeal flow.
// ──────────────────────────────────────────────────────────────────────

// Early stages a convert can target — the deal starts wherever the intro landed
// the relationship (a booked meeting is further along than a bare intro).
const VALID_CONVERT_STAGES: DealStage[] = ["lead", "qualified", "discovery", "discussion"];

export async function convertIntro(
  introId: string,
  input: { valueEstimate?: number; stage?: string; closeTargetDate?: string } = {},
): Promise<{ dealId: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const intro = await prisma.intro.findUnique({
    where: { id: introId },
    include: {
      introducer: { select: { id: true, name: true, industry: true, partnerLeadId: true } },
      targetContact: { select: { id: true, partnerLeadId: true } },
    },
  });
  if (!intro) throw new Error("Intro not found");
  if (intro.dealId || intro.status === "converted") {
    throw new Error("This intro is already converted");
  }
  if (TERMINAL_STATUSES.includes(intro.status)) {
    throw new Error("A declined or dead intro can't be converted — reopen it first");
  }

  // The deal's contact: the person being introduced when known, else the
  // introducer (so the deal always has a valid contact FK). Industry comes from
  // the introducer (the target's own industry may differ, editable on the deal);
  // partner-lead comes from whichever contact anchors the deal.
  const dealContact = intro.targetContact ?? intro.introducer;
  const stage = (input.stage && VALID_CONVERT_STAGES.includes(input.stage as DealStage))
    ? (input.stage as DealStage)
    : "lead";
  const valueEstimate = Number.isFinite(input.valueEstimate) && (input.valueEstimate ?? 0) > 0
    ? Math.round(input.valueEstimate as number)
    : 0;

  // Close target — the caller's date, else a default 60 days out so the board
  // has something to age against.
  let closeTargetDate: Date;
  if (input.closeTargetDate) {
    closeTargetDate = new Date(input.closeTargetDate);
    if (Number.isNaN(closeTargetDate.getTime())) throw new Error(`Invalid close-target date: ${input.closeTargetDate}`);
  } else {
    closeTargetDate = new Date();
    closeTargetDate.setDate(closeTargetDate.getDate() + 60);
  }

  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const deal = await tx.deal.create({
      data: {
        company: intro.targetCompany,
        stage,
        valueEstimate,
        industry: intro.introducer.industry,
        closeTargetDate,
        lastTouchAt: now,
        stageEnteredAt: now,
        // The deal opens with the intro's context so the pipeline card isn't blank.
        notes: intro.notes?.trim() || `Introduced by ${intro.introducer.name}.`,
        contactId: dealContact.id,
        // Partner lead: the deal contact's lead (every contact has one).
        partnerLeadId: dealContact.partnerLeadId,
      },
    });

    // Record the provenance: the introducer connects to this deal as the person
    // who introduced us. Single ContactLink write path; DealSourceCommission (the
    // economics) is set separately on the deal if there's a fee.
    await linkContact(tx, {
      contactId: intro.introducer.id,
      dealId: deal.id,
      relationship: "introduced_us",
      addedBy: partnerLabel,
    });

    await tx.intro.update({
      where: { id: introId },
      data: { status: "converted", dealId: deal.id },
    });

    await writeAudit(tx, {
      actor,
      action: "convert.intro.deal",
      targetType: "Intro",
      targetId: introId,
      changes: {
        status: { before: intro.status, after: "converted" },
        createdDealId: deal.id,
        introducerId: intro.introducer.id,
        targetCompany: intro.targetCompany,
        stage,
      },
    });

    await writeActivity(tx, {
      actor,
      type: "status",
      target: intro.targetCompany,
      detail: `Intro converted to a deal — via ${intro.introducer.name}`,
      link: `/pipeline/${deal.id}`,
    });

    return { dealId: deal.id };
  });

  revalidatePath("/intros");
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  revalidatePath(`/contacts/${intro.introducer.id}`);
  return result;
}
