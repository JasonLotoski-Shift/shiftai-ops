// Contact scan engine — rate a partner's imported contacts for fit.
//
// Two execution paths, chosen by list size in scan-actions:
//   • inline  (small lists ≤ INLINE_SCAN_THRESHOLD) — loop chunks, one
//     messages.create per chunk, write results immediately. Runs in after().
//   • batch   (large lists) — submit ONE Anthropic Message Batch (~20 contacts
//     per request, half-price, timeout-proof), then a later UI poll retrieves +
//     ingests the results once. The stable cached prefix (firm context + scan
//     skill + the active segments) is shared across all requests, so prompt
//     caching makes the fan-out cheap.
//
// Plain async (NO "use server") so it's tsx-unit-testable, mirroring
// lib/lead-discovery.ts. All writes are scoped to partnerId (the privacy
// invariant) and the batch result write-back is idempotent.

import { prisma } from "@/lib/prisma";
import {
  getAnthropicClient,
  buildSystemBlocks,
  DEFAULT_MODEL_ID,
  type CachedSystemBlock,
} from "@/lib/ai";
import { writeAudit, agentActor } from "@/lib/audit";

export const SCAN_CHUNK_SIZE = 20;
// At/below this many scannable rows, run inline (batch latency isn't worth it).
export const INLINE_SCAN_THRESHOLD = 40;
const SCAN_MAX_TOKENS = 2000;

export type ScanRow = {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  domain: string | null;
  email: string | null;
};

export type ScanSegment = {
  id: string;
  name: string;
  industries: string[];
  revenueMin: number | null;
  revenueMax: number | null;
  employeeMin: number | null;
  employeeMax: number | null;
  geographies: string[];
  buyingSignals: string[];
  disqualifiers: string[];
};

export type ScanResult = {
  index: number;
  score: number;
  leadType: "decision_maker" | "connector" | "none";
  matchedSegmentIndex: number | null;
  rationale: string;
};

type ScanContact = {
  index: number;
  name: string;
  title: string;
  company: string;
  domain: string;
};

// ── Pure helpers ────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// The active segments rendered as a NUMBERED "fitting company" definition.
// matchedSegmentIndex in the model output refers to these `Segment N` numbers.
export function segmentsBlock(segments: ScanSegment[]): string {
  const body = segments
    .map((s, i) =>
      [
        `Segment ${i} — ${s.name}`,
        `  Industries: ${s.industries.join(", ") || "—"}`,
        `  Revenue band (CAD): ${s.revenueMin ?? "?"} – ${s.revenueMax ?? "?"}`,
        `  Employees: ${s.employeeMin ?? "?"} – ${s.employeeMax ?? "?"}`,
        `  Geographies: ${s.geographies.join(", ") || "—"}`,
        `  Buying signals: ${s.buyingSignals.join(", ") || "—"}`,
        `  Disqualifiers: ${s.disqualifiers.join(", ") || "—"}`,
      ].join("\n"),
    )
    .join("\n\n");
  return `# Target segments (the fitting-company definition)\n\n${body}`;
}

function contactsUserText(contacts: ScanContact[]): string {
  return [
    'Score each contact below for fit. Output ONLY the JSON array (one object per contact, keyed by "index") described in your instructions.',
    "",
    "Contacts:",
    JSON.stringify(contacts, null, 2),
  ].join("\n");
}

function buildScanParams(blocks: CachedSystemBlock[], contacts: ScanContact[]) {
  return {
    model: DEFAULT_MODEL_ID,
    max_tokens: SCAN_MAX_TOKENS,
    system: blocks,
    messages: [{ role: "user" as const, content: contactsUserText(contacts) }],
  };
}

// Loosely-typed text extraction — works for a messages.create response and a
// batch result's `.message` (same content-block shape).
function extractText(message: unknown): string {
  const m = message as { content?: { type: string; text?: string }[] } | null;
  if (!m?.content) return "";
  return m.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}

// Parse the model's JSON array (fence-tolerant) into validated ScanResults.
export function parseScanResults(raw: string): ScanResult[] {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("[")) {
    const s = text.indexOf("[");
    const e = text.lastIndexOf("]");
    if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ScanResult[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.index !== "number" || !Number.isInteger(o.index)) continue;
    let score = typeof o.score === "number" ? Math.trunc(o.score) : 1;
    if (Number.isNaN(score)) score = 1;
    score = Math.min(10, Math.max(1, score));
    const lt = o.leadType;
    const leadType: ScanResult["leadType"] =
      lt === "decision_maker" || lt === "connector" ? lt : "none";
    const msi =
      typeof o.matchedSegmentIndex === "number" && Number.isInteger(o.matchedSegmentIndex)
        ? o.matchedSegmentIndex
        : null;
    const rationale =
      typeof o.rationale === "string" && o.rationale.trim()
        ? o.rationale.trim()
        : "No rationale returned.";
    out.push({ index: o.index, score, leadType, matchedSegmentIndex: msi, rationale });
  }
  return out;
}

function resultData(res: ScanResult, segIds: string[]) {
  const matchedSegmentId =
    res.matchedSegmentIndex != null &&
    res.matchedSegmentIndex >= 0 &&
    res.matchedSegmentIndex < segIds.length
      ? segIds[res.matchedSegmentIndex]
      : null;
  return {
    scanStatus: "scored" as const,
    scanScore: res.score,
    leadType: res.leadType,
    matchedSegmentId,
    scanRationale: res.rationale.slice(0, 400),
    scannedAt: new Date(),
  };
}

