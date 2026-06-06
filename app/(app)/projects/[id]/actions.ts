"use server";

// Project-scoped server actions (manual partner entry).
//
// Canonical mutation recipe (see app/(app)/dashboard/actions.ts header):
// validate → resolve actor from session → mutate + writeAudit (+ writeActivity)
// inside one $transaction → revalidate affected routes.
//
// These three actions are all MANUAL partner entries — created live, no
// approval queue. (The approval queue is only for AI-suggested milestones /
// deliverables, handled by a different agent surface.)

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { notifyPartner } from "@/lib/messaging";
import type {
  MilestoneStatus,
  ArtifactType,
  TaskPriority,
  ProjectType,
  ProjectPhase,
  WorkCategory,
  TaskStatus,
} from "@/lib/generated/prisma/enums";

const VALID_TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];

// Board column → milestone health status, so the timeline stays coherent when
// a milestone card is dragged through the funnel.
const BOARD_TO_MILESTONE_STATUS: Record<TaskStatus, MilestoneStatus> = {
  todo: "pending",
  in_progress: "in_progress",
  in_review: "in_progress",
  done: "complete",
};

const VALID_MILESTONE_STATUSES: MilestoneStatus[] = [
  "pending",
  "in_progress",
  "complete",
  "at_risk",
];

const VALID_ARTIFACT_TYPES: ArtifactType[] = [
  "proposal",
  "deck",
  "email",
  "sow",
  "invoice",
  "report",
  "other",
];

const VALID_PRIORITIES: TaskPriority[] = ["high", "medium", "low"];

const VALID_PROJECT_TYPES: ProjectType[] = [
  "discovery_report",
  "pilot_project",
  "subscription",
  "full_build",
  "buyout",
];

// Keep the back-compat `phase` aligned with the engagement type when the type
// is explicitly set (the UI shows projectType; phase still drives the invoice
// badge + some lists). Subscription / buy-out are operating engagements.
const PHASE_BY_TYPE: Record<string, ProjectPhase> = {
  discovery_report: "discovery",
  pilot_project: "build",
  full_build: "build",
  subscription: "run",
  buyout: "run",
};

const VALID_CATEGORIES: WorkCategory[] = ["firm", "project", "pipeline", "other"];

// Default a work category from what the item is tied to.
function deriveCategory(scope: { projectId?: string | null; dealId?: string | null; clientId?: string | null }): WorkCategory {
  if (scope.projectId) return "project";
  if (scope.dealId) return "pipeline";
  if (scope.clientId) return "project";
  return "firm";
}

// ──────────────────────────────────────────────────────────────────────
// setProjectFee — edit the project's fixed fee (budgetFee). Converted deals
// seed this from the deal value; this lets a partner correct it.
// ──────────────────────────────────────────────────────────────────────

export async function setProjectFee(projectId: string, amount: number) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const fee = Math.round(Number(amount));
  if (!Number.isFinite(fee) || fee < 0) throw new Error("Enter a valid fee (≥ 0)");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, budgetFee: true },
  });
  if (!project) throw new Error("Project not found");

  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data: { budgetFee: fee } });
    await writeAudit(tx, {
      actor,
      action: "update.project.fee",
      targetType: "Project",
      targetId: projectId,
      changes: { fee: { before: project.budgetFee, after: fee } },
    });
  });

  // Does the standard 50/25/25 schedule now drift from the new value? If so the
  // UI offers a regenerate (unless an installment is already invoiced — then we
  // never clobber it and the partner adjusts manually).
  const base = await prisma.billingInstallment.findMany({
    where: { projectId, isExtra: false },
    select: { amount: true, status: true },
  });
  const scheduledSum = base.reduce((s, i) => s + i.amount, 0);
  const anyInvoiced = base.some((i) => i.status !== "planned");
  const scheduleSuggestRegen = base.length > 0 && scheduledSum !== fee;

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/invoices");
  return {
    ok: true as const,
    scheduleSuggestRegen,
    scheduleBlocked: scheduleSuggestRegen && anyInvoiced,
  };
}

