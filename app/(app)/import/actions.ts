"use server";

// Import Contacts — upload-side server actions.
//
// FREE work only (no enrichment, no per-row AI scoring): map the CSV columns,
// create the batch, and write the cleaned/deduped rows. The scan (scan-actions)
// and promotion (promote-actions) are separate, explicit, cost-aware steps.
//
// PRIVACY: every row is stamped with the importing partner's id and every read
// here is scoped through requirePartner(). Imported contacts are NEVER written
// to the shared Contacts table or the firm-wide Activity feed — they're private
// staging until a lead is promoted (Phase 4).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/import-auth";
import { writeAudit, partnerActor } from "@/lib/audit";
import { generate } from "@/lib/ai";
import { normalizeDomain } from "@/lib/apollo";
import {
  computeCompleteness,
  computeDedupeKey,
  heuristicMapping,
  type CleanedImportRow,
} from "@/lib/import-shared";
import type { ImportColumnMapping } from "@/lib/types";

const MAPPING_KEYS: (keyof ImportColumnMapping)[] = [
  "name",
  "firstName",
  "lastName",
  "title",
  "company",
  "email",
  "phone",
  "linkedin",
  "companyDomain",
];

const VALID_SOURCES = new Set(["linkedin", "google", "other"]);

// Personal-mailbox domains are NOT company domains — a gmail.com address tells
// us nothing about the employer, so we don't derive a company domain from it
// (that would poison promotion's domain-keyed upsert in Phase 4).
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "yahoo.ca",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "live.com",
  "msn.com",
]);

// Strip ```json fences and pull the first {...} object out of an LLM reply.
function parseMapping(raw: string, headers: string[]): Partial<ImportColumnMapping> {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
  }
  const headerSet = new Set(headers);
  const out: Partial<ImportColumnMapping> = {};
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    for (const key of MAPPING_KEYS) {
      const v = o[key];
      // Keep only mappings to a header that actually exists in the file.
      if (typeof v === "string" && headerSet.has(v)) out[key] = v;
    }
  } catch {
    // fall through — caller already has the heuristic mapping
  }
  return out;
}

// Derive a normalized company domain from the company-website column, else from
// a non-personal work email. Returns "" when unknown.
function domainFromRow(row: CleanedImportRow): string {
  if (row.companyDomain) {
    const d = normalizeDomain(row.companyDomain);
    if (d) return d;
  }
  if (row.email && row.email.includes("@")) {
    const d = normalizeDomain(row.email.split("@")[1]);
    if (d && !PERSONAL_EMAIL_DOMAINS.has(d)) return d;
  }
  return "";
}

/**
 * AI-assisted column mapping. Computes the heuristic mapping first (free,
 * instant), then overlays the import-column-map skill's suggestions where they
 * point at real headers. Falls back to the heuristic on any AI failure.
 */
export async function mapColumns(
  headers: string[],
  sampleRows: Record<string, string>[],
): Promise<ImportColumnMapping> {
  await requirePartner();
  const heuristic = heuristicMapping(headers);
  try {
    const ctx = [
      "Headers:",
      headers.map((h) => `- ${h}`).join("\n"),
      "",
      "Sample rows (up to 5):",
      JSON.stringify(sampleRows.slice(0, 5), null, 2),
    ].join("\n");
    const raw = await generate({
      skill: "import-column-map",
      context: ctx,
      intake: "Map these CSV headers to the contact fields. Output ONLY the JSON object.",
      maxTokens: 400,
    });
    const ai = parseMapping(raw, headers);
    return { ...heuristic, ...ai };
  } catch (err) {
    console.error("[import] mapColumns AI failed, using heuristic:", err);
    return heuristic;
  }
}

/** Create the batch row; the client then streams rows in via importContactsChunk. */
export async function createImportBatch(input: {
  filename: string;
  source: string;
  columnMapping?: ImportColumnMapping | null;
  totalRows: number;
}): Promise<{ batchId: string }> {
  const { partnerId, label } = await requirePartner();
  const source = VALID_SOURCES.has(input.source) ? input.source : "other";

  const batch = await prisma.importBatch.create({
    data: {
      partnerLeadId: partnerId,
      filename: input.filename.slice(0, 200) || "import.csv",
      source,
      columnMapping: (input.columnMapping ?? undefined) as object | undefined,
      totalRows: Math.max(0, Math.trunc(input.totalRows) || 0),
      createdBy: label,
    },
  });

  await writeAudit(prisma, {
    actor: partnerActor(partnerId, label),
    action: "create.importBatch",
    targetType: "ImportBatch",
    targetId: batch.id,
    changes: { filename: batch.filename, source, totalRows: batch.totalRows },
  });

  return { batchId: batch.id };
}

/**
 * Write one chunk of cleaned rows (the client sends ~500 at a time to stay
 * under the server-action body cap). Dedupe is enforced by the DB unique
 * (partnerLeadId, dedupeKey) via createMany skipDuplicates — this collapses
 * both intra-batch and cross-batch/cross-import duplicates in one round-trip.
 */
export async function importContactsChunk(
  batchId: string,
  rows: CleanedImportRow[],
): Promise<{ imported: number; duplicates: number; needsId: number }> {
  const { partnerId } = await requirePartner();

  // Ownership check — never trust a batchId without scoping to the partner.
  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, partnerLeadId: partnerId },
    select: { id: true },
  });
  if (!batch) throw new Error("Import batch not found");

  let needsId = 0;
  const data = rows.map((r) => {
    const completeness = computeCompleteness(r);
    if (completeness === "needs_identification") needsId++;
    return {
      partnerLeadId: partnerId,
      batchId,
      name: r.name?.trim() || "—",
      title: r.title?.trim() || null,
      company: r.company?.trim() || null,
      email: r.email?.trim() || null,
      phone: r.phone?.trim() || null,
      linkedin: r.linkedin?.trim() || null,
      domain: domainFromRow(r) || null,
      raw: (r.raw ?? {}) as object,
      completeness,
      dedupeKey: computeDedupeKey(r),
    };
  });

  const result = await prisma.importedContact.createMany({ data, skipDuplicates: true });
  const imported = result.count;
  const duplicates = rows.length - imported;

  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      importedRows: { increment: imported },
      duplicateRows: { increment: duplicates },
      needsIdCount: { increment: needsId },
    },
  });

  return { imported, duplicates, needsId };
}

/** Close out an import: ledger row + revalidate. Returns the batch totals. */
export async function finalizeImport(batchId: string): Promise<{
  imported: number;
  duplicates: number;
  needsId: number;
  total: number;
}> {
  const { partnerId, label } = await requirePartner();
  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, partnerLeadId: partnerId },
  });
  if (!batch) throw new Error("Import batch not found");

  await writeAudit(prisma, {
    actor: partnerActor(partnerId, label),
    action: "import.contacts",
    targetType: "ImportBatch",
    targetId: batch.id,
    changes: {
      imported: batch.importedRows,
      duplicates: batch.duplicateRows,
      needsId: batch.needsIdCount,
    },
  });

  // No writeActivity: the firm-wide feed must not surface a partner's private
  // import. The AuditLog above is the diligence ledger (not a user-facing feed).
  revalidatePath("/import");

  return {
    imported: batch.importedRows,
    duplicates: batch.duplicateRows,
    needsId: batch.needsIdCount,
    total: batch.totalRows,
  };
}
