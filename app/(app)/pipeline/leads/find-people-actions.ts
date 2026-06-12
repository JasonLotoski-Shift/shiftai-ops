"use server";

// "Find more people" on a ProspectLead — Apollo decision-maker search + website
// team-page scrape to surface more cold-outreach targets. Discovery only (no
// credits spent); reveals stay per-person. Leads are firm-wide, so any signed-in
// partner may run it. The /pipeline/leads/[id] route sets maxDuration = 300 to
// give the Firecrawl + Apollo + Claude round-trips budget.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { findMorePeople, type FindPeopleSummary } from "@/lib/find-people";

export async function findMorePeopleAction(leadId: string): Promise<FindPeopleSummary> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  if (!leadId) throw new Error("Missing lead");
  const label = session.user.name ?? session.user.email ?? "Unknown";

  const summary = await findMorePeople({
    leadId,
    actorPartnerId: session.user.partnerId,
    actorLabel: label,
  });

  revalidatePath(`/pipeline/leads/${leadId}`);
  revalidatePath("/pipeline");
  return summary;
}
