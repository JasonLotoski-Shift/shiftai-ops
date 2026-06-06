"use server";

// Project drop-content ingest server actions (features 7 & 8).
//
// Pipeline: a partner drops a document / email thread / pasted note ONTO a known
// project → EXTRACT via generate() + the ingest-project skill (scoped to that
// project + its client + primary contact) → hold as a PENDING IngestProposal
// (source 'drop', matchedProjectId set). A partner reviews each item in the
// existing Ingest queue and APPROVES → persist through the canonical recipe
// (Milestones + Tasks + append-only contact enrichment + project notes +
// Interactions + AuditLog + Activity), tagged "AGENT · CLAUDE".
//
// Non-negotiable (ROADMAP): propose-never-auto-write. extractProjectDrop writes
// NOTHING to Milestone/Task/Contact — only a pending proposal. The approval gate
// is the only path from AI-extracted text to firm records.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, agentActor } from "@/lib/audit";
import { notifyPartner } from "@/lib/messaging";
import { generate } from "@/lib/ai";
import { formatDate } from "@/lib/format";
import { findDuplicateOpenTask, findDuplicateOpenMilestone } from "@/lib/ingest/dedup";
import type { InteractionType, MilestoneStatus, TaskPriority } from "@/lib/generated/prisma/enums";

const SKILL = "ingest-project";

// ── Extracted-proposal shape (mirrors the ingest-project skill output) ──
export type ExtractedMilestone = { title: string; dueDate: string | null; status: string };
export type ExtractedTask = { title: string; priority: string; due: string | null; context: string };
export type ExtractedInteraction = { summary: string; type: string };
export type ProjectExtractedProposal = {
  summary: string;
  projectNotes: string | null;
  contactKeyFacts: string[];
  milestones: ExtractedMilestone[];
  tasks: ExtractedTask[];
  interactions: ExtractedInteraction[];
};

// Hyphenated DB values for the @map'd enums (skill emits hyphenated forms).
const MILESTONE_STATUSES = ["pending", "in-progress", "complete", "at-risk"] as const;
const TASK_PRIORITIES = ["high", "medium", "low"] as const;
const INTERACTION_TYPES = ["meeting", "call", "email-received", "email-sent", "other"] as const;

// Enum @map convention: the generated client expects the UNDERSCORED TS
// identifier, while the skill emits the hyphenated DB form. Normalize on parse.
function toMilestoneStatus(v: string): MilestoneStatus {
  const ok = (MILESTONE_STATUSES as readonly string[]).includes(v) ? v : "pending";
  return ok.replace("-", "_") as MilestoneStatus;
}
function toTaskPriority(v: string): TaskPriority {
  const ok = (TASK_PRIORITIES as readonly string[]).includes(v) ? v : "medium";
  return ok as TaskPriority;
}
function toInteractionType(v: string): InteractionType {
  const ok = (INTERACTION_TYPES as readonly string[]).includes(v) ? v : "other";
  return ok.replace("-", "_") as InteractionType;
}

const isoDate = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

function parseProjectProposalJSON(raw: string): ProjectExtractedProposal {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
  }
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Extraction returned malformed output — try again.");
  }

  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [];

  const objArr = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? (v as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];

  const milestones: ExtractedMilestone[] = objArr(o.milestones)
    .filter((m) => typeof m.title === "string" && (m.title as string).trim())
    .map((m) => ({
      title: (m.title as string).trim(),
      dueDate: isoDate(m.dueDate),
      status: typeof m.status === "string" ? (m.status as string).trim() : "pending",
    }));

  const tasks: ExtractedTask[] = objArr(o.tasks)
    .filter((t) => typeof t.title === "string" && (t.title as string).trim())
    .map((t) => ({
      title: (t.title as string).trim(),
      priority: typeof t.priority === "string" ? (t.priority as string).trim() : "medium",
      due: isoDate(t.due),
      context: typeof t.context === "string" ? (t.context as string).trim() : "",
    }));

  const interactions: ExtractedInteraction[] = objArr(o.interactions)
    .filter((it) => typeof it.summary === "string" && (it.summary as string).trim())
    .map((it) => ({
      summary: (it.summary as string).trim(),
      type: typeof it.type === "string" ? (it.type as string).trim() : "other",
    }));

  const notes = typeof o.projectNotes === "string" && o.projectNotes.trim() ? o.projectNotes.trim() : null;

  return {
    summary: typeof o.summary === "string" ? o.summary.trim() : "",
    projectNotes: notes,
    contactKeyFacts: strArr(o.contactKeyFacts),
    milestones,
    tasks,
    interactions,
  };
}

