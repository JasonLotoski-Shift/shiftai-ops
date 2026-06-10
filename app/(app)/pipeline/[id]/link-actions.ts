"use server";

// Deal ↔ Contact link mutations — the buying committee on the deal page.
//
// Every ContactLink write goes through lib/contact-links.ts (the single
// write path — never touch contactLink rows directly). These actions own
// what the helpers don't: auth, the transaction, the audit row, and
// revalidation. Canonical mutation recipe (see shiftai-ops/CLAUDE.md
// "Wire a Quick Action end-to-end").

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";
import { linkContact, unlinkContact } from "@/lib/contact-links";
import type {
  RelationshipType,
  StakeholderRole,
} from "@/lib/generated/prisma/enums";

const VALID_RELATIONSHIPS: RelationshipType[] = [
  "works_there",
  "introduced_us",
  "advisor",
  "other",
];
const VALID_ROLES: StakeholderRole[] = [
  "decision_maker",
  "champion",
  "influencer",
  "budget_holder",
  "technical",
  "gatekeeper",
  "blocker",
  "other",
];

// The client handed to a prisma.$transaction(async (tx) => …) callback
// (mirrors lib/contact-links.ts).
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function validateRelationship(r: string): RelationshipType {
  if (!VALID_RELATIONSHIPS.includes(r as RelationshipType)) {
    throw new Error(`Invalid relationship: ${r}`);
  }
  return r as RelationshipType;
}

function validateRole(r: string | null | undefined): StakeholderRole | null {
  if (r === null || r === undefined || r === "") return null;
  if (!VALID_ROLES.includes(r as StakeholderRole)) {
    throw new Error(`Invalid role: ${r}`);
  }
  return r as StakeholderRole;
}

/**
 * One primary per deal: when a link is being marked primary, drop the star
 * from every other link on the deal — via the helper, never a direct write.
 * Fields the helper isn't given are left untouched, so relationship is passed
 * back unchanged.
 */
async function demoteOtherPrimaries(tx: Tx, dealId: string, keepContactId: string, addedBy: string) {
  const primaries = await tx.contactLink.findMany({
    where: { dealId, isPrimary: true, contactId: { not: keepContactId } },
    select: { contactId: true, relationship: true },
  });
  for (const p of primaries) {
    await linkContact(tx, {
      contactId: p.contactId,
      dealId,
      relationship: p.relationship,
      isPrimary: false,
      addedBy,
    });
  }
}

export async function addDealContactLink(
  dealId: string,
  input: {
    contactId: string;
    relationship: string;
    role?: string | null;
    roleLabel?: string | null;
    isPrimary?: boolean;
    notes?: string | null;
  },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const relationship = validateRelationship(input.relationship);
  const role = validateRole(input.role);

  const [deal, contact] = await Promise.all([
    prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, company: true } }),
    prisma.contact.findUnique({ where: { id: input.contactId }, select: { id: true, name: true } }),
  ]);
  if (!deal) throw new Error("Deal not found");
  if (!contact) throw new Error("Contact not found");

  const result = await prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await demoteOtherPrimaries(tx, dealId, contact.id, partnerLabel);
    }
    const link = await linkContact(tx, {
      contactId: contact.id,
      dealId,
      relationship,
      role,
      roleLabel: input.roleLabel?.trim() || null,
      isPrimary: input.isPrimary ?? false,
      notes: input.notes?.trim() || null,
      addedBy: partnerLabel,
    });
    await writeAudit(tx, {
      actor,
      // The helper upserts per person+company — a re-add updates in place.
      action: link.created ? "create.contactLink" : "update.contactLink",
      targetType: "ContactLink",
      targetId: link.linkId,
      changes: {
        dealId,
        contactId: contact.id,
        contactName: contact.name,
        relationship,
        role,
        isPrimary: input.isPrimary ?? false,
      },
    });
    return link;
  });

  revalidatePath(`/pipeline/${dealId}`);
  revalidatePath(`/contacts/${contact.id}`);
  return { ok: true as const, linkId: result.linkId, created: result.created };
}

export async function updateDealContactLink(
  linkId: string,
  input: {
    relationship?: string;
    role?: string | null;
    roleLabel?: string | null;
    isPrimary?: boolean;
    notes?: string | null;
  },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const existing = await prisma.contactLink.findUnique({
    where: { id: linkId },
    select: {
      id: true,
      dealId: true,
      contactId: true,
      relationship: true,
      role: true,
      roleLabel: true,
      isPrimary: true,
      notes: true,
    },
  });
  if (!existing) throw new Error("Link not found");
  if (!existing.dealId) throw new Error("This link belongs to a client, not a deal");
  const dealId = existing.dealId;

  const relationship =
    input.relationship !== undefined
      ? validateRelationship(input.relationship)
      : existing.relationship;
  const role = input.role !== undefined ? validateRole(input.role) : existing.role;

  await prisma.$transaction(async (tx) => {
    if (input.isPrimary === true) {
      await demoteOtherPrimaries(tx, dealId, existing.contactId, partnerLabel);
    }
    // Same pair → the helper updates the existing row in place.
    await linkContact(tx, {
      contactId: existing.contactId,
      dealId,
      relationship,
      role,
      ...(input.roleLabel !== undefined ? { roleLabel: input.roleLabel?.trim() || null } : {}),
      ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      addedBy: partnerLabel,
    });
    await writeAudit(tx, {
      actor,
      action: "update.contactLink",
      targetType: "ContactLink",
      targetId: linkId,
      changes: {
        dealId,
        contactId: existing.contactId,
        relationship: { before: existing.relationship, after: relationship },
        role: { before: existing.role, after: role },
        ...(input.isPrimary !== undefined
          ? { isPrimary: { before: existing.isPrimary, after: input.isPrimary } }
          : {}),
      },
    });
  });

  revalidatePath(`/pipeline/${dealId}`);
  revalidatePath(`/contacts/${existing.contactId}`);
  return { ok: true as const };
}

export async function removeDealContactLink(linkId: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const existing = await prisma.contactLink.findUnique({
    where: { id: linkId },
    select: { id: true, dealId: true, contactId: true, relationship: true, role: true, isPrimary: true },
  });
  if (!existing) throw new Error("Link not found");
  if (!existing.dealId) throw new Error("This link belongs to a client, not a deal");
  const dealId = existing.dealId;

  await prisma.$transaction(async (tx) => {
    const removed = await unlinkContact(tx, linkId);
    await writeAudit(tx, {
      actor,
      action: "delete.contactLink",
      targetType: "ContactLink",
      targetId: linkId,
      changes: {
        dealId,
        contactId: removed.contactId,
        relationship: removed.relationship,
        role: removed.role,
        isPrimary: removed.isPrimary,
      },
    });
  });

  revalidatePath(`/pipeline/${dealId}`);
  revalidatePath(`/contacts/${existing.contactId}`);
  return { ok: true as const };
}
