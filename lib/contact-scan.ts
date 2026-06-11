// Contact scan engine — rate a partner's imported contacts for fit against a
// configurable CRITERIA set (the scan settings, seeded from a Target Segment
// then edited), and record each scan as its own REPORT: one ScanResult row per
// scored contact, linked to the same master ImportedContact (no duplication).
//
// Two execution paths, chosen by list size in scan-actions:
//   • inline  (≤ INLINE_SCAN_THRESHOLD) — loop chunks, one messages.create per
//     chunk, write results immediately. Runs in after().
//   • batch   (larger) — submit ONE Anthropic Message Batch (~20 contacts per
//     request, half-price, timeout-proof); a later UI poll retrieves + ingests
//     the results once. The cached prefix (firm context + scan skill + the
//     criteria) is shared across all requests, so prompt caching is cheap.
//
// Plain async (NO "use server") so it's tsx-unit-testable.

import { prisma } from "@/lib/prisma";
import {
  getAnthropicClient,
  buildSystemBlocks,
  DEFAULT_MODEL_ID,
  type CachedSystemBlock,
} from "@/lib/ai";
import { writeAudit, agentActor } from "@/lib/audit";
import type { ScanCriteria } from "@/lib/types";

export const SCAN_CHUNK_SIZE = 20;
// At/below this many scannable rows, run inline (batch latency isn't worth it).
export const INLINE_SCAN_THRESHOLD = 40;
const SCAN_MAX_TOKENS = 2000;
// Bulk-ingest writes go in chunks of this many verdicts (one createMany + one
// raw UPDATE per chunk; ~25 queries total for a 5k scan instead of ~10,500).
export const INGEST_WRITE_CHUNK = 500;
// A "scoring" claim older than this is a dead invocation (bulk ingest takes
// seconds) — the run may be re-claimed and the idempotent ingest re-run.
export const INGEST_CLAIM_TTL_MS = 5 * 60 * 1000;
// Denormalized rationale budget on ScanResult/ImportedContact rows.
export const RATIONALE_MAX_CHARS = 400;

export type ScanRow = {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  domain: string | null;
  email: string | null;
};

// The model's per-contact verdict.
export type ScanVerdict = {
  index: number;
  score: number;
  leadType: "decision_maker" | "connector" | "none";
  rationale: string;
};

