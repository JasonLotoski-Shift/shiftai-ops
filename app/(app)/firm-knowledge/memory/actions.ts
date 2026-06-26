"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";
import type { MemoryBlockKey } from "@/lib/generated/prisma/enums";

// Recent-memory editing. Two moves, both audited:
//   saveMemoryBlock  — store the working draft (NOT yet visible to skills)
//   approveMemoryBlock — promote the draft to approvedBody (what skills read)
// Approval is the only thing that flips content into AI context, honouring the
// firm's propose-never-auto-write rule.

const BODY_CAP = 12_000; // generous hard cap (~3k tokens); UI guides toward ~1.5k

async function currentPartner() {
  const session = await auth();
  const partnerId = session?.user?.partnerId;
  if (!partnerId) throw new Error("Not signed in");
  return { partnerId, name: session.user?.name ?? "Partner" };
}

export async function saveMemoryBlock(key: MemoryBlockKey, draftBody: string) {
  const { partnerId, name } = await currentPartner();
  const body = draftBody.slice(0, BODY_CAP);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.memoryBlock.findUnique({ where: { key }, select: { id: true } });
    if (!existing) throw new Error(`Memory block not found: ${key}`);
    await tx.memoryBlock.update({ where: { key }, data: { draftBody: body, updatedBy: name } });
    await writeAudit(tx, {
      actor: partnerActor(partnerId, name),
      action: "update.memory_block.draft",
      targetType: "MemoryBlock",
      targetId: existing.id,
      changes: { key },
    });
  });

  revalidatePath("/firm-knowledge/memory");
}

export async function approveMemoryBlock(key: MemoryBlockKey) {
  const { partnerId, name } = await currentPartner();

  await prisma.$transaction(async (tx) => {
    const block = await tx.memoryBlock.findUnique({ where: { key }, select: { id: true, draftBody: true } });
    if (!block) throw new Error(`Memory block not found: ${key}`);
    await tx.memoryBlock.update({
      where: { key },
      data: {
        approvedBody: block.draftBody,
        approvedById: partnerId,
        approvedAt: new Date(),
        asOf: new Date(),
        updatedBy: name,
      },
    });
    await writeAudit(tx, {
      actor: partnerActor(partnerId, name),
      action: "approve.memory_block",
      targetType: "MemoryBlock",
      targetId: block.id,
      changes: { key },
    });
  });

  // Approved content now loads into every skill — refresh both surfaces.
  revalidatePath("/firm-knowledge/memory");
  revalidatePath("/firm-knowledge");
}
