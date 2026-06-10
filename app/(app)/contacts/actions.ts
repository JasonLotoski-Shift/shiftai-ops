"use server";

// Contacts-list–scoped server actions (creation lives here; per-contact
// mutations live in contacts/[id]/actions.ts).
//
// Canonical mutation recipe (see app/(app)/dashboard/actions.ts header):
// mutate + writeAudit [+ writeActivity] in one $transaction, then revalidate.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { createContactTx } from "@/lib/contacts";
import type {
  Industry,
  LeadSource,
  PreferredChannel,
  RelationshipStrength,
} from "@/lib/generated/prisma/enums";

const VALID_INDUSTRIES: Industry[] = [
  "automotive",
  "motorsport",
  "engineering",
  "construction",
  "other",
];

const VALID_LEAD_SOURCES: LeadSource[] = [
  "intro",
  "outbound",
  "referral",
  "event",
  "inbound",
  "ai_found",
  "imported",
  "other",
];

const VALID_PREFERRED_CHANNELS: PreferredChannel[] = ["email", "call", "text", "linkedin"];
const VALID_RELATIONSHIP_STRENGTHS: RelationshipStrength[] = ["cold", "warm", "strong"];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type CreateContactInput = {
  name: string;
  title: string;
  company: string;
  email: string;
  phone?: string;
  industry: string;
  source: string;
  /** Structured bucket for color-coding lead cards (optional). */
  sourceCategory?: string;
  notes?: string;
  /** Partner who owns the relationship. Defaults to the signed-in partner. */
  partnerLeadId?: string;
  // Reach & personal (D40) — all optional.
  linkedinUrl?: string;
  location?: string;
  timezone?: string;
  mobilePhone?: string;
  preferredChannel?: string;
  relationshipStrength?: string;
  importantDates?: string[];
};

// createContactTx (the transaction-composable core of createContact) lives in
// lib/contacts.ts — NOT here. A "use server" export is a client-invocable
// endpoint, and the tx helper carries no auth() guard by design (the caller
// owns auth); keeping it in a plain lib module keeps it off the wire.

// Fast capture — a mutation, not a generative action. Mirrors the lineup item
// "Add contact" (ROADMAP A4). One Contact row + one AuditLog + one Activity,
// all in a single transaction (the row + audit via createContactTx).
export async function createContact(input: CreateContactInput) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const name = input.name.trim();
  const company = input.company.trim();
  const email = input.email.trim();
  if (!name) throw new Error("Name is required");
  if (!company) throw new Error("Company is required");
  if (!email) throw new Error("Email is required");
  if (!EMAIL_RE.test(email)) {
    throw new Error(`Invalid email: ${email}`);
  }
  if (!VALID_INDUSTRIES.includes(input.industry as Industry)) {
    throw new Error(`Invalid industry: ${input.industry}`);
  }
  // Optional structured source bucket — validated if supplied, else left null.
  const sourceCategory =
    input.sourceCategory && VALID_LEAD_SOURCES.includes(input.sourceCategory as LeadSource)
      ? (input.sourceCategory as LeadSource)
      : null;
  // Optional reach/personal selects — same validated-or-null pattern.
  const preferredChannel =
    input.preferredChannel &&
    VALID_PREFERRED_CHANNELS.includes(input.preferredChannel as PreferredChannel)
      ? (input.preferredChannel as PreferredChannel)
      : null;
  const relationshipStrength =
    input.relationshipStrength &&
    VALID_RELATIONSHIP_STRENGTHS.includes(input.relationshipStrength as RelationshipStrength)
      ? (input.relationshipStrength as RelationshipStrength)
      : null;

  // Default the partner lead to whoever is signed in; allow an explicit
  // override (the form offers the roster). Validate the FK exists.
  const partnerLeadId = input.partnerLeadId?.trim() || session.user.partnerId;
  const partnerLead = await prisma.partner.findUnique({
    where: { id: partnerLeadId },
    select: { id: true },
  });
  if (!partnerLead) throw new Error("Partner lead not found");

  const contact = await prisma.$transaction(async (tx) => {
    const created = await createContactTx(
      tx,
      {
        name,
        email,
        title: input.title.trim() || "—",
        company,
        phone: input.phone,
        industry: input.industry as Industry,
        source: input.source.trim() || "Manual entry",
        sourceCategory,
        notes: input.notes,
        partnerLeadId,
        linkedinUrl: input.linkedinUrl,
        location: input.location,
        timezone: input.timezone,
        mobilePhone: input.mobilePhone,
        preferredChannel,
        relationshipStrength,
        importantDates: input.importantDates,
      },
      partnerLabel,
      session.user.partnerId,
    );

    await writeActivity(tx, {
      actor,
      type: "touch",
      target: name,
      detail: `Added contact — ${input.title.trim() || "contact"} at ${company}`,
      link: `/contacts/${created.id}`,
    });

    return created;
  });

  revalidatePath("/contacts");
  return { id: contact.id };
}

