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
import { notifyPartner } from "@/lib/messaging";
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
  artifactId?: string; // optional parent deliverable (must belong to projectId)
}) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const creatorId = session.user.partnerId;
  const assignerName = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(creatorId, assignerName);

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

  const projectId = input.projectId || null;
  const artifactId = input.artifactId || null;

  // A deliverable must belong to the chosen project (and a deliverable implies
  // a project). Guard against a mismatched pair from the form.
  if (artifactId) {
    if (!projectId) throw new Error("A deliverable requires a project");
    const artifact = await prisma.artifact.findUnique({
      where: { id: artifactId },
      select: { projectId: true },
    });
    if (!artifact) throw new Error("Deliverable not found");
    if (artifact.projectId !== projectId) {
      throw new Error("Deliverable does not belong to the selected project");
    }
  }

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
        projectId,
        artifactId,
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
        projectId,
        artifactId,
      },
    });

    await writeActivity(tx, {
      actor,
      type: "status",
      target: title,
      detail: assignedById ? `Assigned task to ${owner.name}` : "Created task",
      link: "/tasks",
    });

    // Hand-off: notify the assignee in their "Claude" system chat. One Task
    // row, surfaced in the system inbox + Tasks tab + feed. The note renders as
    // an inline task card (taskId) and clicks through to /tasks.
    if (assignedById) {
      await notifyPartner(
        tx,
        owner.id,
        "task_assigned",
        `${assignerName} assigned you a task: ${title}`,
        { taskId: created.id, link: "/tasks" },
      );
    }

    return created;
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath("/messages");
  return { id: task.id };
}
