"use server";

// AI Found Leads — review-surface mutations (Lead Agent, Phase B).
//
// Canonical mutation recipe (see app/(app)/pipeline/actions.ts header):
// one prisma.$transaction + writeAudit + writeActivity, then revalidate.
//
// addToFunnel converts a discovered ProspectLead into a real Contact + Deal
// and marks the lead "added". declineLead sets it to "ghost". Both are
// gated on the lead still being "pending" so a double-submit can't double-create.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor, agentActor } from "@/lib/audit";
import { generate } from "@/lib/ai";
import type { Industry } from "@/lib/generated/prisma/enums";
import type { ProspectPerson } from "@/lib/types";

const VALID_INDUSTRIES: Industry[] = ["automotive", "motorsport", "engineering", "construction", "other"];

// ──────────────────────────────────────────────────────────────────────
// addToFunnel — promote a discovered lead into the pipeline.
//
// One transaction: create Contact (from the chosen person + lead firmographics),
// create Deal at "lead" stage, flip the ProspectLead to "added" with the
// converted FKs + reviewer stamp. Three audit rows + one activity row.
//
// Contact.email is a required, unique String. We block when the chosen person
// has no email (the panel disables those), and surface a friendly message on a
// unique-constraint collision ("already in pipeline").
// ──────────────────────────────────────────────────────────────────────

export async function addToFunnel(
  leadId: string,
  input: { personIndex: number; industry: string; partnerLeadId?: string },
): Promise<{ dealId: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const lead = await prisma.prospectLead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error("Lead not found");
  // Promotable only from "pending" (D36). ProspectLeadStatus.contacted is now
  // vestigial — the cold-email path goes through sendColdEmail, which converts
  // directly to "added". (Not promotable from added/ghost.)
  if (lead.status !== "pending")
    throw new Error("This lead has already been reviewed");
  const priorStatus = lead.status;

  const people = (lead.people as unknown as ProspectPerson[]) ?? [];
  const person = people[input.personIndex];
  if (!person) throw new Error("Pick a person to add");
  const email = person.email?.trim();
  if (!email) throw new Error("That person has no email — pick someone with an email to add them as a contact");

  if (!VALID_INDUSTRIES.includes(input.industry as Industry)) throw new Error("Pick a valid industry");
  const industry = input.industry as Industry;

  // Default the lead owner to whoever's signed in; allow an explicit override.
  const partnerLeadId = input.partnerLeadId?.trim() || session.user.partnerId;
  const partner = await prisma.partner.findUnique({ where: { id: partnerLeadId }, select: { id: true } });
  if (!partner) throw new Error("Partner lead not found");

  const now = new Date();
  const closeTargetDate = new Date(now);
  closeTargetDate.setDate(closeTargetDate.getDate() + 90);

  let dealId: string;
  try {
    dealId = await prisma.$transaction(async (tx) => {
      const contact = await tx.contact.create({
        data: {
          name: person.name,
          title: person.title || "—",
          company: lead.companyName,
          email,
          industry,
          source: "AI Found Lead",
          sourceCategory: "outbound",
          domain: lead.domain,
          lastTouchAt: now,
          partnerLeadId,
        },
      });

      const deal = await tx.deal.create({
        data: {
          company: lead.companyName,
          stage: "lead",
          valueEstimate: 0,
          industry,
          closeTargetDate,
          lastTouchAt: now,
          stageEnteredAt: now,
          contactId: contact.id,
          partnerLeadId,
        },
      });

      await tx.prospectLead.update({
        where: { id: leadId },
        data: {
          status: "added",
          convertedContactId: contact.id,
          convertedDealId: deal.id,
          reviewedBy: partnerLabel,
          reviewedAt: now,
        },
      });

      await writeAudit(tx, {
        actor,
        action: "create.contact",
        targetType: "Contact",
        targetId: contact.id,
        changes: { name: contact.name, company: contact.company, fromProspectLead: leadId },
      });
      await writeAudit(tx, {
        actor,
        action: "create.deal",
        targetType: "Deal",
        targetId: deal.id,
        changes: { company: deal.company, stage: deal.stage, fromProspectLead: leadId },
      });
      await writeAudit(tx, {
        actor,
        action: "update.prospectLead.added",
        targetType: "ProspectLead",
        targetId: leadId,
        changes: { status: { before: priorStatus, after: "added" }, contactId: contact.id, dealId: deal.id },
      });
      await writeActivity(tx, {
        actor,
        type: "ai",
        target: lead.companyName,
        detail: `Added AI-found lead to the pipeline (${person.name})`,
        link: `/pipeline/${deal.id}`,
      });

      return deal.id;
    });
  } catch (err: unknown) {
    // Unique-constraint collision on Contact.email → already in the pipeline.
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      throw new Error(`${person.name} is already in the pipeline (duplicate email)`);
    }
    throw err;
  }

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/leads/${leadId}`);
  revalidatePath("/contacts");
  revalidatePath("/dashboard");
  return { dealId };
}

// ──────────────────────────────────────────────────────────────────────
// declineLead — set aside a discovered lead ("ghost"). Reversible only by
// re-running discovery; from the partner's view it leaves the pending grid.
// ──────────────────────────────────────────────────────────────────────

export async function declineLead(leadId: string, input: { reason?: string } = {}): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const lead = await prisma.prospectLead.findUnique({
    where: { id: leadId },
    select: { status: true, companyName: true },
  });
  if (!lead) throw new Error("Lead not found");
  if (lead.status !== "pending")
    throw new Error("This lead has already been reviewed");
  const priorStatus = lead.status;

  const reason = input.reason?.trim() || undefined;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.prospectLead.update({
      where: { id: leadId },
      data: { status: "ghost", reviewedBy: partnerLabel, reviewedAt: now },
    });
    await writeAudit(tx, {
      actor,
      action: "update.prospectLead.ghost",
      targetType: "ProspectLead",
      targetId: leadId,
      changes: { status: { before: priorStatus, after: "ghost" }, reason },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: lead.companyName,
      detail: `Declined AI-found lead${reason ? `: ${reason}` : ""}`,
    });
  });

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/leads/${leadId}`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────
// restoreLead — bring a ghosted lead back into the New (pending) lane.
// Reverse of declineLead: status ghost → pending, reviewer stamp cleared.
// Only touches status (never the disqualified flag — a disqualified lead
// stays in Filtered even after restore).
// ──────────────────────────────────────────────────────────────────────