// ──────────────────────────────────────────────────────────────────────
// setProjectType — set/change the engagement type (shown in place of phase).
// ──────────────────────────────────────────────────────────────────────

export async function setProjectType(projectId: string, projectType: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  if (!VALID_PROJECT_TYPES.includes(projectType as ProjectType)) {
    throw new Error(`Invalid project type: ${projectType}`);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, projectType: true, phase: true },
  });
  if (!project) throw new Error("Project not found");

  const phase = PHASE_BY_TYPE[projectType] ?? project.phase;

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: { projectType: projectType as ProjectType, phase },
    });
    await writeAudit(tx, {
      actor,
      action: "update.project.type",
      targetType: "Project",
      targetId: projectId,
      changes: {
        type: { before: project.projectType, after: projectType },
        ...(phase !== project.phase ? { phase: { before: project.phase, after: phase } } : {}),
      },
    });
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { ok: true as const };
}

// ──────────────────────────────────────────────────────────────────────
// setProjectName — rename the project. The name is shown everywhere via FK
// join (projects list, task board, invoices, client detail, header), so a
// single write propagates on next render — no denormalized copies to chase.
// Append-only logs (Activity / Audit / Messages) keep their point-in-time
// snapshot by design.
// ──────────────────────────────────────────────────────────────────────

export async function setProjectName(projectId: string, name: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Project name is required");
  if (trimmed.length > 200) throw new Error("Project name is too long (max 200 chars)");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) throw new Error("Project not found");

  if (trimmed !== project.name) {
    await prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id: projectId }, data: { name: trimmed } });
      await writeAudit(tx, {
        actor,
        action: "update.project.name",
        targetType: "Project",
        targetId: projectId,
        changes: { name: { before: project.name, after: trimmed } },
      });
    });
  }

  // Refresh every surface that shows the project name via join.
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/tasks");
  revalidatePath("/invoices");
  revalidatePath("/clients", "layout");
  return { ok: true as const };
}

// ──────────────────────────────────────────────────────────────────────
// setProjectDates — edit the project's start and/or target-end date. Both
// optional; if both are supplied, start must not be after end. Drives the
// delivery timeline and the projects-list timeline column.
// ──────────────────────────────────────────────────────────────────────

export async function setProjectDates(
  projectId: string,
  input: { startDate?: string; targetEndDate?: string },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, startDate: true, targetEndDate: true },
  });
  if (!project) throw new Error("Project not found");

  const data: { startDate?: Date; targetEndDate?: Date } = {};
  if (input.startDate !== undefined) {
    const d = new Date(input.startDate);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid start date: ${input.startDate}`);
    data.startDate = d;
  }
  if (input.targetEndDate !== undefined) {
    const d = new Date(input.targetEndDate);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid target end date: ${input.targetEndDate}`);
    data.targetEndDate = d;
  }
  if (data.startDate === undefined && data.targetEndDate === undefined) {
    throw new Error("Nothing to update");
  }

  const start = data.startDate ?? project.startDate;
  const end = data.targetEndDate ?? project.targetEndDate;
  if (start > end) throw new Error("Start date must be on or before the target end date");

  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data });
    await writeAudit(tx, {
      actor,
      action: "update.project.dates",
      targetType: "Project",
      targetId: projectId,
      changes: {
        ...(data.startDate
          ? { startDate: { before: project.startDate.toISOString(), after: data.startDate.toISOString() } }
          : {}),
        ...(data.targetEndDate
          ? { targetEndDate: { before: project.targetEndDate.toISOString(), after: data.targetEndDate.toISOString() } }
          : {}),
      },
    });
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { ok: true as const };
}

// ──────────────────────────────────────────────────────────────────────
// createMilestone — a milestone is the firm's universal unit of work. It may
// be tied to a project, a deal/client, or nothing (firm-level BD/Admin). Has
// an optional owner + a category (defaulted from scope). Date is optional.
// ──────────────────────────────────────────────────────────────────────

