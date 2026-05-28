"use server";

// Dashboard server actions.
//
// Canonical mutation recipe (see shiftai-ops/CLAUDE.md "Wire a Quick
// Action end-to-end" + docs/ROADMAP.md "Tracking architecture"):
//   1. Resolve the actor from the session.
//   2. Read the BEFORE state for the diff.
//   3. Mutate + writeAudit inside one $transaction so they're atomic.
//   4. revalidatePath so SSR caches refresh.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";

export async function toggleTaskDone(taskId: string) {
  const session = await auth();
  if (!session?.user?.partnerId) {
    throw new Error("Not authenticated");
  }
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const before = await prisma.task.findUnique({
    where: { id: taskId },
    select: { done: true },
  });
  if (!before) throw new Error("Task not found");
  const nextDone = !before.done;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { done: nextDone },
    });
    await writeAudit(tx, {
      actor,
      action: "update.task.done",
      targetType: "Task",
      targetId: taskId,
      changes: { done: { before: before.done, after: nextDone } },
    });
  });

  revalidatePath("/dashboard");
  return { done: nextDone };
}
