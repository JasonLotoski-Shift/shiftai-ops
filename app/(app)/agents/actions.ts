"use server";

// Agent-plan server actions (Firm Agents tab, B5).
//
// AgentPlan is a collaboration surface — partners draft what an agent SHOULD
// do before any SKILL.md or scheduled run exists. Plain CRUD. Each mutation
// follows the canonical recipe: write + writeAudit in one transaction, then
// revalidate. Creating/advancing a plan is feed-worthy, so it also writes
// an Activity row.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import type { AgentPlanStatus, AgentPlanKind } from "@/lib/generated/prisma/enums";

const VALID_STATUS: AgentPlanStatus[] = ["idea", "active", "paused", "done"];
const VALID_KIND: AgentPlanKind[] = ["agent", "mcp"];

function splitTasks(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.replace(/^[-*•\d.\s]+/, "").trim())
    .filter(Boolean);
}

export type AgentPlanInput = {
  name: string;
  goal: string;
  /** One task per line — split + trimmed server-side. */
  keyTasks: string;
  notes?: string;
  status?: string;
  /** "agent" (default) or "mcp" — which tab the plan lives under. */
  kind?: string;
};

export async function createAgentPlan(input: AgentPlanInput) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const name = input.name.trim();
  const goal = input.goal.trim();
  if (!name) throw new Error("Name is required");
  if (!goal) throw new Error("Goal is required");
  const status = (input.status && VALID_STATUS.includes(input.status as AgentPlanStatus)
    ? (input.status as AgentPlanStatus)
    : "idea");
  const kind = (input.kind && VALID_KIND.includes(input.kind as AgentPlanKind)
    ? (input.kind as AgentPlanKind)
    : "agent");
  const label = kind === "mcp" ? "an MCP plan" : "an agent plan";

  const plan = await prisma.$transaction(async (tx) => {
    const created = await tx.agentPlan.create({
      data: {
        name,
        goal,
        keyTasks: splitTasks(input.keyTasks),
        notes: input.notes?.trim() || null,
        status,
        kind,
        createdById: session.user.partnerId!,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.agentPlan",
      targetType: "AgentPlan",
      targetId: created.id,
      changes: { name, goal, status, kind },
    });

    await writeActivity(tx, {
      actor,
      type: "ai",
      target: name,
      detail: `Drafted ${label} — ${goal.length > 80 ? goal.slice(0, 77) + "…" : goal}`,
      link: `/agents`,
    });

    return created;
  });

  revalidatePath("/agents");
  return { id: plan.id };
}

export async function updateAgentPlan(id: string, input: AgentPlanInput) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const name = input.name.trim();
  const goal = input.goal.trim();
  if (!name) throw new Error("Name is required");
  if (!goal) throw new Error("Goal is required");
  const status = (input.status && VALID_STATUS.includes(input.status as AgentPlanStatus)
    ? (input.status as AgentPlanStatus)
    : undefined);

  const existing = await prisma.agentPlan.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new Error("Agent plan not found");

  await prisma.$transaction(async (tx) => {
    await tx.agentPlan.update({
      where: { id },
      data: {
        name,
        goal,
        keyTasks: splitTasks(input.keyTasks),
        notes: input.notes?.trim() || null,
        ...(status ? { status } : {}),
      },
    });

    await writeAudit(tx, {
      actor,
      action: "update.agentPlan",
      targetType: "AgentPlan",
      targetId: id,
      changes: { name, goal, status },
    });
  });

  revalidatePath("/agents");
  return { id };
}

export async function setAgentPlanStatus(id: string, status: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  if (!VALID_STATUS.includes(status as AgentPlanStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const plan = await prisma.agentPlan.findUnique({ where: { id }, select: { name: true } });
  if (!plan) throw new Error("Agent plan not found");

  await prisma.$transaction(async (tx) => {
    await tx.agentPlan.update({ where: { id }, data: { status: status as AgentPlanStatus } });
    await writeAudit(tx, {
      actor,
      action: "update.agentPlan.status",
      targetType: "AgentPlan",
      targetId: id,
      changes: { status },
    });
    await writeActivity(tx, {
      actor,
      type: "ai",
      target: plan.name,
      detail: `Agent plan moved to ${status}`,
      link: `/agents`,
    });
  });

  revalidatePath("/agents");
  return { id, status };
}

export async function deleteAgentPlan(id: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const plan = await prisma.agentPlan.findUnique({ where: { id }, select: { name: true } });
  if (!plan) throw new Error("Agent plan not found");

  await prisma.$transaction(async (tx) => {
    await tx.agentPlan.delete({ where: { id } });
    await writeAudit(tx, {
      actor,
      action: "delete.agentPlan",
      targetType: "AgentPlan",
      targetId: id,
      changes: { name: plan.name },
    });
  });

  revalidatePath("/agents");
  return { id };
}
