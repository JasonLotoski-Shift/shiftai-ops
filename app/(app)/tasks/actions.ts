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
import type { TaskPriority, TaskStatus, WorkCategory } from "@/lib/generated/prisma/enums";

const VALID_PRIORITIES: TaskPriority[] = ["high", "medium", "low"];
const VALID_TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];
const VALID_CATEGORIES: WorkCategory[] = ["firm", "project", "pipeline", "other"];

function deriveTaskCategory(scope: { projectId?: string | null; clientId?: string | null }): WorkCategory {
  if (scope.projectId) return "project";
  if (scope.clientId) return "project";
  return "firm";
}

/**
 * Create a task and (optionally) assign it to another partner. The owner IS
 * the assignee; assignedById records who handed it over (null when a partner
 * creates a task for themselves). Every task carries free-text context —
 * no task is a bare button.
 */
export async function createTask(input: {
  title: string;
  ownerId?: string; // the assignee — optional (a task can sit unassigned)
  priority: string;
  due: string; // ISO date "YYYY-MM-DD"
  context?: string;
  relatedTo?: string;
  clientId?: string;
  projectId?: string;
  artifactId?: string; // optional parent deliverable (must belong to projectId)
  milestoneId?: string; // optional parent milestone (epic)
  status?: string; // board column — default "todo"
  category?: string; // card colour/tag — default derived from scope
  categoryLabel?: string;
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

  const status = (input.status as TaskStatus) ?? "todo";
  if (!VALID_TASK_STATUSES.includes(status)) throw new Error(`Invalid status: ${input.status}`);
  const category = input.category && VALID_CATEGORIES.includes(input.category as WorkCategory)
    ? (input.category as WorkCategory)
    : deriveTaskCategory(input);

  // Owner is optional — a task can be created unassigned.
  const owner = input.ownerId
    ? await prisma.partner.findUnique({ where: { id: input.ownerId }, select: { id: true, name: true } })
    : null;
  if (input.ownerId && !owner) throw new Error("Assignee not found");

  const projectId = input.projectId || null;
  const artifactId = input.artifactId || null;
  const milestoneId = input.milestoneId || null;

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
  if (milestoneId) {
    const m = await prisma.milestone.findUnique({ where: { id: milestoneId }, select: { id: true } });
    if (!m) throw new Error("Milestone not found");
  }

  // A hand-off records the assigner; self-created / unassigned leaves it null.
  const assignedById = owner && owner.id !== creatorId ? creatorId : null;
  const context = input.context?.trim() || null;

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        title,
        priority: input.priority as TaskPriority,
        due,
        context,
        status,
        done: status === "done",
        category,
        categoryLabel: input.categoryLabel?.trim() || null,
        ownerId: owner?.id ?? null,
        assignedById,
        relatedTo: input.relatedTo?.trim() || null,
        clientId: input.clientId || null,
        projectId,
        artifactId,
        milestoneId,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.task",
      targetType: "Task",
      targetId: created.id,
      changes: {
        title,
        ownerId: owner?.id ?? null,
        assignedById,
        priority: input.priority,
        due: due.toISOString(),
        hasContext: Boolean(context),
        projectId,
        artifactId,
        milestoneId,
        status,
        category,
      },
    });

    await writeActivity(tx, {
      actor,
      type: "status",
      target: title,
      detail: assignedById && owner ? `Assigned task to ${owner.name}` : "Created task",
      link: "/tasks",
    });

    // Hand-off: notify the assignee in their "Claude" system chat. One Task
    // row, surfaced in the system inbox + Tasks tab + feed. The note renders as
    // an inline task card (taskId) and clicks through to /tasks.
    if (assignedById && owner) {
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

// ──────────────────────────────────────────────────────────────────────
// updateTaskStatus — move a card across the board's columns. Keeps the
// `done` boolean in sync (done === status "done") so dashboard widgets and
// toggleTaskDone stay consistent.
// ──────────────────────────────────────────────────────────────────────

export async function updateTaskStatus(taskId: string, status: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  if (!VALID_TASK_STATUSES.includes(status as TaskStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const before = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, projectId: true, title: true },
  });
  if (!before) throw new Error("Task not found");

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { status: status as TaskStatus, done: status === "done" },
    });
    await writeAudit(tx, {
      actor,
      action: "update.task.status",
      targetType: "Task",
      targetId: taskId,
      changes: { status: { before: before.status, after: status } },
    });
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (before.projectId) revalidatePath(`/projects/${before.projectId}`);
  return { ok: true as const };
}