function toScanContacts(rows: ScanRow[], indexBase: number): ScanContact[] {
  return rows.map((r, i) => ({
    index: indexBase + i,
    name: r.name,
    title: r.title ?? "",
    company: r.company ?? "",
    domain: r.domain ?? "",
  }));
}

// ── Inline path ─────────────────────────────────────────────────────────────

export async function runInlineScan(opts: {
  scanRunId: string;
  partnerId: string;
  rows: ScanRow[];
  segments: ScanSegment[];
}): Promise<void> {
  const { scanRunId, partnerId, rows, segments } = opts;
  await prisma.scanRun.update({ where: { id: scanRunId }, data: { status: "scoring" } });

  const blocks = await buildSystemBlocks("contact-scan", segmentsBlock(segments));
  const client = getAnthropicClient();
  const segIds = segments.map((s) => s.id);

  let scored = 0;
  let errored = 0;
  const chunks = chunk(rows, SCAN_CHUNK_SIZE);
  let base = 0;

  for (const ch of chunks) {
    const contacts = toScanContacts(ch, base);
    try {
      const res = await client.messages.create(buildScanParams(blocks, contacts));
      const results = parseScanResults(extractText(res));
      const byIndex = new Map(results.map((r) => [r.index, r]));
      for (let i = 0; i < ch.length; i++) {
        const r = byIndex.get(base + i);
        if (r) {
          await prisma.importedContact.updateMany({
            where: { id: ch[i].id, partnerLeadId: partnerId, scanStatus: { not: "scored" } },
            data: resultData(r, segIds),
          });
          scored++;
        } else {
          await prisma.importedContact.updateMany({
            where: { id: ch[i].id, partnerLeadId: partnerId, scanStatus: { not: "scored" } },
            data: { scanStatus: "error" },
          });
          errored++;
        }
      }
    } catch (err) {
      console.error(`[contact-scan] inline chunk failed (base ${base}):`, err);
      for (const row of ch) {
        await prisma.importedContact
          .updateMany({
            where: { id: row.id, partnerLeadId: partnerId, scanStatus: { not: "scored" } },
            data: { scanStatus: "error" },
          })
          .catch(() => {});
        errored++;
      }
    }
    base += ch.length;
    await prisma.scanRun
      .update({ where: { id: scanRunId }, data: { scoredCount: scored, errorCount: errored } })
      .catch(() => {});
  }

  await finalizeScan(scanRunId, partnerId, scored, errored, "inline");
}

// ── Batch path ──────────────────────────────────────────────────────────────

export async function submitBatchScan(opts: {
  scanRunId: string;
  rows: ScanRow[];
  segments: ScanSegment[];
}): Promise<void> {
  const { scanRunId, rows, segments } = opts;
  const blocks = await buildSystemBlocks("contact-scan", segmentsBlock(segments));
  const client = getAnthropicClient();

  const contacts = toScanContacts(rows, 0);
  const chunks = chunk(contacts, SCAN_CHUNK_SIZE);
  const requests = chunks.map((ch, ci) => ({
    custom_id: `scan-${scanRunId}-${ci}`,
    params: buildScanParams(blocks, ch),
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const batch = await client.messages.batches.create({ requests: requests as any });
  await prisma.scanRun.update({
    where: { id: scanRunId },
    data: { status: "submitted", batchApiId: batch.id },
  });
}

/**
 * Retrieve a finished batch's results and write scores back to the contacts.
 * Idempotent: only updates rows not already `scored`, and the caller flips the
 * run submitted→scoring before calling so two concurrent polls can't both run.
 */
export async function ingestScanResults(opts: {
  scanRunId: string;
  partnerId: string;
  batchApiId: string;
  contactIds: string[];
  segmentScope: string[];
}): Promise<void> {
  const { scanRunId, partnerId, batchApiId, contactIds, segmentScope } = opts;
  const client = getAnthropicClient();

  const processed = new Set<number>();
  let scored = 0;

  try {
    for await (const entry of await client.messages.batches.results(batchApiId)) {
      const result = entry.result;
      if (result.type !== "succeeded") continue; // failed chunk → handled below
      const results = parseScanResults(extractText(result.message));
      for (const res of results) {
        const contactId = contactIds[res.index];
        if (!contactId || processed.has(res.index)) continue;
        processed.add(res.index);
        await prisma.importedContact.updateMany({
          where: { id: contactId, partnerLeadId: partnerId, scanStatus: { not: "scored" } },
          data: resultData(res, segmentScope),
        });
        scored++;
      }
    }
  } catch (err) {
    console.error(`[contact-scan] batch results read failed for ${batchApiId}:`, err);
  }

  // Anything still `pending` got no usable result (errored/expired chunk, or a
  // missing index in an otherwise-succeeded chunk) → error, so nothing is left
  // silently unscanned. Scored rows are already terminal and untouched.
  const errRes = await prisma.importedContact.updateMany({
    where: { id: { in: contactIds }, partnerLeadId: partnerId, scanStatus: "pending" },
    data: { scanStatus: "error" },
  });

  await finalizeScan(scanRunId, partnerId, scored, errRes.count, "batch");
}

async function finalizeScan(
  scanRunId: string,
  partnerId: string,
  scored: number,
  errored: number,
  path: "inline" | "batch",
): Promise<void> {
  await prisma.scanRun.update({
    where: { id: scanRunId },
    data: {
      status: "done",
      finishedAt: new Date(),
      scoredCount: scored,
      errorCount: errored,
    },
  });
  await writeAudit(prisma, {
    actor: agentActor("contact-scan"),
    action: "scan.importedContacts",
    targetType: "ScanRun",
    targetId: scanRunId,
    changes: { partnerId, scored, errored, path },
  }).catch(() => {});
}