// ── Feature 7 — extract dropped content into a PENDING proposal ──
export async function extractProjectDrop(
  projectId: string,
  input: { content: string; title: string },
): Promise<{ id: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerId = session.user.partnerId;
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";

  const content = input.content.trim();
  if (content.length < 40) throw new Error("Dropped content is too short to extract anything useful");
  const title = input.title.trim() || "Untitled drop";

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: { include: { primaryContact: true } },
    },
  });
  if (!project) throw new Error("Project not found");

  const client = project.client;
  const contact = client.primaryContact;

  // Context block — what this dropped content is ABOUT.
  const ctxLines: string[] = [
    `## Project`,
    `Name: ${project.name}`,
    `Phase: ${project.phase} · Status: ${project.status.replace("_", "-")}`,
  ];
  if (project.description) ctxLines.push(`Scope: ${project.description}`);
  ctxLines.push("", `## Client`, `${client.company}`);
  if (client.description) ctxLines.push(client.description);
  if (contact) {
    ctxLines.push("", `## Primary contact`, `${contact.name} — ${contact.title} at ${contact.company}`);
    if (contact.keyFacts.length) ctxLines.push(`Known facts: ${contact.keyFacts.join("; ")}`);
  } else {
    ctxLines.push("", `## Primary contact`, `None on file.`);
  }

  const raw = await generate({
    skill: SKILL,
    context: ctxLines.join("\n"),
    intake: `## Dropped content — "${title}"\n${content}`,
    maxTokens: 3000,
  });
  const proposal = parseProjectProposalJSON(raw);

  const created = await prisma.ingestProposal.create({
    data: {
      source: "drop",
      title,
      meetingDate: new Date(), // no inherent meeting date for a drop — use now
      transcript: content,
      proposal: proposal as object,
      status: "pending",
      matchedProjectId: project.id,
      matchedClientId: client.id,
      matchedContactId: contact?.id ?? null,
      createdBy: partnerLabel,
    },
    select: { id: true },
  });

  // Tell the partner who dropped it that there's something to review. This runs
  // outside a $transaction in this action — pass the singleton as db, that's fine.
  await notifyPartner(
    prisma,
    partnerId,
    "approval_needed",
    `A dropped document on ${project.name} is ready for your review`,
    { link: "/ingest" },
  );

  revalidatePath("/ingest");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/messages");
  return { id: created.id };
}

// ── Feature 8 — the partner-approval gate. Persist the reviewed items. ──
export type ApproveProjectSelections = {
  summary: string;
  projectNotes: string | null;
  contactKeyFacts: string[];
  milestones: { title: string; dueDate: string | null; status: string }[];
  tasks: { title: string; priority: string; due: string | null; context: string }[];
  interactions: { summary: string; type: string }[];
};

