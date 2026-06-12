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
import { apolloMatchPerson, normalizeDomain } from "@/lib/apollo";
import type { Industry } from "@/lib/generated/prisma/enums";
import type { ProspectLead as ProspectLeadModel } from "@/lib/generated/prisma/client";
import type { ProspectPerson } from "@/lib/types";

const VALID_INDUSTRIES: Industry[] = ["automotive", "motorsport", "engineering", "construction", "other"];

// ──────────────────────────────────────────────────────────────────────
// Profile fields an enriched lead carries onto the Deal it becomes, so the
// deal starts pre-profiled instead of being re-enriched. Positioning fields
// (fitSummary/likelyNeeds/salesAngle) stay on the lead — deals have no
// positioning fields yet. employeeCount ← the lead's employeeEstimate.
// ──────────────────────────────────────────────────────────────────────
function leadProfileDealData(lead: ProspectLeadModel) {
  return {
    website: lead.website ?? undefined,
    domain: lead.domain.includes(".") ? lead.domain : undefined,
    linkedinUrl: lead.linkedinUrl ?? undefined,
    instagramUrl: lead.instagramUrl ?? undefined,
    revenueEstimate: lead.revenueEstimate ?? undefined,
    employeeCount: lead.employeeEstimate ?? undefined,
    companySize: lead.companySize ?? undefined,
    headquarters: lead.headquarters ?? undefined,
    founded: lead.founded ?? undefined,
    ownership: lead.ownership ?? undefined,
    description: lead.description ?? undefined,
    subIndustry: lead.subIndustry ?? undefined,
    companyKeyFacts: lead.companyKeyFacts,
    currentSystems: lead.currentSystems,
    painPoints: lead.painPoints,
    enrichedAt: lead.enrichedAt ?? undefined,
  };
}

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
  // Promotable only from "pending". A cold-emailed lead (status "contacted")
  // exits via markContactedLeadReplied / setAsideContactedLead instead.
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
          source: lead.origin === "imported" ? "Imported" : "AI Found Lead",
          sourceCategory: lead.origin === "imported" ? "imported" : "ai_found",
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
          ...leadProfileDealData(lead),
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
    select: { status: true, companyName: true, domain: true, people: true },
  });
  if (!lead) throw new Error("Lead not found");
  if (lead.status !== "ghost") throw new Error("Only set-aside leads can be restored");

  // Moving a filtered lead up to AI Found makes it actionable, so reveal the
  // primary person's work email now (mirrors the on-pass reveal in discovery).
  // The primary is people[0]; only reveal if it has no email yet.
  const people = (lead.people as unknown as ProspectPerson[]) ?? [];
  const primary = people[0];
  let revealedPrimary: ProspectPerson | null = null;
  if (primary && !primary.email?.trim()) {
    try {
      let revealed;
      if (primary.apolloPersonId) {
        revealed = await apolloMatchPerson({ id: primary.apolloPersonId });
      } else {
        const parts = (primary.name ?? "").trim().split(/\s+/);
        const firstName = parts[0] || undefined;
        const lastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
        revealed =
          firstName && lastName
            ? await apolloMatchPerson({ firstName, lastName, domain: lead.domain })
            : await apolloMatchPerson({ domain: lead.domain });
      }
      const email = revealed.email?.trim();
      if (email) {
        revealedPrimary = {
          ...primary,
          email,
          emailRevealed: true,
          name: revealed.name ?? primary.name,
          title: revealed.title ?? primary.title,
        };
      }
    } catch (err) {
      // Out of credits (or any reveal failure): restore the lead anyway; the
      // partner can reveal the email later via the on-demand button.
      if (!(err instanceof Error && err.message.startsWith("APOLLO_CREDITS"))) throw err;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.prospectLead.update({
      where: { id: leadId },
      data: {
        status: "pending",
        reviewedAt: null,
        ...(revealedPrimary
          ? {
              people: people.map((p, i) =>
                i === 0 ? revealedPrimary : p,
              ) as unknown as object,
            }
          : {}),
      },
    });
    await writeAudit(tx, {
      actor,
      action: "update.prospectLead.restore",
      targetType: "ProspectLead",
      targetId: leadId,
      changes: { status: { before: "ghost", after: "pending" } },
    });
    if (revealedPrimary) {
      await writeAudit(tx, {
        actor: agentActor("lead-discovery"),
        action: "reveal.apollo.email",
        targetType: "ProspectLead",
        targetId: leadId,
        changes: { domain: lead.domain, via: "restore", name: revealedPrimary.name, title: revealedPrimary.title },
      });
    }
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
// revealLeadPersonEmail — spend 1 Apollo credit to reveal one candidate's work
// email on demand (PART D, hybrid reveal policy).
//
// Loads the lead, takes people[personIndex], calls apolloMatchPerson (preferring
// the stored apolloPersonId, else name-split + domain), then sets that person's
// email + emailRevealed:true in the people Json. Writes a "reveal.apollo.email"
// AuditLog row (counted by getApolloCreditsThisMonth) + an Activity row, in one
// transaction. Surfaces APOLLO_CREDITS errors as a friendly "out of credits" msg.
// ──────────────────────────────────────────────────────────────────────

export async function revealLeadPersonEmail(
  leadId: string,
  personIndex: number,
): Promise<{ email: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const lead = await prisma.prospectLead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error("Lead not found");

  const people = (lead.people as unknown as ProspectPerson[]) ?? [];
  const person = people[personIndex];
  if (!person) throw new Error("Pick a person to reveal");
  if (person.email?.trim()) return { email: person.email.trim() }; // already revealed

  // Reveal: prefer the stored Apollo person id (exact match); else name + domain.
  let revealed;
  try {
    if (person.apolloPersonId) {
      revealed = await apolloMatchPerson({ id: person.apolloPersonId });
    } else {
      const parts = (person.name ?? "").trim().split(/\s+/);
      const firstName = parts[0] || undefined;
      const lastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
      revealed =
        firstName && lastName
          ? await apolloMatchPerson({ firstName, lastName, domain: lead.domain })
          : await apolloMatchPerson({ domain: lead.domain });
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("APOLLO_CREDITS")) {
      throw new Error("You're out of Apollo credits for this period — top up to reveal more emails.");
    }
    throw err;
  }

  const email = revealed.email?.trim();
  if (!email) throw new Error("Apollo couldn't find a verified email for this person.");

  // Merge the revealed email back into the people array (preserve order/shape).
  const nextPeople = people.map((p, i) =>
    i === personIndex
      ? {
          ...p,
          email,
          emailRevealed: true,
          name: revealed.name ?? p.name,
          title: revealed.title ?? p.title,
        }
      : p,
  );

  await prisma.$transaction(async (tx) => {
    await tx.prospectLead.update({
      where: { id: leadId },
      data: { people: nextPeople as unknown as object },
    });
    await writeAudit(tx, {
      actor: agentActor("lead-discovery"),
      action: "reveal.apollo.email",
      targetType: "ProspectLead",
      targetId: leadId,
      changes: { domain: lead.domain, name: person.name, title: person.title },
    });
    await writeActivity(tx, {
      actor,
      type: "ai",
      target: lead.companyName,
      detail: `Revealed ${person.name}'s email (Apollo)`,
      link: `/pipeline/leads/${leadId}`,
    });
  });

  revalidatePath(`/pipeline/leads/${leadId}`);
  return { email };
}

// ──────────────────────────────────────────────────────────────────────
// setLeadWebsite — let a partner paste a company's website on a lead Apollo
// couldn't resolve (small firms aren't in Apollo). Stores the website AND the
// derived bare domain, so the next Enrich / Find more people has a real domain
// to work against. Validates a host with a dot; everything else is rejected.
// ──────────────────────────────────────────────────────────────────────
export async function setLeadWebsite(
  leadId: string,
  website: string,
): Promise<{ website: string; domain: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const domain = normalizeDomain(website);
  if (!domain || !domain.includes(".")) {
    throw new Error("Enter a valid website, e.g. acme.com");
  }
  const cleanWebsite = `https://${domain}`;

  const lead = await prisma.prospectLead.findUnique({ where: { id: leadId }, select: { id: true, companyName: true } });
  if (!lead) throw new Error("Lead not found");

  await prisma.$transaction(async (tx) => {
    // Set the domain too — but not if another lead already owns it (unique).
    try {
      await tx.prospectLead.update({ where: { id: leadId }, data: { website: cleanWebsite, domain } });
    } catch {
      await tx.prospectLead.update({ where: { id: leadId }, data: { website: cleanWebsite } });
    }
    await writeAudit(tx, {
      actor,
      action: "set.website.prospectLead",
      targetType: "ProspectLead",
      targetId: leadId,
      changes: { website: cleanWebsite, domain },
    });
  });

  revalidatePath(`/pipeline/leads/${leadId}`);
  return { website: cleanWebsite, domain };
}

// ──────────────────────────────────────────────────────────────────────
// Cold-outreach drafting (Phase B.1).
//
// draftLeadEmail calls the cold-outreach skill for a chosen person on a lead
// and SAVES the {subject, body} draft onto the lead itself — there is no
// Artifact scope for a ProspectLead, so the draft lives on the row. The
// partner edits (saveLeadEmail), sends from their own inbox, then files it
// one of two ways:
//   sendColdEmail            — straight onto the board: Contact + Deal at
//     stage "lead" with coldOutreachAt stamped (awaiting reply there;
//     markDealReplied promotes it to qualified).
//   sendColdEmailToColdFunnel — no deal yet: the lead moves to the pipeline's
//     "Cold email sent" tab (status contacted) until it replies
//     (markContactedLeadReplied → deal at "qualified") or is set aside
//     (setAsideContactedLead → ghost).
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
    lead.fitSummary ? `\nHow we fit them (positioning): ${lead.fitSummary}` : null,
    lead.likelyNeeds.length ? `Likely needs: ${lead.likelyNeeds.join("; ")}` : null,
    lead.salesAngle ? `Suggested angle: ${lead.salesAngle}` : null,
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

// ──────────────────────────────────────────────────────────────────────
// sendColdEmailToColdFunnel — the partner sent the cold email but does NOT
// want the lead on the board yet (it would overfill). The lead moves to the
// pipeline's "Cold email sent" tab (status → contacted) and stays a
// ProspectLead — no Contact/Deal until the prospect replies
// (markContactedLeadReplied) or is set aside (setAsideContactedLead).
// ──────────────────────────────────────────────────────────────────────
export async function sendColdEmailToColdFunnel(leadId: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const lead = await prisma.prospectLead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error("Lead not found");
  if (lead.status !== "pending") throw new Error("This lead has already been reviewed");
  if (!lead.outreachDraft?.trim()) throw new Error("Draft the email before sending");
  if (lead.outreachPersonIndex == null) throw new Error("Pick a person before sending");

  const people = (lead.people as unknown as ProspectPerson[]) ?? [];
  const person = people[lead.outreachPersonIndex];
  if (!person) throw new Error("Pick a person before sending");

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.prospectLead.update({
      where: { id: leadId },
      data: {
        status: "contacted",
        outreachSentAt: now,
        // Sending the email claims the lead for the sender unless someone
        // already owns it.
        ...(lead.claimedById
          ? {}
          : { claimedById: session.user!.partnerId, claimedBy: partnerLabel, claimedAt: now }),
      },
    });
    await writeAudit(tx, {
      actor,
      action: "update.prospectLead.contacted",
      targetType: "ProspectLead",
      targetId: leadId,
      changes: { status: { before: "pending", after: "contacted" }, person: person.name },
    });
    await writeActivity(tx, {
      actor,
      type: "touch",
      target: lead.companyName,
      detail: `Sent cold outreach to ${person.name} — watching for a reply`,
      link: `/pipeline/leads/${leadId}`,
    });
  });

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/leads/${leadId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────
// markContactedLeadReplied — a cold-emailed lead (status "contacted") wrote
// back. NOW it earns a board spot: same conversion as sendColdEmail but the
// deal opens at stage "qualified" (the reply IS the qualification), with
// coldOutreachAt back-dated to when the email went out and outreachRepliedAt
// stamped now. Logs both sides of the exchange on the new Contact.
// ──────────────────────────────────────────────────────────────────────
export async function markContactedLeadReplied(leadId: string): Promise<{ dealId: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const lead = await prisma.prospectLead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error("Lead not found");
  if (lead.status !== "contacted") throw new Error("This lead isn’t awaiting a cold-outreach reply");
  if (lead.outreachPersonIndex == null) throw new Error("This lead has no outreach person on record");

  const people = (lead.people as unknown as ProspectPerson[]) ?? [];
  const person = people[lead.outreachPersonIndex];
  if (!person) throw new Error("This lead has no outreach person on record");
  const email = person.email?.trim();
  if (!email) throw new Error("That person has no email on record");

  const matchedTag = lead.industryTags.find((t) => VALID_INDUSTRIES.includes(t.toLowerCase() as Industry));
  const industry: Industry = (matchedTag?.toLowerCase() as Industry) ?? "other";

  // The claimer owns the deal; fall back to whoever marks it replied. A stale
  // claimedById (e.g. after a reseed) falls back too.
  let partnerLeadId = session.user.partnerId;
  if (lead.claimedById) {
    const claimer = await prisma.partner.findUnique({ where: { id: lead.claimedById }, select: { id: true } });
    if (claimer) partnerLeadId = claimer.id;
  }

  const now = new Date();
  const sentAt = lead.outreachSentAt ?? now;
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
          source: lead.origin === "imported" ? "Imported" : "AI Found Lead",
          sourceCategory: lead.origin === "imported" ? "imported" : "ai_found",
          domain: lead.domain,
          lastTouchAt: now,
          partnerLeadId,
        },
      });

      const deal = await tx.deal.create({
        data: {
          company: lead.companyName,
          stage: "qualified",
          valueEstimate: 0,
          industry,
          closeTargetDate,
          lastTouchAt: now,
          stageEnteredAt: now,
          coldOutreachAt: sentAt,
          outreachRepliedAt: now,
          contactId: contact.id,
          partnerLeadId,
          ...leadProfileDealData(lead),
        },
      });

      await tx.interaction.create({
        data: {
          contactId: contact.id,
          type: "email_sent",
          date: sentAt,
          summary: subject,
          loggedBy: lead.claimedBy ?? partnerLabel,
          channel: "email",
        },
      });
      await tx.interaction.create({
        data: {
          contactId: contact.id,
          type: "email_received",
          date: now,
          summary: "Prospect replied to cold outreach",
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
        changes: { company: deal.company, stage: deal.stage, coldOutreach: true, replied: true, fromProspectLead: leadId },
      });
      await writeAudit(tx, {
        actor,
        action: "update.prospectLead.added",
        targetType: "ProspectLead",
        targetId: leadId,
        changes: { status: { before: "contacted", after: "added" }, contactId: contact.id, dealId: deal.id },
      });
      await writeActivity(tx, {
        actor,
        type: "status",
        target: lead.companyName,
        detail: `${person.name} replied to cold outreach — added to the pipeline as Qualified`,
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

// ──────────────────────────────────────────────────────────────────────
// setAsideContactedLead — a cold-emailed lead never wrote back. Move it off
// the Cold email sent tab into Filtered (status → ghost). Restorable via the
// usual restoreLead, which puts it back in the New lane.
// ──────────────────────────────────────────────────────────────────────
export async function setAsideContactedLead(leadId: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const lead = await prisma.prospectLead.findUnique({
    where: { id: leadId },
    select: { status: true, companyName: true },
  });
  if (!lead) throw new Error("Lead not found");
  if (lead.status !== "contacted") throw new Error("Only cold-emailed leads can be set aside here");

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
      changes: { status: { before: "contacted", after: "ghost" }, reason: "no reply to cold outreach" },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: lead.companyName,
      detail: "No reply to cold outreach — set aside",
    });
  });

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/leads/${leadId}`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────
// claimLead — claim a lead for yourself or assign it to another partner.
// partnerId undefined = claim for the signed-in partner (the card's one-click
// Claim); null = release the claim. Works on pending/contacted leads —
// added/ghost ones are already resolved.
// ──────────────────────────────────────────────────────────────────────
export async function claimLead(leadId: string, partnerId?: string | null): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);
  if (partnerId === undefined) partnerId = session.user.partnerId;

  const lead = await prisma.prospectLead.findUnique({
    where: { id: leadId },
    select: { status: true, companyName: true, claimedBy: true },
  });
  if (!lead) throw new Error("Lead not found");
  if (lead.status === "added" || lead.status === "ghost")
    throw new Error("This lead has already been reviewed");

  let claim: { claimedById: string | null; claimedBy: string | null; claimedAt: Date | null };
  let detail: string;
  if (partnerId) {
    const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true, name: true } });
    if (!partner) throw new Error("Partner not found");
    claim = { claimedById: partner.id, claimedBy: partner.name, claimedAt: new Date() };
    detail =
      partner.id === session.user.partnerId
        ? `Claimed the lead`
        : `Assigned the lead to ${partner.name}`;
  } else {
    claim = { claimedById: null, claimedBy: null, claimedAt: null };
    detail = "Released the lead claim";
  }

  await prisma.$transaction(async (tx) => {
    await tx.prospectLead.update({ where: { id: leadId }, data: claim });
    await writeAudit(tx, {
      actor,
      action: "update.prospectLead.claim",
      targetType: "ProspectLead",
      targetId: leadId,
      changes: { claimedBy: { before: lead.claimedBy ?? null, after: claim.claimedBy } },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: lead.companyName,
      detail,
      link: `/pipeline/leads/${leadId}`,
    });
  });

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/leads/${leadId}`);
  return { ok: true };
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
          source: lead.origin === "imported" ? "Imported" : "AI Found Lead",
          sourceCategory: lead.origin === "imported" ? "imported" : "ai_found",
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
          ...leadProfileDealData(lead),
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