export async function createMilestone(input: {
  title: string;
  status?: string; // default "pending"
  dueDate?: string | null; // optional — undated milestones aren't on the timeline
  ownerId?: string | null;
  category?: string; // default derived from scope
  categoryLabel?: string | null;
  projectId?: string | null;
  clientId?: string | null;
  dealId?: string | null;
}) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const title = input.title.trim();
  if (!title) throw new Error("Milestone title is required");

  const status = (input.status as MilestoneStatus) ?? "pending";
  if (!VALID_MILESTONE_STATUSES.includes(status)) {
    throw new Error(`Invalid milestone status: ${input.status}`);
  }

  let dueDate: Date | null = null;
  if (input.dueDate) {
    dueDate = new Date(input.dueDate);
    if (Number.isNaN(dueDate.getTime())) throw new Error(`Invalid due date: ${input.dueDate}`);
  }

  const category = (input.category && VALID_CATEGORIES.includes(input.category as WorkCategory)
    ? (input.category as WorkCategory)
    : deriveCategory(input));

  // Validate the project (if scoped) so we can name it in the activity feed.
  const project = input.projectId
    ? await prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true, name: true } })
    : null;
  if (input.projectId && !project) throw new Error("Project not found");

  const milestone = await prisma.$transaction(async (tx) => {
    const created = await tx.milestone.create({
      data: {
        title,
        dueDate,
        status,
        category,
        categoryLabel: input.categoryLabel?.trim() || null,
        ownerId: input.ownerId || null,
        projectId: input.projectId || null,
        clientId: input.clientId || null,
        dealId: input.dealId || null,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.milestone",
      targetType: "Milestone",
      targetId: created.id,
      changes: { title, status, category, projectId: input.projectId ?? null, ownerId: input.ownerId ?? null },
    });

    await writeActivity(tx, {
      actor,
      type: "status",
      target: project?.name ?? "Firm",
      detail: `Added milestone — ${title}`,
      link: project ? `/projects/${project.id}` : "/tasks",
    });

    return created;
  });

  if (input.projectId) revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/projects");
  revalidatePath("/tasks");
  return { id: milestone.id };
}

// ──────────────────────────────────────────────────────────────────────
// updateMilestone — edit a milestone's title / date / status / owner /
// category. dueDate: null clears the date (drops it off the timeline).
// ──────────────────────────────────────────────────────────────────────

export async function updateMilestone(
  milestoneId: string,
  input: {
    title?: string;
    dueDate?: string | null;
    status?: string;
    ownerId?: string | null;
    category?: string;
    categoryLabel?: string | null;
  },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const before = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    select: { id: true, projectId: true, title: true, status: true, dueDate: true, ownerId: true, category: true },
  });
  if (!before) throw new Error("Milestone not found");

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw new Error("Milestone title is required");
    data.title = t;
  }
  if (input.status !== undefined) {
    if (!VALID_MILESTONE_STATUSES.includes(input.status as MilestoneStatus)) {
      throw new Error(`Invalid milestone status: ${input.status}`);
    }
    data.status = input.status as MilestoneStatus;
  }
  if (input.dueDate !== undefined) {
    if (input.dueDate === null || input.dueDate === "") {
      data.dueDate = null;
    } else {
      const d = new Date(input.dueDate);
      if (Number.isNaN(d.getTime())) throw new Error(`Invalid due date: ${input.dueDate}`);
      data.dueDate = d;
    }
  }
  if (input.ownerId !== undefined) data.ownerId = input.ownerId || null;
  if (input.category !== undefined) {
    if (!VALID_CATEGORIES.includes(input.category as WorkCategory)) {
      throw new Error(`Invalid category: ${input.category}`);
    }
    data.category = input.category as WorkCategory;
  }
  if (input.categoryLabel !== undefined) data.categoryLabel = input.categoryLabel?.trim() || null;

  await prisma.$transaction(async (tx) => {
    await tx.milestone.update({ where: { id: milestoneId }, data });
    await writeAudit(tx, {
      actor,
      action: "update.milestone",
      targetType: "Milestone",
      targetId: milestoneId,
      changes: { fields: Object.keys(data) },
    });
  });

  if (before.projectId) revalidatePath(`/projects/${before.projectId}`);
  revalidatePath("/tasks");
  return { id: milestoneId };
}