export async function approveProjectProposal(proposalId: string, selections: ApproveProjectSelections) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerId = session.user.partnerId;
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = agentActor(SKILL);

  const proposal = await prisma.ingestProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") throw new Error("Proposal already reviewed");
  if (!proposal.matchedProjectId) throw new Error("Proposal is not scoped to a project");

  const projectId = proposal.matchedProjectId;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, clientId: true, description: true },
  });
  if (!project) throw new Error("Project not found");

  const clientId = proposal.matchedClientId ?? project.clientId;
  const contactId = proposal.matchedContactId;
  const summary = selections.summary.trim() || (proposal.proposal as ProjectExtractedProposal).summary || proposal.title;

  // Validate / coerce the kept items up front so the transaction is pure writes.
  const milestones = selections.milestones
    .filter((m) => m.title.trim())
    .map((m) => {
      const d = m.dueDate ? new Date(m.dueDate) : null;
      return {
        title: m.title.trim(),
        dueDate: d && !Number.isNaN(d.getTime()) ? d : new Date(),
        status: toMilestoneStatus(m.status),
      };
    });

  const tasks = selections.tasks
    .filter((t) => t.title.trim())
    .map((t) => {
      const d = t.due ? new Date(t.due) : null;
      return {
        title: t.title.trim(),
        priority: toTaskPriority(t.priority),
        due: d && !Number.isNaN(d.getTime()) ? d : new Date(),
        context: t.context?.trim() || `From drop: ${proposal.title}`,
      };
    });

  const interactions = selections.interactions
    .filter((it) => it.summary.trim())
    .map((it) => ({ summary: it.summary.trim(), type: toInteractionType(it.type) }));

  const keyFacts = selections.contactKeyFacts.map((f) => f.trim()).filter(Boolean);
  const projectNotes = selections.projectNotes?.trim() || null;

  // Skips surfaced in audit + activity so a dedup drop is never silent.
  const tasksSkipped: { title: string; existingId: string }[] = [];
  const milestonesSkipped: { title: string; existingId: string }[] = [];
  let milestonesCreated = 0;
  let tasksCreated = 0;

  await prisma.$transaction(async (tx) => {
    // 1. Milestones scoped to the project. Skip duplicates of a live milestone.
    for (const m of milestones) {
      const dupM = await findDuplicateOpenMilestone(tx, { title: m.title, projectId });
      if (dupM) {
        milestonesSkipped.push({ title: m.title, existingId: dupM.id });
        continue;
      }
      await tx.milestone.create({
        data: { title: m.title, dueDate: m.dueDate, status: m.status, projectId },
      });
      milestonesCreated++;
    }

    // 2. Tasks scoped to the project + client; owned by the approving partner.
    //    Skip any that duplicate an open task already on this project.
    for (const t of tasks) {
      const dupT = await findDuplicateOpenTask(tx, { title: t.title, clientId, projectId });
      if (dupT) {
        tasksSkipped.push({ title: t.title, existingId: dupT.id });
        continue;
      }
      await tx.task.create({
        data: {
          title: t.title,
          priority: t.priority,
          due: t.due,
          context: t.context,
          ownerId: partnerId,
          assignedById: partnerId,
          clientId: clientId ?? null,
          projectId,
        },
      });
      tasksCreated++;
    }

    // 3. Append projectNotes to the project description (append-only).
    if (projectNotes) {
      const existing = project.description?.trim() ?? "";
      const next = existing ? `${existing}\n\n${projectNotes}` : projectNotes;
      await tx.project.update({ where: { id: projectId }, data: { description: next } });
    }

    // 4. Append-only contact key facts.
    if (contactId && keyFacts.length) {
      const c = await tx.contact.findUnique({ where: { id: contactId }, select: { keyFacts: true } });
      if (c) {
        const merged = [...c.keyFacts];
        for (const f of keyFacts) {
          if (!merged.some((v) => v.toLowerCase() === f.toLowerCase())) merged.push(f);
        }
        if (merged.length !== c.keyFacts.length) {
          await tx.contact.update({ where: { id: contactId }, data: { keyFacts: merged, enrichedAt: new Date() } });
        }
      }
    }

    // 5. Interactions logged against the primary contact (advances lastTouchAt).
    if (contactId && interactions.length) {
      const contact = await tx.contact.findUnique({ where: { id: contactId }, select: { lastTouchAt: true } });
      if (contact) {
        const now = new Date();
        for (const it of interactions) {
          await tx.interaction.create({
            data: { contactId, type: it.type, date: now, summary: it.summary, loggedBy: "AGENT · CLAUDE" },
          });
        }
        if (now > contact.lastTouchAt) {
          await tx.contact.update({ where: { id: contactId }, data: { lastTouchAt: now } });
        }
      }
    }

    // 6. Mark the proposal approved.
    await tx.ingestProposal.update({
      where: { id: proposalId },
      data: { status: "approved", reviewedBy: partnerLabel, reviewedAt: new Date() },
    });

    // 7. Audit (ledger) + Activity (feed).
    await writeAudit(tx, {
      actor,
      action: "approve.ingestProposal.project",
      targetType: "IngestProposal",
      targetId: proposalId,
      changes: {
        approvedBy: partnerLabel,
        projectId,
        clientId,
        contactId,
        milestones: milestonesCreated,
        milestonesSkippedAsDuplicate: milestonesSkipped.length,
        milestonesSkipped,
        tasks: tasksCreated,
        tasksSkippedAsDuplicate: tasksSkipped.length,
        tasksSkipped,
        interactions: interactions.length,
        contactKeyFacts: keyFacts.length,
        projectNotesAppended: !!projectNotes,
      },
    });

    await writeActivity(tx, {
      actor,
      type: "ai",
      target: proposal.title,
      detail: `Project drop ingested — ${milestonesCreated} milestone(s), ${tasksCreated} task(s), ${interactions.length} interaction(s)${tasksSkipped.length || milestonesSkipped.length ? ` · ${tasksSkipped.length + milestonesSkipped.length} skipped as already-open duplicate(s)` : ""}`,
      link: `/projects/${projectId}`,
    });
  });

  revalidatePath("/ingest");
  revalidatePath(`/projects/${projectId}`);
  if (clientId) revalidatePath(`/clients/${clientId}`);
  if (contactId) revalidatePath(`/contacts/${contactId}`);
  return { ok: true };
}

// ── Reject a project drop proposal ──
export async function rejectProjectProposal(proposalId: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";

  const proposal = await prisma.ingestProposal.findUnique({
    where: { id: proposalId },
    select: { status: true, matchedProjectId: true },
  });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") throw new Error("Proposal already reviewed");

  await prisma.$transaction(async (tx) => {
    await tx.ingestProposal.update({
      where: { id: proposalId },
      data: { status: "rejected", reviewedBy: partnerLabel, reviewedAt: new Date() },
    });
    await writeAudit(tx, {
      actor: agentActor(SKILL),
      action: "reject.ingestProposal.project",
      targetType: "IngestProposal",
      targetId: proposalId,
      changes: { rejectedBy: partnerLabel },
    });
  });

  revalidatePath("/ingest");
  if (proposal.matchedProjectId) revalidatePath(`/projects/${proposal.matchedProjectId}`);
  return { ok: true };
}
