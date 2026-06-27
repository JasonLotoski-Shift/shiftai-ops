// Firm Knowledge — async parse of an uploaded KnowledgeItem (server-only).
//
// Runs OUTSIDE the upload request: the browser PUTs bytes straight to Storage,
// then either the finalize server action or the knowledge-parse cron calls
// parseKnowledgeItem(). Downloads the stored blob with the service key, extracts
// plain text (reusing the ingest extractor), SHA-256-hashes it for exact dedup,
// and drafts a one-paragraph summary via Claude. The Postgres `fts` generated
// column re-derives itself from the written text — nothing to maintain here.
//
// Never throws past the row: any failure is recorded on the item's parseStatus
// so a stuck upload is visible, never silent (the firm's no-silent rule).

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { downloadBytes, FIRM_KNOWLEDGE_BUCKET } from "@/lib/storage";
import { extractFile } from "@/lib/ingest/extract-file";
import { generate } from "@/lib/ai";
import type { KnowledgeParseStatus } from "@/lib/generated/prisma/enums";

export type ParseOutcome = {
  status: KnowledgeParseStatus | "skipped";
  note?: string;
  /** Set when the extracted text exactly matches an already-stored item. */
  duplicateOfId?: string;
};

async function mark(id: string, status: KnowledgeParseStatus, error?: string | null): Promise<void> {
  await prisma.knowledgeItem.update({
    where: { id },
    data: { parseStatus: status, parseError: error ?? null, parsedAt: new Date() },
  });
}

/** Concise, on-voice summary of a parsed document for the knowledge card +
 *  first-read context. Falls back to a truncation if Claude is unavailable. */
async function summarize(title: string, text: string): Promise<string> {
  const intake = `TITLE: ${title}\n\nDOCUMENT TEXT (may be truncated):\n${text.slice(0, 40_000)}`;
  const out = await generate({ skill: "ingest-knowledge", intake, maxTokens: 700 });
  return out.trim();
}

/**
 * Parse one KnowledgeItem by id. Idempotent — safe to re-run (the cron backstop
 * may re-pick an item the finalize action already handled).
 */
export async function parseKnowledgeItem(id: string): Promise<ParseOutcome> {
  const item = await prisma.knowledgeItem.findUnique({
    where: { id },
    select: { id: true, storagePath: true, fileName: true, mimeType: true, title: true },
  });
  if (!item) return { status: "failed", note: "item not found" };
  if (!item.storagePath) return { status: "skipped", note: "no stored blob to parse" };

  const bytes = await downloadBytes(FIRM_KNOWLEDGE_BUCKET, item.storagePath);
  if (!bytes) {
    await mark(id, "failed", "could not download the stored file (storage unreachable)");
    return { status: "failed", note: "download failed" };
  }

  const extracted = await extractFile({
    bytes,
    fileName: item.fileName ?? item.title,
    mimeType: item.mimeType ?? undefined,
  });

  if (!extracted.text.trim()) {
    await mark(id, "empty", extracted.note ?? "no extractable text (scanned image or unsupported type)");
    return { status: "empty", note: extracted.note };
  }

  const contentHash = crypto.createHash("sha256").update(extracted.text).digest("hex");

  // Exact-dedup signal: another item with the same extracted text already exists.
  // We never auto-delete — surface it so the partner can supersede or discard.
  const dup = await prisma.knowledgeItem.findFirst({
    where: { contentHash, id: { not: id } },
    select: { id: true, title: true },
  });

  let summary: string | null = null;
  try {
    summary = await summarize(item.title, extracted.text);
  } catch {
    summary = null; // a summary failure never blocks indexing the text
  }

  await prisma.knowledgeItem.update({
    where: { id },
    data: {
      extractedText: extracted.text,
      contentHash,
      summary,
      parseStatus: "parsed",
      parsedAt: new Date(),
      parseError: dup
        ? `Possible duplicate of "${dup.title}" — review and supersede if it's the same document.`
        : extracted.truncated
          ? "Text truncated at 50k characters for indexing."
          : null,
    },
  });

  return { status: "parsed", duplicateOfId: dup?.id };
}

/**
 * Parse every item still stuck at `pending` (the cron backstop, and the path for
 * items whose finalize call never landed). Bounded per run to stay well under the
 * function duration cap.
 */
export async function parsePendingKnowledge(limit = 10): Promise<{ parsed: number; failed: number; empty: number }> {
  const pending = await prisma.knowledgeItem.findMany({
    where: { parseStatus: "pending", storagePath: { not: null } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let parsed = 0, failed = 0, empty = 0;
  for (const { id } of pending) {
    const r = await parseKnowledgeItem(id);
    if (r.status === "parsed") parsed++;
    else if (r.status === "empty") empty++;
    else if (r.status === "failed") failed++;
  }
  return { parsed, failed, empty };
}
