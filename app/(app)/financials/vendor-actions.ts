"use server";

// Managed Vendor list — the curated payees bills/expenses recur against
// (Cloudflare, Anthropic, Vercel, …). Reads + inline create are open to any
// partner (the ingest green card and the AP/AR modal both file from here, and
// filing isn't MP-gated); editing defaults, archiving, and restoring are
// managing-partner-only, matching the rest of Financials. Every write audits.
//
// The Vendor is a convenience layer: Bill.vendor / Expense.vendor keep the
// denormalized display name, vendorId is the optional link (lib/vendors.ts).

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";
import { requireManagingPartner } from "@/lib/permissions";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/finance";
import type { ExpenseCategory } from "@/lib/types";

export type VendorRow = {
  id: string;
  name: string;
  defaultCategory: ExpenseCategory | null;
  defaultCurrency: string | null;
  notes: string | null;
  archived: boolean;
};

const VALID_CATEGORIES = new Set(Object.keys(EXPENSE_CATEGORY_LABELS));

function cleanCategory(c: ExpenseCategory | null | undefined): ExpenseCategory | null {
  return c && VALID_CATEGORIES.has(c) ? c : null;
}

/** Currency to an ISO-ish 3-letter upper code, else null (defaults to CAD at use). */
function cleanCurrency(c: string | null | undefined): string | null {
  const v = c?.trim().toUpperCase();
  return v && /^[A-Z]{3}$/.test(v) ? v : null;
}

function toRow(v: {
  id: string;
  name: string;
  defaultCategory: ExpenseCategory | null;
  defaultCurrency: string | null;
  notes: string | null;
  archivedAt: Date | null;
}): VendorRow {
  return {
    id: v.id,
    name: v.name,
    defaultCategory: v.defaultCategory,
    defaultCurrency: v.defaultCurrency,
    notes: v.notes,
    archived: v.archivedAt !== null,
  };
}

async function currentActor() {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const label = session.user.name ?? session.user.email ?? "Unknown";
  return { actor: partnerActor(session.user.partnerId, label), label };
}

/** List vendors for a picker (active only) or the management screen
 *  (includeArchived). Degrades to [] pre-migration so the finance surfaces never
 *  500 before the Vendor table exists. */
export async function listVendors(opts?: { includeArchived?: boolean }): Promise<VendorRow[]> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  try {
    const rows = await prisma.vendor.findMany({
      where: opts?.includeArchived ? {} : { archivedAt: null },
      orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
      select: { id: true, name: true, defaultCategory: true, defaultCurrency: true, notes: true, archivedAt: true },
    });
    return rows.map(toRow);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2021" || code === "42P01") return []; // table absent pre-migration
    throw e;
  }
}

/** Create a vendor (any partner — the inline "＋ New vendor" on the pickers).
 *  Idempotent on a case-insensitive name: an existing match is returned instead
 *  of creating a duplicate (and unarchived if it was hidden). */
export async function createVendor(input: {
  name: string;
  defaultCategory?: ExpenseCategory | null;
  defaultCurrency?: string | null;
  notes?: string | null;
}): Promise<VendorRow> {
  const { actor, label } = await currentActor();

  const name = input.name.trim();
  if (!name) throw new Error("Vendor name is required");
  if (name.length > 120) throw new Error("Vendor name is too long (max 120 chars)");

  const existing = await prisma.vendor.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true, defaultCategory: true, defaultCurrency: true, notes: true, archivedAt: true },
  });
  if (existing) {
    // Reuse the row; bring it back if it was archived so picking it works.
    if (existing.archivedAt) {
      const restored = await prisma.vendor.update({
        where: { id: existing.id },
        data: { archivedAt: null },
        select: { id: true, name: true, defaultCategory: true, defaultCurrency: true, notes: true, archivedAt: true },
      });
      return toRow(restored);
    }
    return toRow(existing);
  }

  const created = await prisma.$transaction(async (tx) => {
    const v = await tx.vendor.create({
      data: {
        name,
        defaultCategory: cleanCategory(input.defaultCategory),
        defaultCurrency: cleanCurrency(input.defaultCurrency) ?? "CAD",
        notes: input.notes?.trim() || null,
        createdBy: label,
      },
      select: { id: true, name: true, defaultCategory: true, defaultCurrency: true, notes: true, archivedAt: true },
    });
    await writeAudit(tx, {
      actor,
      action: "create.vendor",
      targetType: "Vendor",
      targetId: v.id,
      changes: { name },
    });
    return v;
  });

  revalidatePath("/financials");
  return toRow(created);
}

