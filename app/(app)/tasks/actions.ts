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
import type { TaskPriority, TaskStatus, WorkCategory, MilestoneStatus } from "@/lib/generated/prisma/enums";

const VALID_PRIORITIES: TaskPriority[] = ["high", "medium", "low"];
const VALID_TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];
const VALID_CATEGORIES: WorkCategory[] = ["firm", "project", "pipeline", "other"];

// Board column → milestone health status, for promoteTaskToMilestone. Mirrors
// BOARD_TO_MILESTONE_STATUS in projects/[id]/actions.ts so a promoted card lands
// on the timeline with the right health.
const BOARD_TO_MILESTONE_STATUS: Record<TaskStatus, MilestoneStatus> = {
  todo: "pending",
  in_progress: "in_progress",
  in_review: "in_progress",
  done: "complete",
};

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
  dealId?: string; // optional parent deal (pipeline task — 2b)
  contactId?: string; // optional parent contact (2b)
  artifactId?: string; // optional parent deliverable (must belong to projectId)
  milestoneId?: string; // optional parent milestone (epic)
  reviewerId?: string; // optional partner asked to review the task's output (2h)
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
  const dealId = input.dealId || null;
  const contactId = input.contactId || null;
  const artifactId = input.artifactId || null;
  const milestoneId = input.milestoneId || null;
  const reviewerId = input.reviewerId || null;

  // Validate the tag FKs exist (task tagging — 2b). Loose-coupling: each scope
  // FK is independent; we don't require a particular combination.
  if (dealId) {
    const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true } });
    if (!deal) throw new Error("Deal not found");
  }
  if (contactId) {
    const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } });
    if (!contact) throw new Error("Contact not found");
  }

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

  // Reviewer (2h) — a partner asked to review the task's output. Validate + ping
  // them so the request lands in their "Claude" system chat.
  const reviewer = reviewerId
    ? await prisma.partner.findUnique({ where: { id: reviewerId }, select: { id: true } })
    : null;
  if (reviewerId && !reviewer) throw new Error("Reviewer not found");

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
        dealId,
        contactId,
        artifactId,
        milestoneId,
        reviewerId,
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
        dealId,
        contactId,
        artifactId,
        milestoneId,
        reviewerId,
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

    // Reviewer ping (2h) — only when the reviewer isn't the creator (no point
    // pinging yourself). Lands in the reviewer's "Claude" system chat.
    if (reviewer && reviewer.id !== creatorId) {
      await notifyPartner(
        tx,
        reviewer.id,
        "approval_needed",
        `${assignerName} asked you to review a task: ${title}`,
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
//
// Two pseudo-statuses ride on top of the real TaskStatus enum:
//   • "archive" → sets archivedAt = now() (the board's Archive column, 2g).
//     We do NOT push "archive" into the `status` column — it's not a valid
//     enum value. Use unarchiveTask / a real status move to bring it back.
//   • "in_review" → optionally records a reviewer and pings them (2h).
// ──────────────────────────────────────────────────────────────────────

export async function updateTaskStatus(taskId: string, status: string, reviewerId?: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actingPartnerId = session.user.partnerId;
  const actorName = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(actingPartnerId, actorName);

  const before = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, projectId: true, title: true, archivedAt: true },
  });
  if (!before) throw new Error("Task not found");

  // ── Archive branch (2g): move the card to the Archive column without
  // mutating its (enum-constrained) status. No-op if already archived. ──
  if (status === "archive") {
    if (before.archivedAt) return { ok: true as const };
    await prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id: taskId }, data: { archivedAt: new Date() } });
      await writeAudit(tx, {
        actor,
        action: "archive.task",
        targetType: "Task",
        targetId: taskId,
        changes: { archived: true },
      });
    });
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    if (before.projectId) revalidatePath(`/projects/${before.projectId}`);
    return { ok: true as const };
  }

  if (!VALID_TASK_STATUSES.includes(status as TaskStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }

  // Reviewer (2h) — only honoured on the in_review move. Validate + remember to
  // ping (outside the txn would race the write; we ping inside it).
  let reviewer: { id: string } | null = null;
  if (status === "in_review" && reviewerId) {
    reviewer = await prisma.partner.findUnique({ where: { id: reviewerId }, select: { id: true } });
    if (!reviewer) throw new Error("Reviewer not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: {
        status: status as TaskStatus,
        done: status === "done",
        // Moving into a real column clears any archive state (mirrors the
        // milestone board behaviour).
        archivedAt: null,
        ...(reviewer ? { reviewerId: reviewer.id } : {}),
      },
    });
    await writeAudit(tx, {
      actor,
      action: "update.task.status",
      targetType: "Task",
      targetId: taskId,
      changes: {
        status: { before: before.status, after: status },
        ...(reviewer ? { reviewerId: reviewer.id } : {}),
        ...(before.archivedAt ? { unarchived: true } : {}),
      },
    });

    // Reviewer ping (2h) — skip self-review. Lands in the reviewer's "Claude" chat.
    if (reviewer && reviewer.id !== actingPartnerId) {
      await notifyPartner(
        tx,
        reviewer.id,
        "approval_needed",
        `${actorName} asked you to review a task: ${before.title}`,
        { taskId, link: "/tasks" },
      );
    }
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath("/messages");
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
    dealId?: string | null; // null/"" untags (2b)
    contactId?: string | null; // null/"" untags (2b)
    reviewerId?: string | null; // null/"" clears the reviewer (2h)
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
    select: { id: true, ownerId: true, status: true, projectId: true, title: true, reviewerId: true },
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
  // Tag re-scoping (2b) — re-point the deal/contact the task hangs off.
  if (input.dealId !== undefined) {
    if (input.dealId) {
      const deal = await prisma.deal.findUnique({ where: { id: input.dealId }, select: { id: true } });
      if (!deal) throw new Error("Deal not found");
    }
    data.dealId = input.dealId || null;
  }
  if (input.contactId !== undefined) {
    if (input.contactId) {
      const contact = await prisma.contact.findUnique({ where: { id: input.contactId }, select: { id: true } });
      if (!contact) throw new Error("Contact not found");
    }
    data.contactId = input.contactId || null;
  }
  // Reviewer (2h) — validate, set/clear, and ping a newly-set reviewer.
  let notifyNewReviewer: string | null = null;
  if (input.reviewerId !== undefined) {
    const nextReviewerId = input.reviewerId || null; // "" / null → clear
    if (nextReviewerId !== before.reviewerId) {
      if (nextReviewerId) {
        const reviewer = await prisma.partner.findUnique({ where: { id: nextReviewerId }, select: { id: true } });
        if (!reviewer) throw new Error("Reviewer not found");
        if (nextReviewerId !== creatorId) notifyNewReviewer = nextReviewerId;
      }
      data.reviewerId = nextReviewerId;
    }
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
    if (notifyNewReviewer) {
      await notifyPartner(
        tx,
        notifyNewReviewer,
        "approval_needed",
        `${assignerName} asked you to review a task: ${updated.title}`,
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

// ──────────────────────────────────────────────────────────────────────
// archiveTask / unarchiveTask (2g) — move a task into (or out of) the
// board's Archive column. archivedAt is the timestamp the 7-day auto-hide
// reads (mirrors setMilestoneArchived in projects/[id]/actions.ts). Archiving
// leaves the task's `status`/`done` untouched (it's off the funnel, not done).
// ──────────────────────────────────────────────────────────────────────

export async function archiveTask(taskId: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const before = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, archivedAt: true },
  });
  if (!before) throw new Error("Task not found");

  // No-op if already archived (keeps the original archive time).
  if (before.archivedAt) return { ok: true as const };

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { archivedAt: new Date() } });
    await writeAudit(tx, {
      actor,
      action: "archive.task",
      targetType: "Task",
      targetId: taskId,
      changes: { archived: true },
    });
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (before.projectId) revalidatePath(`/projects/${before.projectId}`);
  return { ok: true as const };
}

