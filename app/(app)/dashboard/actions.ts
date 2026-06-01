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
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";

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
    select: { done: true, title: true },
  });
  if (!before) throw new Error("Task not found");
  const nextDone = !before.done;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      // Keep the board status in sync. Completing → "done"; reopening returns
      // it to "todo" (the board's first column).
      data: { done: nextDone, status: nextDone ? "done" : "todo" },
    });
    await writeAudit(tx, {
      actor,
      action: "update.task.done",
      targetType: "Task",
      targetId: taskId,
      changes: { done: { before: before.done, after: nextDone } },
    });
    // Completions are feed-worthy; reopening a task is noise, so skip it.
    if (nextDone) {
      await writeActivity(tx, {
        actor,
        type: "status",
        target: before.title,
        detail: "Completed task",
        link: "/tasks",
      });
    }
  });

  revalidatePath("/dashboard");
  revalidatePath("/tasks");
  return { done: nextDone };
}
