"use server";

// Contact-scan server actions — the cost-controlled core.
//
// startContactScan creates a ScanRun synchronously and returns its id, then
// runs the work in the BACKGROUND via after() (small lists scored inline;
// large lists submitted to the Anthropic Message Batches API). getScanRunStatus
// is the UI poll: for a batch run it checks the batch and, once ended, ingests
// the results EXACTLY ONCE (guarded by an atomic submitted→scoring flip). The
// /import route sets maxDuration = 300 so the background submit has budget.
//
// PRIVACY: every query is scoped to the signed-in partner via requirePartner().

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/import-auth";
import { getAnthropicClient } from "@/lib/ai";
import {
  runInlineScan,
  submitBatchScan,
  ingestScanResults,
  INLINE_SCAN_THRESHOLD,
  SCAN_CHUNK_SIZE,
  type ScanRow,
  type ScanSegment,
} from "@/lib/contact-scan";

// Local (not exported): a "use server" module must only export async functions.
type ScanStatus = {
  id: string;
  status: string;
  total: number;
  done: number;
};

export async function startContactScan(): Promise<{ scanRunId: string }> {
  const { partnerId, label } = await requirePartner();

  // Name-only rows can't be scored — retire them from the pending queue up front
  // (no AI/credit spend). They stay visible, flagged for enrich-on-demand.
  const skipped = await prisma.importedContact.updateMany({
    where: { partnerLeadId: partnerId, completeness: "needs_identification", scanStatus: "pending" },
    data: { scanStatus: "skipped" },
  });

  const rows: ScanRow[] = await prisma.importedContact.findMany({
    where: { partnerLeadId: partnerId, completeness: "complete", scanStatus: "pending" },
    select: { id: true, name: true, title: true, company: true, domain: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) throw new Error("Nothing new to scan.");

  const segments: ScanSegment[] = await prisma.targetSegment.findMany({
    where: { active: true },
    orderBy: { priority: "desc" },
    select: {
      id: true,
      name: true,
      industries: true,
      revenueMin: true,
      revenueMax: true,
      employeeMin: true,
      employeeMax: true,
      geographies: true,
      buyingSignals: true,
      disqualifiers: true,
    },
  });
  if (segments.length === 0) throw new Error("Add an active Target Segment before scanning.");

  const scanRun = await prisma.scanRun.create({
    data: {
      partnerLeadId: partnerId,
      status: "pending",
      totalCount: rows.length,
      skippedCount: skipped.count,
      segmentScope: segments.map((s) => s.id),
      contactIds: rows.map((r) => r.id),
      createdBy: label,
    },
  });

  after(async () => {
    try {
      if (rows.length <= INLINE_SCAN_THRESHOLD) {
        await runInlineScan({ scanRunId: scanRun.id, partnerId, rows, segments });
      } else {
        await submitBatchScan({ scanRunId: scanRun.id, rows, segments });
      }
    } catch (err) {
      console.error("[scan-actions] background scan failed:", err);
      await prisma.scanRun
        .update({ where: { id: scanRun.id }, data: { status: "error", finishedAt: new Date() } })
        .catch(() => {});
    }
  });

  return { scanRunId: scanRun.id };
}

export async function getScanRunStatus(scanRunId: string): Promise<ScanStatus | null> {
  const { partnerId } = await requirePartner();
  if (!scanRunId) return null;

  const run = await prisma.scanRun.findFirst({
    where: { id: scanRunId, partnerLeadId: partnerId },
    select: {
      id: true,
      status: true,
      batchApiId: true,
      totalCount: true,
      scoredCount: true,
      errorCount: true,
      contactIds: true,
      segmentScope: true,
    },
  });
  if (!run) return null;

  const payload = (status: string, done: number): ScanStatus => ({
    id: run.id,
    status,
    total: run.totalCount,
    done: Math.min(run.totalCount, done),
  });

  // Inline runs (and terminal runs) report real per-contact counts directly.
  if (run.status !== "submitted" || !run.batchApiId) {
    return payload(run.status, run.scoredCount + run.errorCount);
  }

  // Batch run in flight — check it; ingest once when it ends.
  let processingStatus = "in_progress";
  let progressDone = 0;
  try {
    const batch = await getAnthropicClient().messages.batches.retrieve(run.batchApiId);
    processingStatus = batch.processing_status;
    const rc = batch.request_counts;
    const finishedChunks = rc.succeeded + rc.errored + rc.canceled + rc.expired;
    progressDone = finishedChunks * SCAN_CHUNK_SIZE;
  } catch (err) {
    console.error("[scan-actions] batch retrieve failed:", err);
    return payload("submitted", run.scoredCount + run.errorCount);
  }

  if (processingStatus !== "ended") {
    return payload("submitted", progressDone);
  }

  // Ended — claim the ingest with an atomic submitted→scoring flip so two
  // concurrent polls can't both write back.
  const claim = await prisma.scanRun.updateMany({
    where: { id: run.id, status: "submitted" },
    data: { status: "scoring" },
  });
  if (claim.count === 1) {
    try {
      await ingestScanResults({
        scanRunId: run.id,
        partnerId,
        batchApiId: run.batchApiId,
        contactIds: run.contactIds,
        segmentScope: run.segmentScope,
      });
    } catch (err) {
      console.error("[scan-actions] ingest failed:", err);
      await prisma.scanRun
        .update({ where: { id: run.id }, data: { status: "error", finishedAt: new Date() } })
        .catch(() => {});
    }
  }

  const fresh = await prisma.scanRun.findFirst({
    where: { id: run.id, partnerLeadId: partnerId },
    select: { status: true, scoredCount: true, errorCount: true },
  });
  return payload(fresh?.status ?? "scoring", (fresh?.scoredCount ?? 0) + (fresh?.errorCount ?? 0));
}
