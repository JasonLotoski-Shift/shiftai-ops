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
import { findOrCreateDMChannel } from "@/lib/messaging";
import type {
  MilestoneStatus,
  ArtifactType,
  TaskPriority,
} from "@/lib/generated/prisma/enums";

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

// ──────────────────────────────────────────────────────────────────────
// createMilestone — manual partner entry of a project milestone.
// ──────────────────────────────────────────────────────────────────────

export async function createMilestone(
  projectId: string,
  input: {
    title: string;
    dueDate: string; // ISO date "YYYY-MM-DD"
    status: string; // underscored Prisma identifier (e.g. "in_progress")
  },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const title = input.title.trim();
  if (!title) throw new Error("Milestone title is required");
  if (!VALID_MILESTONE_STATUSES.includes(input.status as MilestoneStatus)) {
    throw new Error(`Invalid milestone status: ${input.status}`);
  }
  const dueDate = new Date(input.dueDate);
  if (Number.isNaN(dueDate.getTime())) throw new Error(`Invalid due date: ${input.dueDate}`);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) throw new Error("Project not found");

  const milestone = await prisma.$transaction(async (tx) => {
    const created = await tx.milestone.create({
      data: {
        projectId,
        title,
        dueDate,
        status: input.status as MilestoneStatus,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.milestone",
      targetType: "Milestone",
      targetId: created.id,
      changes: {
        projectId,
        title,
        dueDate: dueDate.toISOString(),
        status: input.status,
      },
    });

    await writeActivity(tx, {
      actor,
      type: "status",
      target: project.name,
      detail: `Added milestone — ${title}`,
      link: `/projects/${projectId}`,
    });

    return created;
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { id: milestone.id };
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
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const title = input.title.trim();
  if (!title) throw new Error("Deliverable title is required");
  if (!VALID_ARTIFACT_TYPES.includes(input.type as ArtifactType)) {
    throw new Error(`Invalid deliverable type: ${input.type}`);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
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

    return created;
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
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

    // Hand-off: post a system task-card message into the DM between the
    // assigner and the assignee (same pattern as createTask).
    if (assignedById) {
      const dmId = await findOrCreateDMChannel(tx, assignedById, owner.id);
      await tx.message.create({
        data: {
          channelId: dmId,
          authorId: null, // system message
          body: `Assigned you a task: ${title}`,
          taskId: created.id,
        },
      });
    }

    return created;
  });

  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/tasks");
  revalidatePath("/messages");
  return { id: task.id };
}