// ──────────────────────────────────────────────────────────────────────
// updateContact — edit the contact's facts from the Edit details modal.
// Only the fields supplied change; undefined leaves a field untouched, an
// empty string clears the optional ones. Email is validated, never cleared
// (it's the match key everywhere). relationshipStrength is partner judgment
// — this manual path is the ONLY way it gets set.
// ──────────────────────────────────────────────────────────────────────

export type UpdateContactInput = {
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  notes?: string;
  linkedinUrl?: string;
  location?: string;
  timezone?: string;
  mobilePhone?: string;
  preferredChannel?: string; // "" clears
  relationshipStrength?: string; // "" clears
  importantDates?: string[];
};

export async function updateContact(contactId: string, input: UpdateContactInput) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const existing = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      name: true,
      title: true,
      company: true,
      email: true,
      phone: true,
      notes: true,
      linkedinUrl: true,
      location: true,
      timezone: true,
      mobilePhone: true,
      preferredChannel: true,
      relationshipStrength: true,
      importantDates: true,
    },
  });
  if (!existing) throw new Error("Contact not found");

  const data: Record<string, unknown> = {};

  if (input.title !== undefined) data.title = input.title.trim() || "—";
  if (input.company !== undefined) {
    const company = input.company.trim();
    if (!company) throw new Error("Company is required");
    data.company = company;
  }
  if (input.email !== undefined) {
    const email = input.email.trim();
    if (!email) throw new Error("Email is required");
    if (!EMAIL_RE.test(email)) throw new Error(`Invalid email: ${email}`);
    data.email = email;
  }
  // Optional free-text scalars — trim, empty clears.
  if (input.phone !== undefined) data.phone = input.phone.trim() || null;
  if (input.notes !== undefined) data.notes = input.notes.trim() || null;
  if (input.linkedinUrl !== undefined) data.linkedinUrl = input.linkedinUrl.trim() || null;
  if (input.location !== undefined) data.location = input.location.trim() || null;
  if (input.timezone !== undefined) data.timezone = input.timezone.trim() || null;
  if (input.mobilePhone !== undefined) data.mobilePhone = input.mobilePhone.trim() || null;
  // Enum selects — validated if set, "" clears. Defense in depth on the <select>s.
  if (input.preferredChannel !== undefined) {
    if (
      input.preferredChannel &&
      !VALID_PREFERRED_CHANNELS.includes(input.preferredChannel as PreferredChannel)
    ) {
      throw new Error(`Invalid preferred channel: ${input.preferredChannel}`);
    }
    data.preferredChannel = (input.preferredChannel as PreferredChannel) || null;
  }
  if (input.relationshipStrength !== undefined) {
    if (
      input.relationshipStrength &&
      !VALID_RELATIONSHIP_STRENGTHS.includes(input.relationshipStrength as RelationshipStrength)
    ) {
      throw new Error(`Invalid relationship strength: ${input.relationshipStrength}`);
    }
    data.relationshipStrength = (input.relationshipStrength as RelationshipStrength) || null;
  }
  if (input.importantDates !== undefined) {
    data.importantDates = input.importantDates.map((d) => d.trim()).filter(Boolean);
  }

  // Build a before/after diff of what actually changed; drop no-op keys.
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    const prev = existing[key as keyof typeof existing];
    const next = data[key];
    const changed = Array.isArray(prev)
      ? JSON.stringify(prev) !== JSON.stringify(next)
      : prev !== next;
    if (changed) {
      before[key] = prev;
      after[key] = next;
    } else {
      delete data[key];
    }
  }

  if (Object.keys(data).length === 0) {
    return { id: contactId, updated: 0 };
  }

  await prisma.$transaction(async (tx) => {
    await tx.contact.update({ where: { id: contactId }, data });

    await writeAudit(tx, {
      actor,
      action: "update.contact",
      targetType: "Contact",
      targetId: contactId,
      changes: { before, after },
    });
  });

  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/contacts");
  return { id: contactId, updated: Object.keys(data).length };
}