// ──────────────────────────────────────────────────────────────────────
// updateMilestoneBoardStatus — move a milestone CARD across the Task Board's
// columns (To Do / In Progress / In Review / Done). Syncs the milestone's
// health status so the project timeline stays coherent.
// ──────────────────────────────────────────────────────────────────────

export async function updateMilestoneBoardStatus(milestoneId: string, boardStatus: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  if (!VALID_TASK_STATUSES.includes(boardStatus as TaskStatus)) {
    throw new Error(`Invalid board status: ${boardStatus}`);
  }

  const before = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    select: { id: true, projectId: true, boardStatus: true, archivedAt: true },
  });
  if (!before) throw new Error("Milestone not found");

  await prisma.$transaction(async (tx) => {
    await tx.milestone.update({
      where: { id: milestoneId },
      data: {
        boardStatus: boardStatus as TaskStatus,
        status: BOARD_TO_MILESTONE_STATUS[boardStatus as TaskStatus],
        // Moving a milestone into a real column un-archives it.
        archivedAt: null,
      },
    });
    await writeAudit(tx, {
      actor,
      action: "update.milestone.boardStatus",
      targetType: "Milestone",
      targetId: milestoneId,
      changes: {
        boardStatus: { before: before.boardStatus, after: boardStatus },
        ...(before.archivedAt ? { unarchived: true } : {}),
      },
    });
  });

  revalidatePath("/tasks");
  if (before.projectId) revalidatePath(`/projects/${before.projectId}`);
  return { ok: true as const };
}

// ──────────────────────────────────────────────────────────────────────
// setMilestoneArchived — move a milestone into (or out of) the board's
// Archive column. archivedAt is the timestamp the 7-day auto-hide reads:
// the Task Board omits milestones archived more than 7 days ago. Archiving
// leaves the milestone's health `status` untouched (it's off the funnel).
// ──────────────────────────────────────────────────────────────────────

export async function setMilestoneArchived(milestoneId: string, archived: boolean) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const before = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    select: { id: true, projectId: true, archivedAt: true },
  });
  if (!before) throw new Error("Milestone not found");

  // No-op if already in the requested state (keeps the original archive time).
  if (archived === Boolean(before.archivedAt)) return { ok: true as const };

  await prisma.$transaction(async (tx) => {
    await tx.milestone.update({
      where: { id: milestoneId },
      data: { archivedAt: archived ? new Date() : null },
    });
    await writeAudit(tx, {
      actor,
      action: archived ? "archive.milestone" : "unarchive.milestone",
      targetType: "Milestone",
      targetId: milestoneId,
      changes: { archived },
    });
  });

  revalidatePath("/tasks");
  if (before.projectId) revalidatePath(`/projects/${before.projectId}`);
  return { ok: true as const };
}

// ──────────────────────────────────────────────────────────────────────
// createMilestoneTask — a Task hung off a milestone (epic → sub-task).
// Mirrors createDeliverableTask (assign-to-partner + system notification).
// ──────────────────────────────────────────────────────────────────────

export async function createMilestoneTask(input: {
  milestoneId: string;
  title: string;
  ownerId?: string; // optional — a sub-task can sit unassigned
  priority: string;
  due: string; // ISO date "YYYY-MM-DD"
  context?: string;
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

  const milestone = await prisma.milestone.findUnique({
    where: { id: input.milestoneId },
    select: { id: true, title: true, projectId: true, clientId: true, category: true },
  });
  if (!milestone) throw new Error("Milestone not found");

  const owner = input.ownerId
    ? await prisma.partner.findUnique({ where: { id: input.ownerId }, select: { id: true, name: true } })
    : null;
  if (input.ownerId && !owner) throw new Error("Assignee not found");

  const assignedById = owner && owner.id !== creatorId ? creatorId : null;
  const context = input.context?.trim() || null;

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        title,
        priority: input.priority as TaskPriority,
        due,
        context,
        ownerId: owner?.id ?? null,
        assignedById,
        milestoneId: milestone.id,
        projectId: milestone.projectId,
        clientId: milestone.clientId,
        category: milestone.category,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.task.milestone",
      targetType: "Task",
      targetId: created.id,
      changes: { title, milestoneId: milestone.id, ownerId: owner?.id ?? null, assignedById, priority: input.priority },
    });

    await writeActivity(tx, {
      actor,
      type: "status",
      target: milestone.title,
      detail: assignedById && owner ? `Assigned task to ${owner.name}` : "Added task",
      link: milestone.projectId ? `/projects/${milestone.projectId}` : "/tasks",
    });

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

  if (milestone.projectId) revalidatePath(`/projects/${milestone.projectId}`);
  revalidatePath("/tasks");
  revalidatePath("/messages");
  return { id: task.id };
}

