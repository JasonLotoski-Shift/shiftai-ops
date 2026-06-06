"use server";

// Create a new project for an existing client.
//
// Business model v2 makes this load-bearing: one engagement = one project, so a
// later subscription or buy-out is a NEW project on the same client (not a
// second schedule on the first one). The "+ New project" button on the client
// page opens the modal that calls this.
//
// Canonical mutation recipe: validate → actor → create + auto-generate the
// type-appropriate billing schedule + writeAudit + writeActivity, one
// transaction → revalidate.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { applyStandardScheduleTx } from "@/lib/billing/apply";
import type { ProjectType, ProjectPhase } from "@/lib/generated/prisma/enums";

const VALID_TYPES: ProjectType[] = [
  "discovery_report",
  "pilot_project",
  "subscription",
  "full_build",
  "buyout",
];

// Default the back-compat `phase` from the engagement type (the UI shows
// projectType, not phase). Subscription / buy-out are operating engagements.
const PHASE_BY_TYPE: Record<string, ProjectPhase> = {
  discovery_report: "discovery",
  pilot_project: "build",
  full_build: "build",
  subscription: "run",
  buyout: "run",
};

export async function createProject(
  clientId: string,
  input: {
    name: string;
    projectType: string;
    budgetFee: number; // value: total fee, or monthly price (subscription), or lump sum (buy-out)
    startDate: string; // YYYY-MM-DD
    targetEndDate: string; // YYYY-MM-DD
    description?: string;
  },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, company: true, partnerLeadId: true },
  });
  if (!client) throw new Error("Client not found");

  const name = input.name.trim();
  if (!name) throw new Error("Give the project a name");
  if (name.length > 200) throw new Error("Project name is too long (max 200 chars)");

  if (!VALID_TYPES.includes(input.projectType as ProjectType)) {
    throw new Error(`Invalid project type: ${input.projectType}`);
  }
  const projectType = input.projectType as ProjectType;

  const budgetFee = Math.round(Number(input.budgetFee));
  if (!Number.isFinite(budgetFee) || budgetFee < 0) throw new Error("Enter a valid value (≥ 0)");

  const startDate = new Date(input.startDate);
  const targetEndDate = new Date(input.targetEndDate);
  if (Number.isNaN(startDate.getTime())) throw new Error("Enter a valid start date");
  if (Number.isNaN(targetEndDate.getTime())) throw new Error("Enter a valid target end date");
  if (startDate > targetEndDate) throw new Error("Start date must be on or before the target end date");

  // Match the firm naming convention "<Company> · <Project>" (the UI splits on
  // "·" to show the part after). Don't double-prefix if the partner included it.
  const fullName = name.includes("·") ? name : `${client.company} · ${name}`;

  const result = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        name: fullName,
        phase: PHASE_BY_TYPE[projectType] ?? "build",
        projectType,
        status: "on_track",
        startDate,
        targetEndDate,
        budgetFee,
        description: input.description?.trim() || "—",
        clientId: client.id,
        partnerLeadId: client.partnerLeadId,
      },
    });

    // Open with the type-appropriate schedule: buy-out → one lump sum;
    // subscription → month 1; else 50/25/25.
    let scheduleCreated = 0;
    if (budgetFee > 0) {
      const sched = await applyStandardScheduleTx(tx, {
        projectId: project.id,
        value: budgetFee,
        startDate,
        targetEndDate,
        projectType,
      });
      scheduleCreated = sched.created;
    }

    await writeAudit(tx, {
      actor,
      action: "create.project",
      targetType: "Project",
      targetId: project.id,
      changes: { clientId, name: fullName, projectType, budgetFee, installmentsCreated: scheduleCreated },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: client.company,
      detail: `Opened project — ${name}`,
      link: `/projects/${project.id}`,
    });

    return { projectId: project.id };
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/projects");
  revalidatePath("/financials");
  return result;
}
