"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";
import { createSignedUploadUrl, FIRM_KNOWLEDGE_BUCKET, isStorageConfigured } from "@/lib/storage";
import { isExtractable } from "@/lib/ingest/extract-file";
import { parseKnowledgeItem } from "@/lib/knowledge-parse";

// Firm Knowledge — Phase 3 write paths. Document upload is BROKER → direct-to-
// Storage → finalize:
//   requestKnowledgeUpload  — create a pending row + mint a signed upload URL
//   (browser PUTs the bytes straight to Storage — never through this function)
//   finalizeKnowledgeUpload — parse the stored blob (text + hash + summary)
// Plus the manual Decision Log + the approve gates. Every write is audited;
// nothing enters skill-readable context until reviewStatus flips to `approved`.

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB — generous; direct-to-Storage so no 4.5 MB function cap

async function currentPartner() {
  const session = await auth();
  const partnerId = session?.user?.partnerId;
  if (!partnerId) throw new Error("Not signed in");
  return { partnerId, name: session.user?.name ?? "Partner" };
}

/** Strip a filename to a storage-safe leaf (keep the extension). */
function safeName(fileName: string): string {
  const cleaned = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return cleaned.slice(-120) || "file";
}

export type RequestUploadInput = {
  title: string;
  fileName: string;
  mimeType?: string;
  byteSize: number;
  categoryId?: string | null;
  sensitivity?: "firm_wide" | "managing_partner";
};

export type RequestUploadResult =
  | { ok: true; id: string; uploadUrl: string }
  | { ok: false; error: string };

export async function requestKnowledgeUpload(input: RequestUploadInput): Promise<RequestUploadResult> {
  const { partnerId, name } = await currentPartner();

  const title = input.title?.trim() || input.fileName?.trim();
  if (!title) return { ok: false, error: "A title is required." };
  if (!input.fileName?.trim()) return { ok: false, error: "A file is required." };
  if (!isExtractable(input.fileName)) {
    return { ok: false, error: `Unsupported file type. Allowed: PDF, Word, Excel, HTML, Markdown, text.` };
  }
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    return { ok: false, error: "Empty file." };
  }
  if (input.byteSize > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `File too large (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).` };
  }
  if (!isStorageConfigured()) {
    return { ok: false, error: "Document storage isn't configured (SUPABASE_SERVICE_ROLE_KEY missing)." };
  }

  // Create the pending row FIRST so we have a stable id to namespace the object.
  const item = await prisma.knowledgeItem.create({
    data: {
      title,
      source: "uploaded",
      fileName: input.fileName,
      mimeType: input.mimeType ?? null,
      byteSize: Math.round(input.byteSize),
      knowledgeCategoryId: input.categoryId ?? null,
      sensitivity: input.sensitivity ?? "firm_wide",
      ownerId: partnerId,
      parseStatus: "pending",
      reviewStatus: "draft",
      createdBy: name,
    },
    select: { id: true },
  });

  const objectPath = `${item.id}/${safeName(input.fileName)}`;
  const signed = await createSignedUploadUrl(FIRM_KNOWLEDGE_BUCKET, objectPath);
  if (!signed) {
    // Roll back the orphan row — no blob will ever arrive.
    await prisma.knowledgeItem.delete({ where: { id: item.id } }).catch(() => {});
    return { ok: false, error: "Could not prepare the upload. Try again." };
  }

  await prisma.knowledgeItem.update({ where: { id: item.id }, data: { storagePath: signed.path } });

  await writeAudit(prisma, {
    actor: partnerActor(partnerId, name),
    action: "create.knowledge_item.upload",
    targetType: "KnowledgeItem",
    targetId: item.id,
    changes: { title, fileName: input.fileName },
  });

  return { ok: true, id: item.id, uploadUrl: signed.uploadUrl };
}

export type FinalizeResult = { ok: boolean; status: string; note?: string };

/** Called by the browser once the PUT to Storage succeeds. Parses inline so the
 *  partner sees a result immediately; the cron is the backstop if this never runs. */
export async function finalizeKnowledgeUpload(id: string): Promise<FinalizeResult> {
  await currentPartner(); // gate — must be signed in
  const outcome = await parseKnowledgeItem(id);
  revalidatePath("/firm-knowledge");
  return { ok: outcome.status === "parsed", status: outcome.status, note: outcome.note };
}

export type CreateDecisionInput = {
  title: string;
  context?: string;
  optionsConsidered?: string;
  decision: string;
  consequences?: string;
  decidedAt?: string; // YYYY-MM-DD
  categoryId?: string | null;
  sensitivity?: "firm_wide" | "managing_partner";
};

export async function createDecisionRecord(input: CreateDecisionInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { partnerId, name } = await currentPartner();
  const title = input.title?.trim();
  const decision = input.decision?.trim();
  if (!title) return { ok: false, error: "A title is required." };
  if (!decision) return { ok: false, error: "The decision is required." };

  const decidedAt = input.decidedAt && /^\d{4}-\d{2}-\d{2}$/.test(input.decidedAt)
    ? new Date(`${input.decidedAt}T00:00:00.000Z`)
    : new Date();

  const rec = await prisma.$transaction(async (tx) => {
    const r = await tx.decisionRecord.create({
      data: {
        title,
        context: input.context?.trim() || null,
        optionsConsidered: input.optionsConsidered?.trim() || null,
        decision,
        consequences: input.consequences?.trim() || null,
        decidedAt,
        decidedById: partnerId,
        decidedByLabel: name,
        knowledgeCategoryId: input.categoryId ?? null,
        sensitivity: input.sensitivity ?? "firm_wide",
        reviewStatus: "draft",
        createdBy: name,
      },
      select: { id: true },
    });
    await writeAudit(tx, {
      actor: partnerActor(partnerId, name),
      action: "create.decision_record",
      targetType: "DecisionRecord",
      targetId: r.id,
      changes: { title },
    });
    return r;
  });

  revalidatePath("/firm-knowledge");
  return { ok: true, id: rec.id };
}

/** Promote a knowledge item to `approved` — the only state a skill can retrieve.
 *  Stamps lastVerifiedAt so the freshness drumbeat resets. */
export async function approveKnowledgeItem(id: string): Promise<{ ok: boolean; error?: string }> {
  const { partnerId, name } = await currentPartner();
  await prisma.$transaction(async (tx) => {
    const item = await tx.knowledgeItem.findUnique({ where: { id }, select: { id: true, parseStatus: true } });
    if (!item) throw new Error("Item not found");
    await tx.knowledgeItem.update({
      where: { id },
      data: { reviewStatus: "approved", lastVerifiedAt: new Date() },
    });
    await writeAudit(tx, {
      actor: partnerActor(partnerId, name),
      action: "approve.knowledge_item",
      targetType: "KnowledgeItem",
      targetId: id,
      changes: {},
    });
  });
  revalidatePath("/firm-knowledge");
  return { ok: true };
}

export async function approveDecisionRecord(id: string): Promise<{ ok: boolean; error?: string }> {
  const { partnerId, name } = await currentPartner();
  await prisma.$transaction(async (tx) => {
    const rec = await tx.decisionRecord.findUnique({ where: { id }, select: { id: true } });
    if (!rec) throw new Error("Decision not found");
    await tx.decisionRecord.update({ where: { id }, data: { reviewStatus: "approved" } });
    await writeAudit(tx, {
      actor: partnerActor(partnerId, name),
      action: "approve.decision_record",
      targetType: "DecisionRecord",
      targetId: id,
      changes: {},
    });
  });
  revalidatePath("/firm-knowledge");
  return { ok: true };
}
