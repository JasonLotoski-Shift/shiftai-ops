"use server";

// Enrich a ProspectLead with Apollo + Firecrawl, then build its company picture
// + positioning brief. No origin guard — this serves BOTH origins: the promoted
// (origin=imported) cards and the AI Found / Promoted lead detail page.
//
// Synchronous and scoped to one company, so it fits a normal request — the
// partner clicks "Enrich" and waits a few seconds. Promoted leads are firm-wide,
// so any signed-in partner may enrich one (no per-partner scoping here, unlike
// the private import staging). The /pipeline and lead-detail routes set
// maxDuration = 300 to give the Apollo + Firecrawl + web-search rounds budget.

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