// One verdict resolved to its ImportedContact id, ready to write.
export type IngestRow = {
  contactId: string;
  score: number;
  leadType: ScanVerdict["leadType"];
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

// The scan criteria rendered as the "fitting company" definition (cached block).
export function criteriaBlock(c: ScanCriteria): string {
  const band = (min?: number, max?: number) =>
    min == null && max == null ? "any" : `${min ?? "?"} – ${max ?? "?"}`;
  return [
    "# Target criteria (the fitting-company definition)",
    `Industries: ${c.industries.join(", ") || "any"}`,
    `Revenue band (CAD): ${band(c.revenueMin, c.revenueMax)}`,
    `Employees: ${band(c.employeeMin, c.employeeMax)}`,
    `Geographies: ${c.geographies.join(", ") || "any"}`,
    `Company-type / signal keywords: ${c.keywords.join(", ") || "—"}`,
    c.seededFromName ? `(Seeded from segment: ${c.seededFromName})` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function contactsUserText(contacts: ScanContact[]): string {
  return [
    'Score each contact below for fit against the target criteria. Output ONLY the JSON array (one object per contact, keyed by "index") described in your instructions.',
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

function extractText(message: unknown): string {
  const m = message as { content?: { type: string; text?: string }[] } | null;
  if (!m?.content) return "";
  return m.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}

export function parseScanResults(raw: string): ScanVerdict[] {
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
  const out: ScanVerdict[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.index !== "number" || !Number.isInteger(o.index)) continue;
    let score = typeof o.score === "number" ? Math.trunc(o.score) : 1;
    if (Number.isNaN(score)) score = 1;
    score = Math.min(10, Math.max(1, score));
    const lt = o.leadType;
    const leadType: ScanVerdict["leadType"] =
      lt === "decision_maker" || lt === "connector" ? lt : "none";
    const rationale =
      typeof o.rationale === "string" && o.rationale.trim()
        ? o.rationale.trim()
        : "No rationale returned.";
    out.push({ index: o.index, score, leadType, rationale });
  }
  return out;
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

// Resolve batch verdicts (global `index`) to contact ids. `seen` is shared
// across the whole results stream so a repeated index never writes twice.
export function toIngestRows(
  verdicts: ScanVerdict[],
  contactIds: string[],
  seen: Set<number>,
): IngestRow[] {
  const out: IngestRow[] = [];
  for (const v of verdicts) {
    const contactId = contactIds[v.index];
    if (!contactId || seen.has(v.index)) continue;
    seen.add(v.index);
    out.push({
      contactId,
      score: v.score,
      leadType: v.leadType,
      rationale: v.rationale.slice(0, RATIONALE_MAX_CHARS),
    });
  }
  return out;
}

export function claimExpired(ingestClaimedAt: Date | null, now = new Date()): boolean {
  return (
    !ingestClaimedAt || now.getTime() - ingestClaimedAt.getTime() > INGEST_CLAIM_TTL_MS
  );
}

// Write one contact's result: the per-scan ScanResult row (the report "column")
// + the contact's denormalized latest score (for the master view). Idempotent
// via the (scanRunId, importedContactId) upsert.
async function writeResult(
  scanRunId: string,
  partnerId: string,
  contactId: string,
  v: ScanVerdict,
): Promise<void> {
  const rationale = v.rationale.slice(0, RATIONALE_MAX_CHARS);
  await prisma.scanResult.upsert({
    where: { scanRunId_importedContactId: { scanRunId, importedContactId: contactId } },
    create: { scanRunId, importedContactId: contactId, partnerLeadId: partnerId, score: v.score, leadType: v.leadType, rationale },
    update: { score: v.score, leadType: v.leadType, rationale },
  });
  await prisma.importedContact.updateMany({
    where: { id: contactId, partnerLeadId: partnerId },
    data: { scanStatus: "scored", scannedAt: new Date(), scanScore: v.score, leadType: v.leadType, scanRationale: rationale },
  });
}

// ── Inline path ─────────────────────────────────────────────────────────────

export async function runInlineScan(opts: {
  scanRunId: string;
  partnerId: string;
  rows: ScanRow[];
  criteria: ScanCriteria;
}): Promise<void> {
  const { scanRunId, partnerId, rows, criteria } = opts;
  await prisma.scanRun.update({ where: { id: scanRunId }, data: { status: "scoring" } });

  const blocks = await buildSystemBlocks("contact-scan", criteriaBlock(criteria));
  const client = getAnthropicClient();

  let scored = 0;
  let errored = 0;
  const chunks = chunk(rows, SCAN_CHUNK_SIZE);
  let base = 0;

  for (const ch of chunks) {
    const contacts = toScanContacts(ch, base);
    try {
      const res = await client.messages.create(buildScanParams(blocks, contacts));
      const verdicts = parseScanResults(extractText(res));
      const byIndex = new Map(verdicts.map((v) => [v.index, v]));
      for (let i = 0; i < ch.length; i++) {
        const v = byIndex.get(base + i);
        if (v) {
          await writeResult(scanRunId, partnerId, ch[i].id, v);
          scored++;
        } else {
          errored++;
        }
      }
    } catch (err) {
      console.error(`[contact-scan] inline chunk failed (base ${base}):`, err);
      errored += ch.length;
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
  criteria: ScanCriteria;
}): Promise<void> {
  const { scanRunId, rows, criteria } = opts;
  const blocks = await buildSystemBlocks("contact-scan", criteriaBlock(criteria));
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

// Set-based result writes: per 500-row chunk, one createMany (idempotent via
// the (scanRunId, importedContactId) unique key — a batch's verdicts never
// change, so skipping existing rows on re-ingest loses nothing) + one raw
// UPDATE with per-row values (Prisma updateMany can't do that). scoredCount is
// bumped per chunk so the UI poll shows live progress.
async function writeResultsBulk(
  scanRunId: string,
  partnerId: string,
  rows: IngestRow[],
): Promise<number> {
  let written = 0;
  for (const ch of chunk(rows, INGEST_WRITE_CHUNK)) {
    const recordset = JSON.stringify(
      ch.map((r) => ({
        id: r.contactId,
        score: r.score,
        leadType: r.leadType,
        rationale: r.rationale,
      })),
    );
    await prisma.$transaction([
      prisma.scanResult.createMany({
        data: ch.map((r) => ({
          scanRunId,
          importedContactId: r.contactId,
          partnerLeadId: partnerId,
          score: r.score,
          leadType: r.leadType,
          rationale: r.rationale,
        })),
        skipDuplicates: true,
      }),
      prisma.$executeRaw`
        UPDATE "ImportedContact" AS c
        SET "scanStatus"    = 'scored'::"ImportScanStatus",
            "scannedAt"     = now(),
            "scanScore"     = v.score,
            "leadType"      = v."leadType"::"ImportLeadType",
            "scanRationale" = v.rationale
        FROM jsonb_to_recordset(${recordset}::jsonb)
          AS v(id text, score int, "leadType" text, rationale text)
        WHERE c.id = v.id AND c."partnerLeadId" = ${partnerId}`,
    ]);
    written += ch.length;
    await prisma.scanRun
      .update({ where: { id: scanRunId }, data: { scoredCount: written } })
      .catch(() => {});
  }
  return written;
}

/**
 * Retrieve a finished batch's results and write the report rows. Idempotent:
 * createMany skipDuplicates + the repeatable per-row UPDATE mean a re-claimed
 * run (dead prior attempt) can safely re-ingest from the top.
 */
export async function ingestScanResults(opts: {
  scanRunId: string;
  partnerId: string;
  batchApiId: string;
  contactIds: string[];
}): Promise<void> {
  const { scanRunId, partnerId, batchApiId, contactIds } = opts;
  const client = getAnthropicClient();

  // Collect everything first (a few MB at 5k rows), then write set-based.
  const rows: IngestRow[] = [];
  const seen = new Set<number>();
  try {
    for await (const entry of await client.messages.batches.results(batchApiId)) {
      const result = entry.result;
      if (result.type !== "succeeded") continue;
      rows.push(
        ...toIngestRows(parseScanResults(extractText(result.message)), contactIds, seen),
      );
    }
  } catch (err) {
    console.error(`[contact-scan] batch results read failed for ${batchApiId}:`, err);
  }

  const scored = await writeResultsBulk(scanRunId, partnerId, rows);
  const errored = Math.max(0, contactIds.length - scored);
  await finalizeScan(scanRunId, partnerId, scored, errored, "batch");
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
    data: { status: "done", finishedAt: new Date(), scoredCount: scored, errorCount: errored },
  });
  await writeAudit(prisma, {
    actor: agentActor("contact-scan"),
    action: "scan.importedContacts",
    targetType: "ScanRun",
    targetId: scanRunId,
    changes: { partnerId, scored, errored, path },
  }).catch(() => {});
}
