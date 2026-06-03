"use server";

// Targeting statistics (D38) — getTargetingStats powers the collapsible Stats
// panel above the segment grid. Read-only: auth-gated, no writes, no audit.
//
// Four metric groups, all honoring an optional segment filter and an optional
// time window (sinceDays). Numbers are fine to be 0/sparse pre-Phase-C — the
// panel labels them clearly. Uses Prisma groupBy/count/aggregate; the funnel's
// Qualified/Won and the outreach scope cross ProspectLead.convertedDealId, a
// LOOSE String (not an FK), so they run as a two-step query + a stageRank map.

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { DealStage } from "@/lib/generated/prisma/enums";

// Deal stage order (per the schema/spec). Used to rank "qualified or later".
const STAGE_ORDER: DealStage[] = [
  "lead",
  "qualified",
  "discovery",
  "discussion",
  "proposal",
  "negotiation",
  "signed",
];
const stageRank = (s: DealStage): number => STAGE_ORDER.indexOf(s);
const QUALIFIED_RANK = stageRank("qualified");

export type ScoreHistogram = { bucket: "1–3" | "4–5" | "6–7" | "8–10"; count: number };

export type TargetingStats = {
  leads: {
    total: number; // non-ghost ProspectLead found (within range, segment filter)
    avgScore: number; // average score across found leads
    highFit: number; // count score >= 8
    histogram: ScoreHistogram[];
  };
  funnel: {
    found: number; // non-ghost ProspectLead count
    added: number; // status === "added"
    qualified: number; // converted deals at stage qualified or later
    won: number; // converted deals at stage signed
  };
  runs: {
    count: number;
    evaluated: number; // sum evaluatedCount
    found: number; // sum foundCount
    filtered: number; // sum ghostCount
    lastRunAt: string | null; // max startedAt (ISO)
  };
  outreach: {
    emailsSent: number; // converted Deals with coldOutreachAt set
    replies: number; // converted Deals with outreachRepliedAt set
  };
};

function bucketOf(score: number): ScoreHistogram["bucket"] {
  if (score <= 3) return "1–3";
  if (score <= 5) return "4–5";
  if (score <= 7) return "6–7";
  return "8–10";
}

export async function getTargetingStats(
  segmentId?: string | null,
  sinceDays?: number | null,
): Promise<TargetingStats> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const since = sinceDays && sinceDays > 0 ? new Date(Date.now() - sinceDays * 86_400_000) : null;
  const segWhere = segmentId ? { segmentId } : {};
  const createdWhere = since ? { createdAt: { gte: since } } : {};
  const runWhere = {
    ...(segmentId ? { segmentId } : {}),
    ...(since ? { startedAt: { gte: since } } : {}),
  };

  // ── Group 1 + Funnel(found/added): pull found (non-ghost) leads in range ──
  // We need scores (histogram/avg/high-fit) and convertedDealId (funnel), so a
  // findMany is the cleanest single read; volumes here are modest.
  const foundLeads = await prisma.prospectLead.findMany({
    where: { status: { not: "ghost" }, ...segWhere, ...createdWhere },
    select: { score: true, status: true, convertedDealId: true },
  });

  const total = foundLeads.length;
  const avgScore = total ? Math.round((foundLeads.reduce((s, l) => s + l.score, 0) / total) * 10) / 10 : 0;
  const highFit = foundLeads.filter((l) => l.score >= 8).length;
  const histBuckets: Record<ScoreHistogram["bucket"], number> = { "1–3": 0, "4–5": 0, "6–7": 0, "8–10": 0 };
  for (const l of foundLeads) histBuckets[bucketOf(l.score)] += 1;
  const histogram: ScoreHistogram[] = (["1–3", "4–5", "6–7", "8–10"] as const).map((bucket) => ({
    bucket,
    count: histBuckets[bucket],
  }));

  const added = foundLeads.filter((l) => l.status === "added").length;

  // ── Funnel Qualified/Won: resolve convertedDealId → Deal stage ──
  const dealIds = [...new Set(foundLeads.map((l) => l.convertedDealId).filter((id): id is string => !!id))];
  let qualified = 0;
  let won = 0;
  if (dealIds.length) {
    const deals = await prisma.deal.findMany({
      where: { id: { in: dealIds } },
      select: { stage: true },
    });
    for (const d of deals) {
      if (stageRank(d.stage) >= QUALIFIED_RANK) qualified += 1;
      if (d.stage === "signed") won += 1;
    }
  }

  // ── Group 3: run performance ──
  const [runAgg, lastRun] = await Promise.all([
    prisma.leadRun.aggregate({
      where: runWhere,
      _count: { _all: true },
      _sum: { evaluatedCount: true, foundCount: true, ghostCount: true },
    }),
    prisma.leadRun.findFirst({
      where: runWhere,
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
  ]);

  // ── Group 4: outreach — scope through the source ProspectLead.convertedDealId.
  // Reuse the same dealIds set (already segment + range scoped via foundLeads).
  let emailsSent = 0;
  let replies = 0;
  if (dealIds.length) {
    const [sent, replied] = await Promise.all([
      prisma.deal.count({ where: { id: { in: dealIds }, coldOutreachAt: { not: null } } }),
      prisma.deal.count({ where: { id: { in: dealIds }, outreachRepliedAt: { not: null } } }),
    ]);
    emailsSent = sent;
    replies = replied;
  }

  return {
    leads: { total, avgScore, highFit, histogram },
    funnel: { found: total, added, qualified, won },
    runs: {
      count: runAgg._count._all,
      evaluated: runAgg._sum.evaluatedCount ?? 0,
      found: runAgg._sum.foundCount ?? 0,
      filtered: runAgg._sum.ghostCount ?? 0,
      lastRunAt: lastRun?.startedAt.toISOString() ?? null,
    },
    outreach: { emailsSent, replies },
  };
}
