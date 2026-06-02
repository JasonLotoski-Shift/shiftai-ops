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
import type { Industry, LeadSource } from "@/lib/generated/prisma/enums";

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
  "other",
];

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
};

// Fast capture — a mutation, not a generative action. Mirrors the lineup item
// "Add contact" (ROADMAP A4). One Contact row + one AuditLog + one Activity,
// all in a single transaction.
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
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
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

  // Default the partner lead to whoever is signed in; allow an explicit
  // override (the form offers the roster). Validate the FK exists.
  const partnerLeadId = input.partnerLeadId?.trim() || session.user.partnerId;
  const partnerLead = await prisma.partner.findUnique({
    where: { id: partnerLeadId },
    select: { id: true },
  });
  if (!partnerLead) throw new Error("Partner lead not found");

  const now = new Date();

  const contact = await prisma.$transaction(async (tx) => {
    const created = await tx.contact.create({
      data: {
        name,
        title: input.title.trim() || "—",
        company,
        email,
        phone: input.phone?.trim() || null,
        industry: input.industry as Industry,
        source: input.source.trim() || "Manual entry",
        sourceCategory,
        notes: input.notes?.trim() || null,
        // A brand-new contact counts as touched now — keeps it out of the
        // "cold 30d+" bucket on the day it's added.
        lastTouchAt: now,
        partnerLeadId,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.contact",
      targetType: "Contact",
      targetId: created.id,
      changes: { name, company, email, industry: input.industry, partnerLeadId },
    });

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
