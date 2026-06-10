// ContactLink write path — the ONLY module that mutates ContactLink rows.
// A link joins a Contact to exactly ONE company-side record (Deal or Client);
// `relationship` says how the person connects (works there / introduced us /
// advisor), `role` says their pull in the buying decision. The polymorphic
// FK pair is enforced here, not in the DB (mirrors Task's scope FKs).
//
// Callers own auth, AuditLog, Activity, and revalidation — these helpers are
// pure data so they compose inside any $transaction (manual UI actions,
// approveUnified, convertDeal).
//
// Server-only (touches Prisma).

import { prisma } from "@/lib/prisma";
import type {
  RelationshipType,
  StakeholderRole,
} from "@/lib/generated/prisma/enums";

// The client handed to a prisma.$transaction(async (tx) => …) callback.
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type LinkContactInput = {
  contactId: string;
  // Exactly one of these — throws otherwise.
  dealId?: string | null;
  clientId?: string | null;
  relationship: RelationshipType;
  role?: StakeholderRole | null;
  roleLabel?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
  // Partner name or "AGENT · CLAUDE"
  addedBy: string;
};

export type LinkContactResult = {
  created: boolean; // false = an existing link for this pair was updated
  linkId: string;
};

/**
 * Idempotent upsert on the (contactId, dealId|clientId) pair. A second link
 * for the same person+company updates relationship/role/labels in place
 * instead of erroring on the unique index — re-running an approval or convert
 * never duplicates. Fields the caller omits are left untouched on update.
 *
 * One primary per company: starring a link (`isPrimary: true`) un-stars every
 * other link on the same deal/client in the same tx. The invariant lives here
 * — the single write path — so manual UI actions, approveUnified, and
 * convertDeal all agree without per-caller demote loops.
 */
export async function linkContact(
  tx: Tx,
  input: LinkContactInput
): Promise<LinkContactResult> {
  const dealId = input.dealId ?? null;
  const clientId = input.clientId ?? null;
  if ((dealId === null) === (clientId === null)) {
    throw new Error("linkContact: set exactly one of dealId / clientId");
  }

  if (input.isPrimary === true) {
    await tx.contactLink.updateMany({
      where: dealId
        ? { dealId, isPrimary: true, contactId: { not: input.contactId } }
        : { clientId, isPrimary: true, contactId: { not: input.contactId } },
      data: { isPrimary: false },
    });
  }

  const existing = await tx.contactLink.findFirst({
    where: dealId
      ? { contactId: input.contactId, dealId }
      : { contactId: input.contactId, clientId },
    select: { id: true },
  });

  if (existing) {
    await tx.contactLink.update({
      where: { id: existing.id },
      data: {
        relationship: input.relationship,
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.roleLabel !== undefined ? { roleLabel: input.roleLabel } : {}),
        ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    return { created: false, linkId: existing.id };
  }

  const link = await tx.contactLink.create({
    data: {
      contactId: input.contactId,
      dealId,
      clientId,
      relationship: input.relationship,
      role: input.role ?? null,
      roleLabel: input.roleLabel ?? null,
      isPrimary: input.isPrimary ?? false,
      notes: input.notes ?? null,
      addedBy: input.addedBy,
    },
  });
  return { created: true, linkId: link.id };
}

/** Delete one link. Returns the removed row for the caller's audit diff. */
export async function unlinkContact(tx: Tx, linkId: string) {
  return tx.contactLink.delete({ where: { id: linkId } });
}

/**
 * Convert support: move every link on a deal over to the new client. When the
 * contact is ALREADY linked to that client, the deal-side link merges into it
 * (client link wins; the deal link is deleted) instead of tripping the unique
 * index. Returns counts for the convert audit row.
 */
export async function repointDealLinksToClient(
  tx: Tx,
  args: { dealId: string; clientId: string }
): Promise<{ moved: number; merged: number }> {
  const dealLinks = await tx.contactLink.findMany({
    where: { dealId: args.dealId },
    select: { id: true, contactId: true },
  });

  let moved = 0;
  let merged = 0;
  for (const link of dealLinks) {
    const clash = await tx.contactLink.findFirst({
      where: { contactId: link.contactId, clientId: args.clientId },
      select: { id: true },
    });
    if (clash) {
      await tx.contactLink.delete({ where: { id: link.id } });
      merged++;
    } else {
      await tx.contactLink.update({
        where: { id: link.id },
        data: { dealId: null, clientId: args.clientId },
      });
      moved++;
    }
  }
  return { moved, merged };
}
