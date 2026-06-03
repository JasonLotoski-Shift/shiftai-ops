import { Header } from "@/components/header";
import { prisma } from "@/lib/prisma";
import { TargetingViews } from "@/components/targeting-views";
import { getTargetingStats } from "@/app/(app)/targeting/stats-actions";

export default async function TargetingPage() {
  const [segments, leadGroups, runGroups, initialStats] = await Promise.all([
    prisma.targetSegment.findMany({
      orderBy: [{ active: "desc" }, { priority: "desc" }, { updatedAt: "desc" }],
    }),
    // Pending, not-disqualified found-lead counts per segment — drives the
    // "N leads" chip on each SegmentCard.
    prisma.prospectLead.groupBy({
      by: ["segmentId"],
      where: { status: "pending", disqualified: false, segmentId: { not: null } },
      _count: { _all: true },
    }),
    // Most-recent LeadRun per segment — drives the "Claude has suggestions"
    // nudge (D39): suggestions exist when a run is newer than lastOptimizedAt.
    prisma.leadRun.groupBy({
      by: ["segmentId"],
      where: { segmentId: { not: null } },
      _max: { startedAt: true },
    }),
    // First-paint stats payload (All segments · Last 30d).
    getTargetingStats(null, 30),
  ]);

  const leadCounts: Record<string, number> = {};
  for (const g of leadGroups) {
    if (g.segmentId) leadCounts[g.segmentId] = g._count._all;
  }

  // Latest run per segment → nudge map. A segment has fresh suggestions when it
  // has a run newer than lastOptimizedAt, or has runs while never optimized.
  const lastRunBySegment: Record<string, Date> = {};
  for (const g of runGroups) {
    if (g.segmentId && g._max.startedAt) lastRunBySegment[g.segmentId] = g._max.startedAt;
  }
  const hasSuggestions: Record<string, boolean> = {};
  for (const s of segments) {
    const lastRun = lastRunBySegment[s.id];
    if (!lastRun) continue;
    hasSuggestions[s.id] = s.lastOptimizedAt ? lastRun > s.lastOptimizedAt : true;
  }

  // Flatten to plain props for the client component (Dates → ISO strings).
  const segmentProps = segments.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    active: s.active,
    priority: s.priority,
    industries: s.industries,
    revenueMin: s.revenueMin,
    revenueMax: s.revenueMax,
    employeeMin: s.employeeMin,
    employeeMax: s.employeeMax,
    geographies: s.geographies,
    buyingSignals: s.buyingSignals,
    disqualifiers: s.disqualifiers,
    personas: (s.personas as { department: string; seniority: string }[] | null) ?? [],
    anchors: (s.anchors as { name: string; domain?: string }[] | null) ?? [],
    priorityLocation: s.priorityLocation ?? null,
    lastOptimizedAt: s.lastOptimizedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  // Slim {id,name} list for the stats segment selector.
  const statsSegments = segments.map((s) => ({ id: s.id, name: s.name }));

  return (
    <>
      <Header eyebrow="Lead Agent · Targeting" title="Targeting." />
      <TargetingViews
        segments={segmentProps}
        leadCounts={leadCounts}
        hasSuggestions={hasSuggestions}
        initialStats={initialStats}
        statsSegments={statsSegments}
      />
    </>
  );
}
