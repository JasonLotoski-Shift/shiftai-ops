"use server";

// Contact-scoped server actions.
//
// Canonical mutation recipe (see app/(app)/dashboard/actions.ts header).

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";
import type { InteractionType } from "@/lib/generated/prisma/enums";

// Accept only the schema's enum values — defense in depth on top of the
// <select> in LogInteractionModal.
const VALID_TYPES: InteractionType[] = ["call", "meeting", "email_sent", "email_received", "other"];

export async function logInteraction(
  contactId: string,
  input: {
    type: string; // underscored Prisma identifier (e.g. "email_sent")
    date: string; // ISO date "YYYY-MM-DD"
    summary: string;
    channel?: string;
  },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const summary = input.summary.trim();
  if (!summary) throw new Error("Summary is required");
  if (!VALID_TYPES.includes(input.type as InteractionType)) {
    throw new Error(`Invalid interaction type: ${input.type}`);
  }
  const date = new Date(input.date);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${input.date}`);

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, lastTouchAt: true },
  });
  if (!contact) throw new Error("Contact not found");

  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );
  const advanceTouch = date > contact.lastTouchAt;

  const interaction = await prisma.$transaction(async (tx) => {
    const created = await tx.interaction.create({
      data: {
        contactId,
        type: input.type as InteractionType,
        date,
        summary,
        channel: input.channel?.trim() || null,
        // Partner display name as the actor label — agents use "AGENT · CLAUDE".
        loggedBy: session.user.name ?? session.user.email ?? "Unknown",
      },
    });

    if (advanceTouch) {
      await tx.contact.update({
        where: { id: contactId },
        data: { lastTouchAt: date },
      });
    }

    await writeAudit(tx, {
      actor,
      action: "create.interaction",
      targetType: "Interaction",
      targetId: created.id,
      changes: {
        contactId,
        type: input.type,
        date: date.toISOString(),
        summaryLength: summary.length,
        advancedLastTouch: advanceTouch,
      },
    });

    return created;
  });

  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/contacts");
  return { id: interaction.id };
}
