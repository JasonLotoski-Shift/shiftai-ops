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
 *  this every ~4s while a run is active; when status flips to "done" it shows
 *  "Found N → View" and refreshes so leadCounts update. */
export async function getSegmentRunStatus(segmentId: string): Promise<{
  id: string;
  status: string;
  evaluatedCount: number;
  foundCount: number;
  ghostCount: number;
  finishedAt: string | null;
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
  return { ...run, finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null };
}
