"use server";

// ContactLink mutations for the client People card (D40 records model).
//
// A ContactLink joins a Contact to this client with two dimensions:
// `relationship` (how the person connects — works there / introduced us /
// advisor) and `role` (their pull in the buying decision). All writes go
// through lib/contact-links.ts — the single ContactLink write path — wrapped
// here in auth + $transaction + writeAudit + revalidatePath, per the
// canonical mutation recipe. Nothing happens silently.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";
import { linkContact, unlinkContact } from "@/lib/contact-links";
import type {
  RelationshipType,
  StakeholderRole,
} from "@/lib/generated/prisma/enums";

// Server-side guards — the selects in the card constrain these too, but
// actions never trust the client.
const RELATIONSHIPS: readonly RelationshipType[] = [
  "works_there",
  "introduced_us",
  "advisor",
  "other",
];
const ROLES: readonly StakeholderRole[] = [
  "decision_maker",
  "champion",
  "influencer",
  "budget_holder",
  "technical",
  "gatekeeper",
  "blocker",
  "other",
];

type LinkInput = {
  relationship: RelationshipType;
  role?: StakeholderRole | null;
  roleLabel?: string | null;
  isPrimary?: boolean;
};

function validateLinkInput(input: LinkInput) {
  if (!RELATIONSHIPS.includes(input.relationship)) {
    throw new Error(`Unknown relationship: ${input.relationship}`);
  }
  if (input.role != null && !ROLES.includes(input.role)) {
    throw new Error(`Unknown role: ${input.role}`);
  }
}

async function requirePartner() {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  return { partnerLabel, actor: partnerActor(session.user.partnerId, partnerLabel) };
}

// The client has ONE main contact star. When a link is being marked primary,
// demote the others — through linkContact (the write path), passing their
// current relationship so the upsert is otherwise a no-op.
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
async function demoteOtherPrimaries(
  tx: Tx,
  clientId: string,
  keepContactId: string,
  addedBy: string,
) {
  const others = await tx.contactLink.findMany({
    where: { clientId, isPrimary: true, NOT: { contactId: keepContactId } },
    select: { contactId: true, relationship: true },
  });
  for (const o of others) {
    await linkContact(tx, {
      contactId: o.contactId,
      clientId,
      relationship: o.relationship,
      isPrimary: false,
      addedBy,
    });
  }
}

// ──────────────────────────────────────────────────────────────────────
// Add a person to the client
// ──────────────────────────────────────────────────────────────────────

export async function addClientContactLink(
  clientId: string,
  input: LinkInput & { contactId: string },
) {
  const { partnerLabel, actor } = await requirePartner();
  validateLinkInput(input);

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, company: true },
  });
  if (!client) throw new Error("Client not found");
  const contact = await prisma.contact.findUnique({
    where: { id: input.contactId },
    select: { id: true, name: true },
  });
  if (!contact) throw new Error("Contact not found");

  const roleLabel = input.roleLabel?.trim() || null;

  const result = await prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await demoteOtherPrimaries(tx, clientId, input.contactId, partnerLabel);
    }

    const link = await linkContact(tx, {
      contactId: input.contactId,
      clientId,
      relationship: input.relationship,
      role: input.role ?? null,
      roleLabel,
      isPrimary: input.isPrimary ?? false,
      addedBy: partnerLabel,
    });

    await writeAudit(tx, {
      actor,
      action: "link.contact.client",
      targetType: "ContactLink",
      targetId: link.linkId,
      changes: {
        clientId,
        contactId: input.contactId,
        contactName: contact.name,
        relationship: input.relationship,
        role: input.role ?? null,
        roleLabel,
        isPrimary: input.isPrimary ?? false,
        created: link.created, // false = an existing link was updated in place
      },
    });

    return link;
  });

  revalidatePath(`/clients/${clientId}`);
  return result;
}

// ──────────────────────────────────────────────────────────────────────
// Edit a link in place (relationship / role / label / primary star)
// ──────────────────────────────────────────────────────────────────────

export async function updateClientContactLink(
  clientId: string,
  linkId: string,
  input: LinkInput,
) {
  const { partnerLabel, actor } = await requirePartner();
  validateLinkInput(input);

  const existing = await prisma.contactLink.findUnique({
    where: { id: linkId },
    select: {
      id: true,
      clientId: true,
      contactId: true,
      relationship: true,
      role: true,
      roleLabel: true,
      isPrimary: true,
    },
  });
  if (!existing || existing.clientId !== clientId) throw new Error("Link not found");

  const roleLabel = input.roleLabel !== undefined ? input.roleLabel?.trim() || null : undefined;

  await prisma.$transaction(async (tx) => {
    if (input.isPrimary && !existing.isPrimary) {
      await demoteOtherPrimaries(tx, clientId, existing.contactId, partnerLabel);
    }

    await linkContact(tx, {
      contactId: existing.contactId,
      clientId,
      relationship: input.relationship,
      role: input.role !== undefined ? input.role ?? null : undefined,
      roleLabel,
      isPrimary: input.isPrimary,
      addedBy: partnerLabel,
    });

    await writeAudit(tx, {
      actor,
      action: "update.link.contact.client",
      targetType: "ContactLink",
      targetId: linkId,
      changes: {
        clientId,
        contactId: existing.contactId,
        before: {
          relationship: existing.relationship,
          role: existing.role,
          roleLabel: existing.roleLabel,
          isPrimary: existing.isPrimary,
        },
        after: {
          relationship: input.relationship,
          role: input.role ?? null,
          roleLabel: roleLabel ?? existing.roleLabel,
          isPrimary: input.isPrimary ?? existing.isPrimary,
        },
      },
    });
  });

  revalidatePath(`/clients/${clientId}`);
  return { linkId };
}

// ──────────────────────────────────────────────────────────────────────
// Remove a link (the contact record itself is untouched)
// ──────────────────────────────────────────────────────────────────────

export async function removeClientContactLink(clientId: string, linkId: string) {
  const { actor } = await requirePartner();

  const existing = await prisma.contactLink.findUnique({
    where: { id: linkId },
    select: { id: true, clientId: true },
  });
  if (!existing || existing.clientId !== clientId) throw new Error("Link not found");

  await prisma.$transaction(async (tx) => {
    const removed = await unlinkContact(tx, linkId);

    await writeAudit(tx, {
      actor,
      action: "unlink.contact.client",
      targetType: "ContactLink",
      targetId: linkId,
      changes: {
        clientId,
        contactId: removed.contactId,
        relationship: removed.relationship,
        role: removed.role,
        roleLabel: removed.roleLabel,
        isPrimary: removed.isPrimary,
      },
    });
  });

  revalidatePath(`/clients/${clientId}`);
  return { removed: true };
}