// ──────────────────────────────────────────────────────────────────────
// createDeliverable — manual partner entry of a deliverable (Artifact)
// scoped to the project. createdBy = the partner's display name (not an
// agent). reviewStatus starts at "draft".
// ──────────────────────────────────────────────────────────────────────

export async function createDeliverable(
  projectId: string,
  input: {
    type: string; // ArtifactType identifier
    title: string;
    driveUrl?: string;
    fileName?: string;
  },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actingPartnerId = session.user.partnerId;
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(actingPartnerId, partnerLabel);

  const title = input.title.trim();
  if (!title) throw new Error("Deliverable title is required");
  if (!VALID_ARTIFACT_TYPES.includes(input.type as ArtifactType)) {
    throw new Error(`Invalid deliverable type: ${input.type}`);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, partnerLeadId: true },
  });
  if (!project) throw new Error("Project not found");

  const driveUrl = input.driveUrl?.trim() || "";
  const fileName = input.fileName?.trim() || null;

  const artifact = await prisma.$transaction(async (tx) => {
    const created = await tx.artifact.create({
      data: {
        type: input.type as ArtifactType,
        title,
        driveUrl,
        fileName,
        createdBy: partnerLabel,
        // Manual partner entry — not generated from a skill.
        generatedFromSkill: null,
        reviewStatus: "draft",
        projectId,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.artifact.deliverable",
      targetType: "Artifact",
      targetId: created.id,
      changes: {
        projectId,
        type: input.type,
        title,
        hasDriveUrl: Boolean(driveUrl),
        fileName,
      },
    });

    await writeActivity(tx, {
      actor,
      type: "doc",
      target: project.name,
      detail: `Added deliverable — ${title}`,
      link: `/projects/${projectId}`,
    });

    // Tell the project lead a new deliverable landed (unless they added it).
    if (project.partnerLeadId !== actingPartnerId) {
      await notifyPartner(
        tx,
        project.partnerLeadId,
        "deliverable_added",
        `New deliverable on ${project.name}: ${title}`,
        { link: `/projects/${projectId}` },
      );
    }

    return created;
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/messages");
  return { id: artifact.id };
}

// ──────────────────────────────────────────────────────────────────────
// createDeliverableTask — create a Task hung off a deliverable (Artifact)
// and the project. Mirrors createTask's assign-to-partner behavior: if the
// task is handed to a different partner, find/create the DM channel and post
// the system task-card message.
// ──────────────────────────────────────────────────────────────────────

export async function createDeliverableTask(input: {
  artifactId: string;
  projectId: string;
  title: string;
  ownerId: string; // the assignee
  priority: string;
  due: string; // ISO date "YYYY-MM-DD"
  context?: string;
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

  const artifact = await prisma.artifact.findUnique({
    where: { id: input.artifactId },
    select: { id: true, title: true, projectId: true },
  });
  if (!artifact) throw new Error("Deliverable not found");

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
        artifactId: input.artifactId,
        projectId: input.projectId,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.task.deliverable",
      targetType: "Task",
      targetId: created.id,
      changes: {
        title,
        artifactId: input.artifactId,
        projectId: input.projectId,
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
      target: artifact.title,
      detail: assignedById ? `Assigned deliverable task to ${owner.name}` : "Added deliverable task",
      link: `/projects/${input.projectId}`,
    });

    // Hand-off: notify the assignee in their "Claude" system chat (same
    // pattern as createTask). Inline task card (taskId) → clicks through to /tasks.
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

  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/tasks");
  revalidatePath("/messages");
  return { id: task.id };
}
