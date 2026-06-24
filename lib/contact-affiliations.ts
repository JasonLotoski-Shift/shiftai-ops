// Contact affiliations write path — a contact's company hats (employment /
// roles). Transaction-composable, shared by createContactTx (seed one primary)
// and updateContact (replace-all from the edit modal). Lives here (not a
// "use server" file) so it's never a client-invocable endpoint: the CALLER owns
// auth + audit + revalidation (mirrors lib/contacts.ts, lib/contact-links.ts).
//
// INVARIANT: exactly one isPrimary row, and that row's company/title mirror the
// scalar Contact.company/title — the synced source of truth every legacy read
// (300+ call sites) still uses. All sync flows through here.
//
// Server-only (touches Prisma).

import { prisma } from "@/lib/prisma";

// The client handed to a prisma.$transaction(async (tx) => …) callback.
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Scalar title placeholder used by the manual contact flow (createContact /
// the edit modal). An empty role is stored as "—" on the scalar; affiliation
// rows store null. Kept in one place so both sides agree.
const TITLE_PLACEHOLDER = "—";

export type AffiliationInput = { company: string; title?: string | null; isPrimary?: boolean };

export type NormalizedAffiliation = {
  company: string;
  title: string | null;
  isPrimary: boolean;
  sortOrder: number;
};

// Normalize a raw affiliation list from the form: trim everything, drop rows
// with an empty company, and guarantee EXACTLY one primary (the first row
// marked primary, else the first row). Input order is preserved as sortOrder.
// Returns [] when nothing usable was supplied.
export function normalizeAffiliations(rows: AffiliationInput[]): NormalizedAffiliation[] {
  const cleaned = rows
    .map((r) => ({
      company: (r.company ?? "").trim(),
      title: ((r.title ?? "").trim() || null) as string | null,
      isPrimary: !!r.isPrimary,
    }))
    .filter((r) => r.company.length > 0);
  if (cleaned.length === 0) return [];

  let primaryIdx = cleaned.findIndex((r) => r.isPrimary);
  if (primaryIdx === -1) primaryIdx = 0;

  return cleaned.map((r, i) => ({
    company: r.company,
    title: r.title,
    isPrimary: i === primaryIdx,
    sortOrder: i,
  }));
}

// Replace a contact's affiliations (delete-all + recreate) and sync the scalar
// company/title from the primary row. Throws if no usable row is supplied — a
// contact always has at least its primary company. Transaction-composable.
export async function replaceAffiliationsTx(
  tx: Tx,
  contactId: string,
  rows: AffiliationInput[],
): Promise<NormalizedAffiliation[]> {
  const normalized = normalizeAffiliations(rows);
  if (normalized.length === 0) throw new Error("A contact needs at least one company");

  await tx.contactAffiliation.deleteMany({ where: { contactId } });
  await tx.contactAffiliation.createMany({
    data: normalized.map((r) => ({
      contactId,
      company: r.company,
      title: r.title,
      isPrimary: r.isPrimary,
      sortOrder: r.sortOrder,
    })),
  });

  const primary = normalized.find((r) => r.isPrimary)!;
  await tx.contact.update({
    where: { id: contactId },
    data: { company: primary.company, title: primary.title ?? TITLE_PLACEHOLDER },
  });

  return normalized;
}

// Seed the single primary affiliation for a brand-new contact, from its scalar
// company/title. No-op when the company is blank (ingest can create a thin
// name-only row). Called inside createContactTx's transaction.
export async function seedPrimaryAffiliationTx(
  tx: Tx,
  contactId: string,
  company: string,
  title: string,
): Promise<void> {
  const co = company.trim();
  if (!co) return;
  const role = title.trim();
  await tx.contactAffiliation.create({
    data: {
      contactId,
      company: co,
      title: role && role !== TITLE_PLACEHOLDER ? role : null,
      isPrimary: true,
      sortOrder: 0,
    },
  });
}
