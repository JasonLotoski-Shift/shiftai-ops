// requirePartner — the privacy gate for Import Contacts.
//
// Import Contacts is the first feature in this codebase with PRIVATE,
// per-partner data: a partner's imported network and scan results are visible
// ONLY to that partner. Every server action and page load that touches
// ImportBatch / ImportedContact / ScanRun MUST resolve the partner through this
// helper and scope its queries to `partnerId` (where: { partnerLeadId }), or
// use findFirst({ where: { id, partnerLeadId } }) — never a bare findUnique by
// id that trusts the row. Promoted ProspectLeads are firm-wide by design and
// are NOT scoped here.

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function requirePartner(): Promise<{ partnerId: string; label: string }> {
  const session = await auth();
  const email = session?.user?.email ?? null;
  const tokenPartnerId = session?.user?.partnerId ?? null;
  if (!tokenPartnerId && !email) throw new Error("Not authenticated");

  const label = session?.user?.name ?? email ?? "Unknown";

  // Verify the token's partnerId still resolves to a real Partner. A reseed or
  // manual cleanup can delete the row a long-lived JWT points at — reads then
  // return empty silently while the first WRITE throws a raw FK error (P2003).
  // If the id is stale, re-resolve by the session email so the session
  // self-heals to the current row instead of 500-ing. (jwt callback only sets
  // partnerId on initial sign-in; it never re-validates — see auth.ts.)
  if (tokenPartnerId) {
    const byId = await prisma.partner.findUnique({
      where: { id: tokenPartnerId },
      select: { id: true },
    });
    if (byId) return { partnerId: byId.id, label };
  }

  if (email) {
    const byEmail = await prisma.partner.findUnique({
      where: { email },
      select: { id: true },
    });
    if (byEmail) return { partnerId: byEmail.id, label };
  }

  throw new Error("Not authenticated");
}