export async function unarchiveTask(taskId: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const before = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, archivedAt: true },
  });
  if (!before) throw new Error("Task not found");

  if (!before.archivedAt) return { ok: true as const };

  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { archivedAt: null } });
    await writeAudit(tx, {
      actor,
      action: "unarchive.task",
      targetType: "Task",
      targetId: taskId,
      changes: { archived: false },
    });
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (before.projectId) revalidatePath(`/projects/${before.projectId}`);
  return { ok: true as const };
}

// ──────────────────────────────────────────────────────────────────────
// promoteTaskToMilestone (2a) — turn a standalone task into a milestone
// (epic). Carries title / owner / category / categoryLabel / project /
// client / dueDate over, then DELETES the task. Clean approach: a milestone
// is a distinct row type (no shared id), so we create the new Milestone and
// remove the Task rather than mutate one into the other. Any sub-tasks would
// be on a milestone, not a task, so there's no child relationship to re-point;
// a Message that linked the task (taskId) loses its link via SET NULL.
// ──────────────────────────────────────────────────────────────────────

export async function promoteTaskToMilestone(taskId: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      ownerId: true,
      category: true,
      categoryLabel: true,
      projectId: true,
      clientId: true,
      due: true,
      status: true,
    },
  });
  if (!task) throw new Error("Task not found");

  // Carry the task's board column onto the new milestone card; derive the
  // milestone health status from it (same table the board sync uses).
  const boardStatus = task.status;
  const milestoneStatus = BOARD_TO_MILESTONE_STATUS[boardStatus];

  // Resolve the project name for the activity feed (if scoped).
  const project = task.projectId
    ? await prisma.project.findUnique({ where: { id: task.projectId }, select: { id: true, name: true } })
    : null;

  const milestone = await prisma.$transaction(async (tx) => {
    const created = await tx.milestone.create({
      data: {
        title: task.title,
        // A task always has a due date (required); carry it to the timeline.
        dueDate: task.due,
        status: milestoneStatus,
        boardStatus,
        category: task.category,
        categoryLabel: task.categoryLabel,
        ownerId: task.ownerId,
        projectId: task.projectId,
        clientId: task.clientId,
      },
    });

    // Remove the source task (a Message taskId link goes null via SET NULL).
    await tx.task.delete({ where: { id: taskId } });

    await writeAudit(tx, {
      actor,
      action: "promote.task.milestone",
      targetType: "Milestone",
      targetId: created.id,
      changes: {
        fromTaskId: taskId,
        title: task.title,
        projectId: task.projectId,
        clientId: task.clientId,
        status: milestoneStatus,
      },
    });

    await writeActivity(tx, {
      actor,
      type: "status",
      target: project?.name ?? task.title,
      detail: `Promoted task to milestone — ${task.title}`,
      link: project ? `/projects/${project.id}` : "/tasks",
    });

    return created;
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath("/projects");
  if (task.projectId) revalidatePath(`/projects/${task.projectId}`);
  return { id: milestone.id };
}
