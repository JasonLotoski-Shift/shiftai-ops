"use server";

// Pipeline board mutations.
//
// Canonical mutation recipe (see app/(app)/dashboard/actions.ts header).
// Per-deal conversion lives in pipeline/[id]/actions.ts; this is the
// board-level drag-to-restage move.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import type { DealStage } from "@/lib/generated/prisma/enums";

const STAGE_LABELS: Record<DealStage, string> = {
  lead: "Lead",
  qualified: "Qualified",
  discovery: "Discovery",
  proposal: "Proposal",
  negotiation: "Negotiation",
  signed: "Signed",
};

// Stages a card can be dragged into. "signed" is intentionally excluded —
// signing a deal runs the convert-deal flow (creates Client + Project +
// Drive folder), not a bare stage flip.
const DRAGGABLE_STAGES: DealStage[] = ["lead", "qualified", "discovery", "proposal", "negotiation"];

export async function updateDealStage(dealId: string, newStage: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  if (!DRAGGABLE_STAGES.includes(newStage as DealStage)) {
    throw new Error(
      newStage === "signed"
        ? "Use Convert to sign a deal — it scaffolds the client."
        : `Invalid stage: ${newStage}`,
    );
  }
  const stage = newStage as DealStage;

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { stage: true, company: true },
  });
  if (!deal) throw new Error("Deal not found");
  if (deal.stage === "signed") throw new Error("Signed deals can't be moved back on the board");
  if (deal.stage === stage) return { stage }; // no-op (dropped on same column)

  await prisma.$transaction(async (tx) => {
    await tx.deal.update({
      where: { id: dealId },
      // Moving a deal forward is a touch — reset the staleness clock.
      data: { stage, lastTouchAt: new Date() },
    });
    await writeAudit(tx, {
      actor,
      action: "update.deal.stage",
      targetType: "Deal",
      targetId: dealId,
      changes: { stage: { before: deal.stage, after: stage } },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: deal.company,
      detail: `Moved to ${STAGE_LABELS[stage]}`,
      link: `/pipeline/${dealId}`,
    });
  });

  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { stage };
}
