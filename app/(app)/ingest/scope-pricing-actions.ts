"use server";

// Scope-pricing ingest — extract a project scoping document into firm-economics
// lines, propose them for review, and on approval write ProjectEconomicsLine
// rows (+ optionally the standard 50/25/25 schedule). Mirrors the unified
// ingest flow (extract → pending IngestProposal → approve in a $transaction),
// but scoped to one project and surfaced on the project page rather than the
// shared ingest queue.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generate } from "@/lib/ai";
import { writeAudit, writeActivity, partnerActor, agentActor } from "@/lib/audit";
import { notifyPartner } from "@/lib/messaging";
import { applyStandardScheduleTx } from "@/lib/billing/apply";
import { parseScopePricing } from "@/lib/ingest/scope-pricing-parse";
import {
  SCOPE_PRICING_INGEST_TYPE,
  type ScopePricingProposal,
  type ApproveScopePricingSelections,
} from "@/lib/ingest/scope-pricing-types";

async function getPartner() {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  return {
    id: session.user.partnerId,
    label: session.user.name ?? session.user.email ?? "Unknown",
  };
}

const rate = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

// Extract a pasted scope doc into a pending scope-pricing proposal.
export async function extractScopePricing(input: { projectId: string; content: string }) {
  const partner = await getPartner();

  const content = input.content?.trim();
  if (!content || content.length < 40) throw new Error("Paste the scope/pricing document text first");

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, name: true, budgetFee: true },
  });
  if (!project) throw new Error("Project not found");

  const roster = await prisma.consultant.findMany({
    where: { active: true },
    select: { name: true, role: true, defaultPayRateCents: true },
    orderBy: { name: "asc" },
  });

  const rosterBlock = roster.length
    ? roster.map((c) => `- ${c.name} (${c.role}) — pays ${rate(c.defaultPayRateCents)}/hr`).join("\n")
    : "(no consultants on the roster yet)";

  const context = [
    "## Project",
    `Name: ${project.name}`,
    `Current value: $${project.budgetFee.toLocaleString()}`,
    "",
    "## Active consultant roster (for consultantHint)",
    rosterBlock,
  ].join("\n");

  const raw = await generate({
    skill: "ingest-scope-pricing",
    context,
    intake: `## Scope document\n${content}`,
    maxTokens: 3500,
  });

  const parsed = parseScopePricing(raw);

  const created = await prisma.ingestProposal.create({
    data: {
      source: "paste",
      ingestType: SCOPE_PRICING_INGEST_TYPE,
      title: `Scope pricing · ${project.name}`,
      meetingDate: new Date(),
      transcript: content,
      proposal: parsed as object,
      // Reviewed on the project page (filtered out of /ingest), but lane is set
      // for consistency with every other create path.
      lane: "client_records",
      status: "pending",
      matchedProjectId: project.id,
      createdBy: partner.label,
    },
    select: { id: true },
  });

  // Audit the proposal creation (agent-extracted, partner-triggered).
  await writeAudit(prisma, {
    actor: agentActor("ingest-scope-pricing"),
    action: "extract.scopePricing",
    targetType: "IngestProposal",
    targetId: created.id,
    changes: { projectId: project.id, lines: parsed.lines.length, total: parsed.total },
  });

  await notifyPartner(prisma, partner.id, "approval_needed", `Scope pricing for ${project.name} is ready for review`, {
    link: `/projects/${project.id}`,
  });

  revalidatePath(`/projects/${project.id}`);
  return { id: created.id, lines: parsed.lines.length };
}

