"use server";

// Contact-scan server actions. A scan rates the partner's contacts against a
// CRITERIA set (the scan settings) and records the run as a deletable report
// (ScanRun + ScanResult rows). startContactScan creates the run synchronously
// and runs the work in the BACKGROUND via after() (inline for small lists; the
// Message Batches API for large). getScanRunStatus is the UI poll; for a batch
// run it ingests the results once when the batch ends. The /import route sets
// maxDuration = 300 so the background submit has budget.
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
  claimExpired,
  INLINE_SCAN_THRESHOLD,
  INGEST_CLAIM_TTL_MS,
  SCAN_CHUNK_SIZE,
  type ScanRow,
} from "@/lib/contact-scan";
import type { ScanCriteria } from "@/lib/types";

type ScanStatus = { id: string; status: string; total: number; done: number; stale: boolean };

// A non-terminal run older than this with no end is treated as stalled (e.g. the
// background submit didn't survive, or a batch was never ingested). The banner
// then offers a Dismiss instead of spinning forever. Inline scans finish in
// seconds; batch scans almost always finish well inside an hour.
const SCAN_STALE_MS = 60 * 60 * 1000;

// Normalize/clamp partner-supplied criteria before it's stored + sent to the model.
function cleanCriteria(input: Partial<ScanCriteria> | undefined): ScanCriteria {
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 40) : [];
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : undefined;
  return {
    industries: arr(input?.industries),
    employeeMin: num(input?.employeeMin),
    employeeMax: num(input?.employeeMax),
    revenueMin: num(input?.revenueMin),
    revenueMax: num(input?.revenueMax),
    geographies: arr(input?.geographies),
    keywords: arr(input?.keywords),
    seededFromSegmentId:
      typeof input?.seededFromSegmentId === "string" ? input.seededFromSegmentId : undefined,
    seededFromName: typeof input?.seededFromName === "string" ? input.seededFromName : undefined,
  };
}

export async function startContactScan(input: {
  title: string;
  criteria: ScanCriteria;
  contactIds?: string[];
}): Promise<{ scanRunId: string }> {
  const { partnerId, label } = await requirePartner();
  const criteria = cleanCriteria(input.criteria);
  const title = (input.title || "").trim().slice(0, 80) || "Scan";

  // Scope: a provided subset, else ALL complete contacts (a scan is a fresh
  // report under its own criteria). Name-only rows are never scanned.
  const where = {
    partnerLeadId: partnerId,
    completeness: "complete" as const,
    ...(input.contactIds?.length ? { id: { in: input.contactIds } } : {}),
  };
  const rows: ScanRow[] = await prisma.importedContact.findMany({
    where,
    select: { id: true, name: true, title: true, company: true, domain: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) throw new Error("No scannable contacts to scan.");

  const scanRun = await prisma.scanRun.create({
    data: {
      partnerLeadId: partnerId,
      title,
      status: "pending",
      criteria: criteria as object,
      totalCount: rows.length,
      segmentScope: [],
      contactIds: rows.map((r) => r.id),
      createdBy: label,
    },
  });

  after(async () => {
    try {
      if (rows.length <= INLINE_SCAN_THRESHOLD) {
        await runInlineScan({ scanRunId: scanRun.id, partnerId, rows, criteria });
      } else {
        await submitBatchScan({ scanRunId: scanRun.id, rows, criteria });
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
      id: true, status: true, batchApiId: true, totalCount: true,
      scoredCount: true, errorCount: true, contactIds: true, startedAt: true,
      ingestClaimedAt: true,
    },
  });
  if (!run) return null;

  const payload = (status: string, done: number): ScanStatus => {
    const terminal = status === "done" || status === "error";
    const stale = !terminal && Date.now() - run.startedAt.getTime() > SCAN_STALE_MS;
    return { id: run.id, status, total: run.totalCount, done: Math.min(run.totalCount, done), stale };
  };

  // Self-heal: a run stuck in "scoring" with an expired (or never-stamped)
  // claim means the prior ingest invocation died mid-write. Re-claim it
  // atomically and re-run the idempotent ingest. On failure we log and leave
  // it in "scoring" — a later poll retries after the TTL; the stale banner
  // (1h) remains the user-facing escape hatch.
  if (run.status === "scoring" && run.batchApiId && claimExpired(run.ingestClaimedAt)) {
    const cutoff = new Date(Date.now() - INGEST_CLAIM_TTL_MS);
    const reclaim = await prisma.scanRun.updateMany({
      where: {
        id: run.id,
        status: "scoring",
        OR: [{ ingestClaimedAt: null }, { ingestClaimedAt: { lt: cutoff } }],
      },
      data: { ingestClaimedAt: new Date() },
    });
    if (reclaim.count === 1) {
      try {
        await ingestScanResults({
          scanRunId: run.id,
          partnerId,
          batchApiId: run.batchApiId,
          contactIds: run.contactIds,
        });
      } catch (err) {
        console.error("[scan-actions] re-claimed ingest failed:", err);
      }
    }
    const fresh = await prisma.scanRun.findFirst({
      where: { id: run.id, partnerLeadId: partnerId },
      select: { status: true, scoredCount: true, errorCount: true },
    });
    return payload(fresh?.status ?? "scoring", (fresh?.scoredCount ?? 0) + (fresh?.errorCount ?? 0));
  }

  if (run.status !== "submitted" || !run.batchApiId) {
    return payload(run.status, run.scoredCount + run.errorCount);
  }

  // Batch in flight — check it; ingest once when it ends.
  let processingStatus = "in_progress";
  let progressDone = 0;
  try {
    const batch = await getAnthropicClient().messages.batches.retrieve(run.batchApiId);
    processingStatus = batch.processing_status;
    const rc = batch.request_counts;
    progressDone = (rc.succeeded + rc.errored + rc.canceled + rc.expired) * SCAN_CHUNK_SIZE;
  } catch (err) {
    console.error("[scan-actions] batch retrieve failed:", err);
    return payload("submitted", run.scoredCount + run.errorCount);
  }

  if (processingStatus !== "ended") return payload("submitted", progressDone);

  const claim = await prisma.scanRun.updateMany({
    where: { id: run.id, status: "submitted" },
    data: { status: "scoring", ingestClaimedAt: new Date() },
  });
  if (claim.count === 1) {
    try {
      await ingestScanResults({
        scanRunId: run.id,
        partnerId,
        batchApiId: run.batchApiId,
        contactIds: run.contactIds,
      });
    } catch (err) {
      // Leave the run in "scoring" — the claim expires after the TTL and a
      // later poll re-claims and resumes (the writes are idempotent). The
      // stale banner is the user-facing escape hatch for persistent failure.
      console.error("[scan-actions] ingest failed:", err);
    }
  }

  const fresh = await prisma.scanRun.findFirst({
    where: { id: run.id, partnerLeadId: partnerId },
    select: { status: true, scoredCount: true, errorCount: true },
  });
  return payload(fresh?.status ?? "scoring", (fresh?.scoredCount ?? 0) + (fresh?.errorCount ?? 0));
}
