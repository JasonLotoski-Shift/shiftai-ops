"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";
import { currentIsManagingPartner } from "@/lib/permissions";

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
  const review = await prisma.callReview.findUnique({ where: { id }, select: { id: true, sensitivity: true } });
  if (!review) return { ok: false, error: "Review not found" };
  // The page filters managing_partner rows from non-MP sessions; the mutation must
  // enforce the same gate, since it takes a raw id and can be called directly.
  if (review.sensitivity === "managing_partner" && !(await currentIsManagingPartner())) {
    return { ok: false, error: "Only managing partners can act on this review." };
  }
  await prisma.$transaction(async (tx) => {
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
/** Thrown inside the promote transaction when the atomic once-only stamp loses a
 *  race, so the KnowledgeItem created in the same transaction rolls back. */
class AlreadyPromotedError extends Error {}

export async function promoteLesson(reviewId: string, lessonText: string): Promise<PromoteLessonResult> {
  const { partnerId, name } = await currentPartner();

  const lesson = lessonText?.trim();
  if (!lesson) return { ok: false, error: "The lesson text is empty." };

  const review = await prisma.callReview.findUnique({
    where: { id: reviewId },
    select: { id: true, title: true, sensitivity: true, promotedKnowledgeItemId: true, lessons: true },
  });
  if (!review) return { ok: false, error: "Review not found." };
  // Same MP gate as the page: a managing_partner review is off-limits to a non-MP
  // caller even by a direct action call with its id.
  if (review.sensitivity === "managing_partner" && !(await currentIsManagingPartner())) {
    return { ok: false, error: "Only managing partners can promote a lesson from this review." };
  }
  if (review.promotedKnowledgeItemId) {
    return { ok: false, error: "A lesson from this review has already been promoted." };
  }
  // The promoted body must be a lesson the review actually recorded — the client
  // sends the text, so a direct call can't inject arbitrary content into the brain.
  const norm = (s: string) => s.trim().toLowerCase();
  if (!review.lessons.some((l) => norm(l) === norm(lesson))) {
    return { ok: false, error: "That lesson isn't on this review." };
  }

  // Look up the seeded playbook category. Absent it, the item is still created
  // (uncategorised) rather than lost — the promotion is the point, the filing is
  // secondary.
  const category = await prisma.knowledgeCategory.findUnique({
    where: { slug: PLAYBOOK_SLUG },
    select: { id: true },
  });

  const title = `Lesson · ${review.title}`;

  try {
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

      // Atomic once-only stamp: link the review to this item only while it has
      // none. A concurrent promote that already stamped makes this match zero rows,
      // and throwing rolls back the KnowledgeItem created just above — no orphans.
      const stamp = await tx.callReview.updateMany({
        where: { id: reviewId, promotedKnowledgeItemId: null },
        data: { promotedKnowledgeItemId: created.id },
      });
      if (stamp.count !== 1) throw new AlreadyPromotedError();

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
  } catch (e) {
    if (e instanceof AlreadyPromotedError) {
      return { ok: false, error: "A lesson from this review has already been promoted." };
    }
    throw e;
  }
}