export async function restoreLead(leadId: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const lead = await prisma.prospectLead.findUnique({
    where: { id: leadId },
    select: { status: true, companyName: true },
  });
  if (!lead) throw new Error("Lead not found");
  if (lead.status !== "ghost") throw new Error("Only set-aside leads can be restored");

  await prisma.$transaction(async (tx) => {
    await tx.prospectLead.update({
      where: { id: leadId },
      data: { status: "pending", reviewedAt: null },
    });
    await writeAudit(tx, {
      actor,
      action: "update.prospectLead.restore",
      targetType: "ProspectLead",
      targetId: leadId,
      changes: { status: { before: "ghost", after: "pending" } },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: lead.companyName,
      detail: "Restored AI-found lead to the review queue",
    });
  });

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/leads/${leadId}`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────
// Cold-outreach drafting (Phase B.1).
//
// draftLeadEmail calls the cold-outreach skill for a chosen person on a lead
// and SAVES the {subject, body} draft onto the lead itself — there is no
// Artifact scope for a ProspectLead, so the draft lives on the row. The
// partner can then edit (saveLeadEmail) and send it (sendColdEmail) — which
// (D36) converts the lead straight into a Contact + Deal at stage "lead" with
// coldOutreachAt stamped, exactly like addToFunnel plus an email_sent
// Interaction. The deal then sits "awaiting reply" on the board until the
// partner marks it replied (markDealReplied → lead promotes to qualified).
// ──────────────────────────────────────────────────────────────────────

// Fence-strip + JSON parse, mirroring app/(app)/ingest/actions.ts.
function parseOutreachJSON(raw: string): { subject: string; body: string } {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
  }
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("The draft came back malformed — try again.");
  }
  const subject = typeof o.subject === "string" ? o.subject.trim() : "";
  const body = typeof o.body === "string" ? o.body.trim() : "";
  if (!subject || !body) throw new Error("The draft came back incomplete — try again.");
  return { subject, body };
}

export async function draftLeadEmail(
  leadId: string,
  personIndex: number,
): Promise<{ subject: string; body: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const lead = await prisma.prospectLead.findUnique({
    where: { id: leadId },
    include: { segment: { select: { name: true, description: true } } },
  });
  if (!lead) throw new Error("Lead not found");
  if (lead.status !== "pending")
    throw new Error("This lead can no longer be drafted to");

  const people = (lead.people as unknown as ProspectPerson[]) ?? [];
  const person = people[personIndex];
  if (!person) throw new Error("Pick a person to draft to");

  const partnerFirst = partnerLabel.split(/\s+/)[0] || partnerLabel;

  const context = [
    `Company: ${lead.companyName}`,
    lead.website ? `Website: ${lead.website}` : `Domain: ${lead.domain}`,
    lead.headquarters ? `Headquarters: ${lead.headquarters}` : null,
    lead.industryTags.length ? `Industry tags: ${lead.industryTags.join(", ")}` : null,
    "",
    `Why this company fits (the lead agent's rationale):`,
    lead.rationale,
    "",
    `Person to email: ${person.name}${person.title ? ` — ${person.title}` : ""}`,
    lead.segment?.name ? `Target segment: ${lead.segment.name}` : "Target segment: (unmatched)",
    lead.segment?.description ? `Segment description: ${lead.segment.description}` : null,
    "",
    `Sending partner: ${partnerFirst}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const raw = await generate({
    skill: "cold-outreach",
    context,
    intake: `Draft a short cold intro email from ${partnerFirst} to ${person.name} at ${lead.companyName}. One soft CTA (a brief intro call). Output JSON only.`,
    maxTokens: 1200,
  });

  const { subject, body } = parseOutreachJSON(raw);

  await prisma.$transaction(async (tx) => {
    await tx.prospectLead.update({
      where: { id: leadId },
      data: { outreachSubject: subject, outreachDraft: body, outreachPersonIndex: personIndex },
    });
    await writeAudit(tx, {
      actor: agentActor("cold-outreach"),
      action: "draft.lead.email",
      targetType: "ProspectLead",
      targetId: leadId,
      changes: { company: lead.companyName, person: person.name, subject },
    });
    await writeActivity(tx, {
      actor,
      type: "ai",
      target: lead.companyName,
      detail: `Drafted a cold outreach email to ${person.name}`,
      link: `/pipeline/leads/${leadId}`,
    });
  });

  revalidatePath(`/pipeline/leads/${leadId}`);
  return { subject, body };
}

// saveLeadEmail — persist partner edits to the draft (no status change).
export async function saveLeadEmail(
  leadId: string,
  input: { subject: string; body: string; personIndex: number },
): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) throw new Error("Subject and body can't be empty");

  const lead = await prisma.prospectLead.findUnique({
    where: { id: leadId },
    select: { status: true, companyName: true },
  });
  if (!lead) throw new Error("Lead not found");

  await prisma.$transaction(async (tx) => {
    await tx.prospectLead.update({
      where: { id: leadId },
      data: { outreachSubject: subject, outreachDraft: body, outreachPersonIndex: input.personIndex },
    });
    await writeAudit(tx, {
      actor,
      action: "update.prospectLead.draft",
      targetType: "ProspectLead",
      targetId: leadId,
      changes: { subject },
    });
  });

  revalidatePath(`/pipeline/leads/${leadId}`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────
// sendColdEmail — the partner sends the (edited) cold-outreach draft (D36).
//
// Does the SAME conversion work as addToFunnel (create Contact + Deal at stage
// "lead", flip the ProspectLead to "added") PLUS: stamps Deal.coldOutreachAt,
// logs an email_sent Interaction on the new Contact, and stamps the lead's
// outreachSentAt. The person + industry are derived from the lead (the saved
// outreachPersonIndex; industry best-matched from industryTags) rather than
// passed in, unlike addToFunnel. Requires a saved draft + person index.
//
// Four audit rows (create.contact, create.deal, create.interaction,
// update.prospectLead.added) + one activity row, all in one transaction.
// ──────────────────────────────────────────────────────────────────────
export async function sendColdEmail(leadId: string): Promise<{ dealId: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const lead = await prisma.prospectLead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error("Lead not found");
  if (lead.status !== "pending") throw new Error("This lead has already been reviewed");
  if (!lead.outreachDraft?.trim()) throw new Error("Draft the email before sending");
  if (lead.outreachPersonIndex == null) throw new Error("Pick a person before sending");
  const priorStatus = lead.status;

  const people = (lead.people as unknown as ProspectPerson[]) ?? [];
  const person = people[lead.outreachPersonIndex];
  if (!person) throw new Error("Pick a person to add");
  const email = person.email?.trim();
  if (!email) throw new Error("That person has no email — pick someone with an email to add them as a contact");

  // Best-match industry from the lead's free-form tags; fall back to "other".
  const matchedTag = lead.industryTags.find((t) => VALID_INDUSTRIES.includes(t.toLowerCase() as Industry));
  const industry: Industry = (matchedTag?.toLowerCase() as Industry) ?? "other";

  const partnerLeadId = session.user.partnerId;
  const now = new Date();
  const closeTargetDate = new Date(now);
  closeTargetDate.setDate(closeTargetDate.getDate() + 90);

  const subject = lead.outreachSubject?.trim() || "Cold outreach email";

  let dealId: string;
  try {
    dealId = await prisma.$transaction(async (tx) => {
      const contact = await tx.contact.create({
        data: {
          name: person.name,
          title: person.title || "—",
          company: lead.companyName,
          email,
          industry,
          source: "AI Found Lead",
          sourceCategory: "outbound",
          domain: lead.domain,
          lastTouchAt: now,
          partnerLeadId,
        },
      });

      const deal = await tx.deal.create({
        data: {
          company: lead.companyName,
          stage: "lead",
          valueEstimate: 0,
          industry,
          closeTargetDate,
          lastTouchAt: now,
          stageEnteredAt: now,
          coldOutreachAt: now,
          contactId: contact.id,
          partnerLeadId,
        },
      });

      await tx.interaction.create({
        data: {
          contactId: contact.id,
          type: "email_sent",
          date: now,
          summary: subject,
          loggedBy: partnerLabel,
          channel: "email",
        },
      });

      await tx.prospectLead.update({
        where: { id: leadId },
        data: {
          status: "added",
          convertedContactId: contact.id,
          convertedDealId: deal.id,
          reviewedBy: partnerLabel,
          reviewedAt: now,
          outreachSentAt: now,
        },
      });

      await writeAudit(tx, {
        actor,
        action: "create.contact",
        targetType: "Contact",
        targetId: contact.id,
        changes: { name: contact.name, company: contact.company, fromProspectLead: leadId },
      });
      await writeAudit(tx, {
        actor,
        action: "create.deal",
        targetType: "Deal",
        targetId: deal.id,
        changes: { company: deal.company, stage: deal.stage, coldOutreach: true, fromProspectLead: leadId },
      });
      await writeAudit(tx, {
        actor,
        action: "create.interaction",
        targetType: "Interaction",
        targetId: contact.id,
        changes: { type: "email_sent", subject, person: person.name },
      });
      await writeAudit(tx, {
        actor,
        action: "update.prospectLead.added",
        targetType: "ProspectLead",
        targetId: leadId,
        changes: { status: { before: priorStatus, after: "added" }, contactId: contact.id, dealId: deal.id, coldOutreach: true },
      });
      await writeActivity(tx, {
        actor,
        type: "touch",
        target: lead.companyName,
        detail: `Sent cold outreach to ${person.name} and added to the pipeline`,
        link: `/pipeline/${deal.id}`,
      });

      return deal.id;
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      throw new Error(`${person.name} is already in the pipeline (duplicate email)`);
    }
    throw err;
  }

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/leads/${leadId}`);
  revalidatePath("/contacts");
  revalidatePath("/dashboard");
  return { dealId };
}
