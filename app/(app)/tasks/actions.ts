"use server";

// Task-scoped server actions.
//
// Canonical mutation recipe (see app/(app)/dashboard/actions.ts header).
// toggleTaskDone lives in dashboard/actions.ts (shared by the dashboard
// breadcrumb + this page); creation/assignment lives here.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import type { TaskPriority } from "@/lib/generated/prisma/enums";

const VALID_PRIORITIES: TaskPriority[] = ["high", "medium", "low"];

/**
 * Create a task and (optionally) assign it to another partner. The owner IS
 * the assignee; assignedById records who handed it over (null when a partner
 * creates a task for themselves). Every task carries free-text context —
 * no task is a bare button.
 */
export async function createTask(input: {
  title: string;
  ownerId: string; // the assignee
  priority: string;
  due: string; // ISO date "YYYY-MM-DD"
  context?: string;
  relatedTo?: string;
  clientId?: string;
  projectId?: string;
}) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const creatorId = session.user.partnerId;
  const actor = partnerActor(
    creatorId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const title = input.title.trim();
  if (!title) throw new Error("Task title is required");
  if (!VALID_PRIORITIES.includes(input.priority as TaskPriority)) {
    throw new Error(`Invalid priority: ${input.priority}`);
  }
  const due = new Date(input.due);
  if (Number.isNaN(due.getTime())) throw new Error(`Invalid due date: ${input.due}`);

  const owner = await prisma.partner.findUnique({
    where: { id: input.ownerId },
    select: { id: true, name: true },
  });
  if (!owner) throw new Error("Assignee not found");

  // A hand-off records the assigner; a self-created task leaves it null.
  const assignedById = owner.id === creatorId ? null : creatorId;
  const context = input.context?.trim() || null;

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        title,
        priority: input.priority as TaskPriority,
        due,
        context,
        ownerId: owner.id,
        assignedById,
        relatedTo: input.relatedTo?.trim() || null,
        clientId: input.clientId || null,
        projectId: input.projectId || null,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.task",
      targetType: "Task",
      targetId: created.id,
      changes: {
        title,
        ownerId: owner.id,
        assignedById,
        priority: input.priority,
        due: due.toISOString(),
        hasContext: Boolean(context),
      },
    });

    await writeActivity(tx, {
      actor,
      type: "status",
      target: title,
      detail: assignedById ? `Assigned task to ${owner.name}` : "Created task",
      link: "/tasks",
    });

    return created;
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { id: task.id };
}