/** Edit a vendor's name / defaults / notes — managing partners only. */
export async function updateVendor(
  id: string,
  input: { name?: string; defaultCategory?: ExpenseCategory | null; defaultCurrency?: string | null; notes?: string | null },
): Promise<VendorRow> {
  await requireManagingPartner();
  const { actor } = await currentActor();

  const vendor = await prisma.vendor.findUnique({
    where: { id },
    select: { id: true, name: true, defaultCategory: true, defaultCurrency: true, notes: true, archivedAt: true },
  });
  if (!vendor) throw new Error("Vendor not found");

  const data: Record<string, unknown> = {};
  const changes: Record<string, { before: unknown; after: unknown }> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Vendor name is required");
    if (name.length > 120) throw new Error("Vendor name is too long (max 120 chars)");
    if (name.toLowerCase() !== vendor.name.toLowerCase()) {
      const clash = await prisma.vendor.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, id: { not: id } },
        select: { id: true },
      });
      if (clash) throw new Error("Another vendor already has that name");
    }
    if (name !== vendor.name) {
      data.name = name;
      changes.name = { before: vendor.name, after: name };
    }
  }
  if (input.defaultCategory !== undefined) {
    const cat = cleanCategory(input.defaultCategory);
    if (cat !== vendor.defaultCategory) {
      data.defaultCategory = cat;
      changes.defaultCategory = { before: vendor.defaultCategory, after: cat };
    }
  }
  if (input.defaultCurrency !== undefined) {
    const cur = cleanCurrency(input.defaultCurrency);
    if (cur !== vendor.defaultCurrency) {
      data.defaultCurrency = cur;
      changes.defaultCurrency = { before: vendor.defaultCurrency, after: cur };
    }
  }
  if (input.notes !== undefined) {
    const notes = input.notes?.trim() || null;
    if (notes !== vendor.notes) {
      data.notes = notes;
      changes.notes = { before: vendor.notes, after: notes };
    }
  }

  if (Object.keys(data).length === 0) return toRow(vendor);

  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.vendor.update({
      where: { id },
      data,
      select: { id: true, name: true, defaultCategory: true, defaultCurrency: true, notes: true, archivedAt: true },
    });
    await writeAudit(tx, { actor, action: "update.vendor", targetType: "Vendor", targetId: id, changes });
    return v;
  });

  revalidatePath("/financials");
  return toRow(updated);
}

/** Archive (hide from the pickers) or restore a vendor — managing partners only.
 *  History is kept: bills/expenses already linked stay linked. */
export async function setVendorArchived(id: string, archived: boolean): Promise<{ ok: true }> {
  await requireManagingPartner();
  const { actor } = await currentActor();

  const vendor = await prisma.vendor.findUnique({ where: { id }, select: { archivedAt: true, name: true } });
  if (!vendor) throw new Error("Vendor not found");
  const isArchived = vendor.archivedAt !== null;
  if (isArchived === archived) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.vendor.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await writeAudit(tx, {
      actor,
      action: archived ? "archive.vendor" : "restore.vendor",
      targetType: "Vendor",
      targetId: id,
      changes: { name: vendor.name, archived },
    });
  });

  revalidatePath("/financials");
  return { ok: true };
}
