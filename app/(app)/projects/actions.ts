"use server";

// Project-scoped server actions.
//
// Canonical mutation recipe (see shiftai-ops/CLAUDE.md "Wire a Quick
// Action end-to-end").

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";

/**
 * Lightweight project list for the TimeLogModal dropdown — excludes
 * closed engagements, includes the parent client's company for the label.
 * Server action so the modal (which is global, not project-scoped) can
 * fetch fresh data without each Header caller threading projects through.
 */
export async function getActiveProjectsForHours() {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const projects = await prisma.project.findMany({
    where: { status: { not: "closed" } },
    select: {
      id: true,
      name: true,
      client: { select: { company: true } },
    },
    orderBy: [{ client: { company: "asc" } }, { name: "asc" }],
  });

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    company: p.client.company,
  }));
}

export async function logHours(input: {
  projectId: string;
  hours: number;
  description: string;
  date?: string; // ISO YYYY-MM-DD; defaults to today
}) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  // Validate
  const description = input.description.trim();
  if (!description) throw new Error("Description is required");
  if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > 24) {
    throw new Error("Hours must be between 0 and 24");
  }
  const hours = Math.round(input.hours * 4) / 4; // snap to 0.25h increments
  const date = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${input.date}`);

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, hoursLogged: true, status: true },
  });
  if (!project) throw new Error("Project not found");
  if (project.status === "closed") {
    throw new Error("Project is closed — can't log hours");
  }

  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.hoursEntry.create({
      data: {
        projectId: input.projectId,
        loggedBy: session.user.partnerId!,
        loggedByLabel: partnerLabel,
        hours,
        description,
        date,
      },
    });

    await tx.project.update({
      where: { id: input.projectId },
      data: { hoursLogged: project.hoursLogged + hours },
    });

    await writeAudit(tx, {
      actor,
      action: "create.hoursEntry",
      targetType: "HoursEntry",
      targetId: created.id,
      changes: {
        projectId: input.projectId,
        hours,
        date: date.toISOString(),
        projectHoursAfter: project.hoursLogged + hours,
      },
    });

    return created;
  });

  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");

  return { id: entry.id, hours };
}
