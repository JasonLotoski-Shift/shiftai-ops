"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";

// Call Reviews — Phase 7 read half. This file owns the write paths that hang off
// the surface: approving a distilled review, and promoting one durable lesson
// into the firm brain (a draft KnowledgeItem in the BD / Sales Playbook
// category). Every write is audited. Nothing enters skill-readable context until
// reviewStatus flips to `approved`: promotion creates the DRAFT here, and the
// existing firm-knowledge approve gate (approveKnowledgeItem, via the
// KnowledgeApproveButton on /firm-knowledge) is the one path that approves it —
// the same gate Lane 3 uses, reused, not duplicated.

// The BD/Sales Playbook category the Step-0 spine seeds. A promoted lesson files
// here so the playbook grows from real calls.
const PLAYBOOK_SLUG = "bd-sales-playbook";

async function currentPartner() {
  const session = await auth();
  const partnerId = session?.user?.partnerId;
  if (!partnerId) throw new Error("Not signed in");
  return { partnerId, name: session.user?.name ?? "Partner" };
}

/** Approve a distilled review so it counts as team-settled (draft → approved).
 *  Any partner may approve; the row's own sensitivity governs who can read it. */
export async function approveCallReview(id: string): Promise<{ ok: boolean; error?: string }> {
  const { partnerId, name } = await currentPartner();
  await prisma.$transaction(async (tx) => {
    const review = await tx.callReview.findUnique({ where: { id }, select: { id: true } });
    if (!review) throw new Error("Review not found");
    await tx.callReview.update({ where: { id }, data: { status: "approved" } });
    await writeAudit(tx, {
      actor: partnerActor(partnerId, name),
      action: "approve.call_review",
      targetType: "CallReview",
      targetId: id,
      changes: {},
    });
  });
  revalidatePath("/call-reviews");
  return { ok: true };
}

export type PromoteLessonResult =
  | { ok: true; knowledgeItemId: string }
  | { ok: false; error: string };

/** Promote one durable lesson from a review into the firm brain. Creates a draft
 *  KnowledgeItem in the BD / Sales Playbook category (source "manual", parsed —
 *  the text is already clean, no blob to extract) and stamps
 *  CallReview.promotedKnowledgeItemId so a lesson promotes once. The draft is
 *  invisible to skills until a partner runs the existing approve gate
 *  (approveKnowledgeItem). The review's sensitivity carries onto the item so an
 *  MP-only lesson stays MP-only in the brain. */
export async function promoteLesson(reviewId: string, lessonText: string): Promise<PromoteLessonResult> {
  const { partnerId, name } = await currentPartner();

  const lesson = lessonText?.trim();
  if (!lesson) return { ok: false, error: "The lesson text is empty." };

  const review = await prisma.callReview.findUnique({
    where: { id: reviewId },
    select: { id: true, title: true, sensitivity: true, promotedKnowledgeItemId: true },
  });
  if (!review) return { ok: false, error: "Review not found." };
  if (review.promotedKnowledgeItemId) {
    return { ok: false, error: "A lesson from this review has already been promoted." };
  }

  // Look up the seeded playbook category. Absent it, the item is still created
  // (uncategorised) rather than lost — the promotion is the point, the filing is
  // secondary.
  const category = await prisma.knowledgeCategory.findUnique({
    where: { slug: PLAYBOOK_SLUG },
    select: { id: true },
  });

  const title = `Lesson · ${review.title}`;

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.knowledgeItem.create({
      data: {
        title,
        source: "manual",
        summary: lesson,
        extractedText: lesson,
        parseStatus: "parsed",
        reviewStatus: "draft",
        knowledgeCategoryId: category?.id ?? null,
        sensitivity: review.sensitivity,
        ownerId: partnerId,
        generatedFromSkill: "call-review",
        createdBy: name,
      },
      select: { id: true },
    });

    // Link back so the same review can't double-promote.
    await tx.callReview.update({
      where: { id: reviewId },
      data: { promotedKnowledgeItemId: created.id },
    });

    await writeAudit(tx, {
      actor: partnerActor(partnerId, name),
      action: "promote.call_review.lesson",
      targetType: "KnowledgeItem",
      targetId: created.id,
      changes: { reviewId, title },
    });

    return created;
  });

  revalidatePath("/call-reviews");
  revalidatePath("/firm-knowledge");
  return { ok: true, knowledgeItemId: item.id };
}
