"use server";

// Enrich a promoted (origin=imported) ProspectLead with Apollo + Firecrawl.
//
// Synchronous and scoped to one company, so it fits a normal request — the
// partner clicks "Enrich" and waits a few seconds. Promoted leads are firm-wide,
// so any signed-in partner may enrich one (no per-partner scoping here, unlike
// the private import staging). The /pipeline route sets maxDuration = 300 to
// give the Apollo + Firecrawl round-trips budget.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { enrichLead, type EnrichSummary } from "@/lib/lead-enrich";

export async function enrichPromotedLead(leadId: string): Promise<EnrichSummary> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const label = session.user.name ?? session.user.email ?? "Unknown";
  if (!leadId) throw new Error("Missing lead");

  const summary = await enrichLead({
    leadId,
    actorPartnerId: session.user.partnerId,
    actorLabel: label,
  });

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/leads/${leadId}`);
  return summary;
}
