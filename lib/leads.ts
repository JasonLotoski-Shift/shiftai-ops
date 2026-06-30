// Promoted-lead working layer — pure helpers shared by the Pipeline "Promoted
// Leads" tab and the lead detail page. The working status is DERIVED from the
// lead's status + outreach fields (never stored), so the status chip, the
// Status filter, and the Status sort all read one source of truth.

import type { LeadOutreachChannel, ProspectLead } from "@/lib/types";

export type PromotedStatusKey = "new" | "reached_out" | "replied" | "in_pipeline" | "set_aside";

export type PromotedStatus = { key: PromotedStatusKey; label: string };

// Lifecycle: New → Reached out → Replied → In pipeline; Set aside is the ghost
// lane. `added`/`ghost` win over the outreach flags (a converted or parked lead
// is resolved regardless of how it was last touched).
export function promotedLeadStatus(
  lead: Pick<ProspectLead, "status" | "touchAt" | "repliedAt">,
): PromotedStatus {
  if (lead.status === "added") return { key: "in_pipeline", label: "In pipeline" };
  if (lead.status === "ghost") return { key: "set_aside", label: "Set aside" };
  if (lead.repliedAt) return { key: "replied", label: "Replied" };
  if (lead.touchAt) return { key: "reached_out", label: "Reached out" };
  return { key: "new", label: "New" };
}

// Rank for the "by status" sort — lifecycle order, in-pipeline sinks to the
// bottom of the working lane.
export const PROMOTED_STATUS_RANK: Record<PromotedStatusKey, number> = {
  new: 0,
  reached_out: 1,
  replied: 2,
  in_pipeline: 3,
  set_aside: 4,
};

// Canonical ordered channel list (for menus) + display labels.
export const OUTREACH_CHANNELS: LeadOutreachChannel[] = ["linkedin", "email", "call", "other"];
export const CHANNEL_LABEL: Record<LeadOutreachChannel, string> = {
  linkedin: "LinkedIn",
  email: "Email",
  call: "Call",
  other: "Other",
};

// The three preset set-aside reasons surfaced on the Promoted Leads card.
export const DISMISS_REASONS: string[] = ["Not a fit", "Not now", "Declined"];

// Owner of a promoted lead, for the "Mine" / by-partner filter: whoever claimed
// it, falling back to whoever promoted it from their imports.
export function leadOwner(
  lead: Pick<ProspectLead, "claimedBy" | "promotedBy">,
): string | undefined {
  return lead.claimedBy ?? lead.promotedBy ?? undefined;
}