// Approve a scope-pricing proposal → write economics lines (+ optional schedule).
export async function approveScopePricing(proposalId: string, selections: ApproveScopePricingSelections) {
  const partner = await getPartner();
  const actor = partnerActor(partner.id, partner.label);

  const proposal = await prisma.ingestProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, status: true, ingestType: true, matchedProjectId: true, proposal: true },
  });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") throw new Error("This proposal has already been reviewed");
  if (proposal.ingestType !== SCOPE_PRICING_INGEST_TYPE || !proposal.matchedProjectId) {
    throw new Error("Not a scope-pricing proposal");
  }

  const projectId = proposal.matchedProjectId;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, budgetFee: true, startDate: true, targetEndDate: true },
  });
  if (!project) throw new Error("Project not found");

  const data = proposal.proposal as unknown as ScopePricingProposal;
  const lines = Array.isArray(selections.lines) ? selections.lines : [];

  // Resolve roster pay-rate defaults for any line missing a pay rate.
  const consultantIds = lines.map((l) => l.consultantId).filter((id): id is string => Boolean(id));
  const consultants = consultantIds.length
    ? await prisma.consultant.findMany({ where: { id: { in: consultantIds } }, select: { id: true, defaultPayRateCents: true } })
    : [];
  const payByConsultant = new Map(consultants.map((c) => [c.id, c.defaultPayRateCents]));

  let scheduleGenerated = 0;

  await prisma.$transaction(async (tx) => {
    // Append after any existing economics lines.
    const last = await tx.projectEconomicsLine.findFirst({
      where: { projectId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let sortOrder = (last?.sortOrder ?? -1) + 1;

    for (const l of lines) {
      const payRateCents = l.payRateCents ?? (l.consultantId ? payByConsultant.get(l.consultantId) ?? 0 : 0);
      await tx.projectEconomicsLine.create({
        data: {
          projectId,
          consultantId: l.consultantId ?? null,
          role: l.role,
          hours: Math.max(0, l.hours),
          payRateCents,
          billRateCents: Math.max(0, l.billRateCents),
          isExtra: l.isExtra,
          sortOrder: sortOrder++,
          fromFirmDefault: false, // reviewed/ingested, not a raw firm default
        },
      });
    }

    if (selections.generateSchedule && project.budgetFee > 0) {
      const sched = await applyStandardScheduleTx(tx, {
        projectId,
        value: project.budgetFee,
        startDate: project.startDate,
        targetEndDate: project.targetEndDate,
        force: true,
      });
      scheduleGenerated = sched.created;
    }

    await tx.ingestProposal.update({
      where: { id: proposalId },
      data: { status: "approved", reviewedBy: partner.label, reviewedAt: new Date() },
    });

    await writeAudit(tx, {
      actor: agentActor("ingest-scope-pricing"),
      action: "approve.scopePricing",
      targetType: "Project",
      targetId: projectId,
      changes: { proposalId, linesCreated: lines.length, scheduleGenerated, total: data?.total ?? null, approvedBy: partner.label },
    });

    await writeActivity(tx, {
      actor,
      type: "ai",
      target: project.name,
      detail: `Approved scope pricing — ${lines.length} economics line${lines.length === 1 ? "" : "s"}${scheduleGenerated ? ` · ${scheduleGenerated}-stage schedule` : ""}`,
      link: `/projects/${projectId}`,
    });
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/invoices");
  revalidatePath("/ingest");
  return { ok: true as const };
}

export async function rejectScopePricing(proposalId: string) {
  const partner = await getPartner();

  const proposal = await prisma.ingestProposal.findUnique({
    where: { id: proposalId },
    select: { id: true, status: true, matchedProjectId: true },
  });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") throw new Error("This proposal has already been reviewed");

  await prisma.$transaction(async (tx) => {
    await tx.ingestProposal.update({
      where: { id: proposalId },
      data: { status: "rejected", reviewedBy: partner.label, reviewedAt: new Date() },
    });
    await writeAudit(tx, {
      actor: partnerActor(partner.id, partner.label),
      action: "reject.scopePricing",
      targetType: "IngestProposal",
      targetId: proposalId,
      changes: { rejectedBy: partner.label },
    });
  });

  if (proposal.matchedProjectId) revalidatePath(`/projects/${proposal.matchedProjectId}`);
  return { ok: true as const };
}