// ──────────────────────────────────────────────────────────────────────
// updateTask — edit a task's fields from the board (assignee / status /
// category / milestone / priority / due / title / context).
// ──────────────────────────────────────────────────────────────────────

export async function updateTask(
  taskId: string,
  input: {
    title?: string;
    ownerId?: string | null; // null/"" unassigns
    status?: string;
    priority?: string;
    due?: string;
    category?: string;
    categoryLabel?: string | null;
    milestoneId?: string | null;
    context?: string | null;
  },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const creatorId = session.user.partnerId;
  const assignerName = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(creatorId, assignerName);

  const before = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, ownerId: true, status: true, projectId: true },
  });
  if (!before) throw new Error("Task not found");

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new Error("Task title is required");
    data.title = t;
  }
  let notifyNewOwner: string | null = null;
  if (input.ownerId !== undefined) {
    const nextOwnerId = input.ownerId || null; // "" / null → unassign
    if (nextOwnerId !== before.ownerId) {
      if (nextOwnerId) {
        const owner = await prisma.partner.findUnique({ where: { id: nextOwnerId }, select: { id: true } });
        if (!owner) throw new Error("Assignee not found");
        data.assignedById = nextOwnerId === creatorId ? null : creatorId;
        if (nextOwnerId !== creatorId) notifyNewOwner = nextOwnerId;
      } else {
        data.assignedById = null;
      }
      data.ownerId = nextOwnerId;
    }
  }
  if (input.status !== undefined) {
    if (!VALID_TASK_STATUSES.includes(input.status as TaskStatus)) throw new Error(`Invalid status: ${input.status}`);
    data.status = input.status as TaskStatus;
    data.done = input.status === "done";
  }
  if (input.priority !== undefined) {
    if (!VALID_PRIORITIES.includes(input.priority as TaskPriority)) throw new Error(`Invalid priority: ${input.priority}`);
    data.priority = input.priority as TaskPriority;
  }
  if (input.due !== undefined) {
    const d = new Date(input.due);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid due date: ${input.due}`);
    data.due = d;
  }
  if (input.category !== undefined) {
    if (!VALID_CATEGORIES.includes(input.category as WorkCategory)) throw new Error(`Invalid category: ${input.category}`);
    data.category = input.category as WorkCategory;
  }
  if (input.categoryLabel !== undefined) data.categoryLabel = input.categoryLabel?.trim() || null;
  if (input.milestoneId !== undefined) {
    if (input.milestoneId) {
      const m = await prisma.milestone.findUnique({ where: { id: input.milestoneId }, select: { id: true } });
      if (!m) throw new Error("Milestone not found");
    }
    data.milestoneId = input.milestoneId || null;
  }
  if (input.context !== undefined) data.context = input.context?.trim() || null;

  const title = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: taskId }, data, select: { title: true } });
    await writeAudit(tx, {
      actor,
      action: "update.task",
      targetType: "Task",
      targetId: taskId,
      changes: { fields: Object.keys(data) },
    });
    if (notifyNewOwner) {
      await notifyPartner(
        tx,
        notifyNewOwner,
        "task_assigned",
        `${assignerName} assigned you a task: ${updated.title}`,
        { taskId, link: "/tasks" },
      );
    }
    return updated.title;
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath("/messages");
  if (before.projectId) revalidatePath(`/projects/${before.projectId}`);
  return { ok: true as const, title };
}

// ──────────────────────────────────────────────────────────────────────
// deleteTask — remove a task (used for milestone sub-tasks on the project
// epic + the board detail modal, and orphan tasks). A system message that
// linked to it (taskId) loses the link (FK is SET NULL) — no card to delete.
// ──────────────────────────────────────────────────────────────────────

export async function deleteTask(taskId: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const before = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, projectId: true, milestoneId: true },
  });
  if (!before) throw new Error("Task not found");

  await prisma.$transaction(async (tx) => {
    await tx.task.delete({ where: { id: taskId } });
    await writeAudit(tx, {
      actor,
      action: "delete.task",
      targetType: "Task",
      targetId: taskId,
      changes: { title: before.title, milestoneId: before.milestoneId, projectId: before.projectId },
    });
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (before.projectId) revalidatePath(`/projects/${before.projectId}`);
  return { ok: true as const };
}
