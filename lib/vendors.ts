// Vendor helpers shared across the finance write paths (server-safe, no
// "use server"). The managed Vendor list is optional on every bill/expense —
// vendorId links the row to a curated payee, while the row's own `vendor` string
// stays the denormalized display name. See app/(app)/financials/vendor-actions.ts.

import { prisma } from "@/lib/prisma";

/** Return the id only when it references a real Vendor, else null. Guards the
 *  Bill/Expense FK: a stale/empty id from the client is dropped instead of
 *  aborting the insert on a foreign-key violation. Empty input short-circuits
 *  (no query). Degrades to null if the Vendor table isn't there yet (pre-migration). */
export async function validVendorId(id: string | null | undefined): Promise<string | null> {
  const v = id?.trim();
  if (!v) return null;
  try {
    const found = await prisma.vendor.findUnique({ where: { id: v }, select: { id: true } });
    return found?.id ?? null;
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2021" || code === "42P01") return null; // table absent pre-migration
    throw e;
  }
}
