// Apollo credit accounting (Part E).
//
// Every Apollo email reveal — in discovery (lib/lead-discovery.ts) and via the
// per-person Reveal button (app/(app)/pipeline/leads/actions.ts) — writes one
// AuditLog row with action "reveal.apollo.email". Counting those rows since the
// first of the current month gives the credits spent THROUGH THIS APP (it does
// not see reveals made directly in the Apollo web UI).

import { prisma } from "@/lib/prisma";

// Apollo plan's monthly email-reveal allowance. Clearly-commented constant —
// change this one line if the plan changes.
export const APOLLO_MONTHLY_CREDITS = 2150;

export type ApolloCreditUsage = {
  used: number;
  total: number;
  remaining: number;
};

export async function getApolloCreditsThisMonth(): Promise<ApolloCreditUsage> {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const used = await prisma.auditLog.count({
    where: { action: "reveal.apollo.email", ts: { gte: firstOfMonth } },
  });

  return {
    used,
    total: APOLLO_MONTHLY_CREDITS,
    remaining: Math.max(0, APOLLO_MONTHLY_CREDITS - used),
  };
}
