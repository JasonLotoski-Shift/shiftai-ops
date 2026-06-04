"use server";

// Run-search server action (Lead Agent — D17/D18, non-blocking refactor FIX #2).
//
// runSegmentSearch is the UI entry point for the Discovery Engine. It auth-gates,
// creates the LeadRun row SYNCHRONOUSLY (status "running"), and returns its id
// IMMEDIATELY — the heavy discovery pipeline runs in the BACKGROUND via Next.js
// after() (which fires after the HTTP response is sent). This means the partner
// can navigate away while a search runs; the card/panel "Searching…" indicator is
// driven by the running LeadRun (polled via getSegmentRunStatus), so it survives
// navigation and shows on any page load.
//
// runDiscovery itself writes the ProspectLead rows + finalizes the LeadRun + audit
// + activity (the canonical persistence recipe lives inside the engine). Because
// the run is pre-created here, runDiscovery executes against the passed runId
// instead of creating its own.
//
// The targeting page route sets `export const maxDuration = 300` so the
// background work has wall-clock budget on Vercel (a "use server" file may only
// export async functions, so maxDuration cannot live here). As a safety net for
// environments where after() does not fire, the after() callback also marks the
// run errored on failure (belt-and-suspenders on top of runDiscovery's own
// top-level error handling).

import { after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { runDiscovery } from "@/lib/lead-discovery";

export async function runSegmentSearch(segmentId: string): Promise<{ runId: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  if (!segmentId) throw new Error("Missing segment");

  // Create the LeadRun synchronously so the caller gets a runId right away and the
  // "Searching…" indicator can read it from the server on any page load.
  const run = await prisma.leadRun.create({
    data: { status: "running", segmentId, createdBy: "AGENT · CLAUDE" },
  });

  // Heavy discovery runs AFTER the response is sent.
  after(async () => {
    try {
      await runDiscovery({
        segmentId,
        wideLimit: 150, // stage-1 Apollo pool (free)
        companyCap: 40, // finalists enriched per run
        concurrency: 6, // stage-2 bounded parallelism
        timeBudgetMs: 220_000, // ~3.7 min hard wall-clock budget
        runId: run.id,
      });
    } catch (err) {
      console.error("[run-actions] background discovery failed:", err);
      await prisma.leadRun
        .update({ where: { id: run.id }, data: { status: "error", finishedAt: new Date() } })
        .catch(() => {});
    }
  });

  return { runId: run.id };
}

/** Read-only poll endpoint: the latest LeadRun for a segment. The card/panel poll
 *  this every ~4s while a run is active; when status flips to "done" it shows the
 *  run breakdown ("N new + M rescued, K filtered, ~R left") and refreshes so
 *  leadCounts update.
 *
 *  The LeadRun row only persists the aggregate columns (foundCount includes
 *  rescued; ghostCount includes rejudged). The stage-aware breakdown — new vs
 *  rescued, ghost vs rejudged, and the companies-remaining estimate — lives in the
 *  `run.leadDiscovery` audit row's `changes` (no new LeadRun columns / migration).
 *  For a finished run we read that audit row to surface the honest breakdown. */
export async function getSegmentRunStatus(segmentId: string): Promise<{
  id: string;
  status: string;
  evaluatedCount: number;
  foundCount: number;
  ghostCount: number;
  finishedAt: string | null;
  /** Stage-aware breakdown (from the audit row); null until the run is finished. */
  found: number | null;
  rescued: number | null;
  ghost: number | null;
  rejudged: number | null;
  remaining: number | null;
} | null> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  if (!segmentId) return null;

  const run = await prisma.leadRun.findFirst({
    where: { segmentId },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      status: true,
      evaluatedCount: true,
      foundCount: true,
      ghostCount: true,
      finishedAt: true,
    },
  });
  if (!run) return null;

  // For a finished run, pull the stage-aware breakdown from the audit row.
  let breakdown: {
    found: number | null;
    rescued: number | null;
    ghost: number | null;
    rejudged: number | null;
    remaining: number | null;
  } = { found: null, rescued: null, ghost: null, rejudged: null, remaining: null };

  if (run.status === "done") {
    const audit = await prisma.auditLog.findFirst({
      where: { action: "run.leadDiscovery", targetType: "LeadRun", targetId: run.id },
      orderBy: { ts: "desc" },
      select: { changes: true },
    });
    const c = (audit?.changes ?? null) as Record<string, unknown> | null;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    if (c) {
      breakdown = {
        found: num(c.found),
        rescued: num(c.rescued),
        ghost: num(c.ghost),
        rejudged: num(c.rejudged),
        remaining: num(c.remaining),
      };
    }
  }

  return {
    id: run.id,
    status: run.status,
    evaluatedCount: run.evaluatedCount,
    foundCount: run.foundCount,
    ghostCount: run.ghostCount,
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    ...breakdown,
  };
}
