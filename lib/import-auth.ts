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

export async function requirePartner(): Promise<{ partnerId: string; label: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const label = session.user.name ?? session.user.email ?? "Unknown";
  return { partnerId: session.user.partnerId, label };
}
