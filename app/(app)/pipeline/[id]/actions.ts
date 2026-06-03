"use server";

// Pipeline / deal-scoped mutations.
//
// Canonical mutation recipe (see shiftai-ops/CLAUDE.md "Wire a Quick
// Action end-to-end").

import { Readable } from "node:stream";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { drive, seedClientSubfolders } from "@/lib/drive";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { assertNoNeedsInput } from "@/lib/no-hallucination";
import { generate } from "@/lib/ai";
import { applyStandardScheduleTx } from "@/lib/billing/apply";
import { buildDealContext } from "@/lib/deal-context";
import type { DealStage, Industry, ArtifactType } from "@/lib/generated/prisma/enums";

/**
 * Convert a deal in stage `proposal` or `negotiation` into a signed Client.
 *
 * In one transaction:
 *   - Creates a Drive folder for the client inside the Shared Drive
 *   - Creates Client row (using the deal's company / industry / partner / contact)
 *   - Creates a starter Project row (Phase 1 — Discovery, scope = caller's input)
 *   - Flips Deal.stage → signed
 *   - Writes the audit row
 *
 * The Drive folder create happens INSIDE the transaction's await chain so a
 * later DB error rolls back the DB writes — but the Drive folder itself is
 * not rolled back (Drive has no transaction). On DB failure the orphan
 * folder is harmless and can be deleted in Drive; we log its ID in the
 * audit row so it's findable.
 *
 * Phase 4 will replace this with the /onboard-client skill (full scaffold
 * — workspace + engagement charter + per-client CLAUDE.md). For Phase 3
 * this is the minimum that flips the deal and creates the records.
 */
const VALID_PROJECT_TYPES_CONVERT = ["discovery_report", "pilot_project", "monthly_project", "full_build"];

export async function convertDeal(
  dealId: string,
  input: { scope: string; projectType?: string },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  // Validate
  const scope = input.scope.trim();
  if (!scope) throw new Error("Engagement scope is required");
  assertNoNeedsInput(scope, "engagement scope");

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { contact: true },
  });
  if (!deal) throw new Error("Deal not found");
  if (deal.stage === "signed") {
    throw new Error("Deal is already signed");
  }

  // Accepted estimate (if any) → seeds the new project's economics + fee.
  const acceptedEstimate = await prisma.estimate.findFirst({
    where: { dealId, status: "accepted" },
    orderBy: { version: "desc" },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });

  // Create the Drive folder BEFORE the DB transaction so we have its ID
  // to store on the Client row. If this fails, no DB writes happen.
  const sharedDriveFolderId = process.env.DRIVE_SHARED_DRIVE_FOLDER_ID;
  if (!sharedDriveFolderId) {
    throw new Error("DRIVE_SHARED_DRIVE_FOLDER_ID is not configured");
  }
  const folderRes = await drive.files.create({
    requestBody: {
      name: deal.company,
      mimeType: "application/vnd.google-apps.folder",
      parents: [sharedDriveFolderId],
    },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  const folderId = folderRes.data.id;
  const folderUrl = folderRes.data.webViewLink;
  if (!folderId || !folderUrl) {
    throw new Error("Drive folder creation returned no ID");
  }

  // Seed the standard subfolder structure (best-effort — never blocks the
  // Client/Project create if a subfolder hiccups).
  await seedClientSubfolders(folderId);

  // Sensible defaults for fields not collected by the modal — partners
  // can edit on the Client / Project pages after convert.
  const workspacePath = `C:\\Users\\jason\\Desktop\\Shift\\03-Clients\\${deal.company.replace(/\s+/g, "")}`;
  const startDate = new Date();
  const targetEndDate = new Date(startDate);
  targetEndDate.setDate(targetEndDate.getDate() + 28); // ~4 weeks for Discovery

  // Engagement type — defaults to a discovery report (matches the seeded
  // "Phase 1 — Discovery" project); the partner can change it on the project.
  const projectType = (input.projectType && VALID_PROJECT_TYPES_CONVERT.includes(input.projectType))
    ? input.projectType
    : "discovery_report";

  const result = await prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        company: deal.company,
        industry: deal.industry,
        revenue: "—", // partner fills in on the Client page
        driveFolderUrl: folderUrl,
        workspacePath,
        contractValue: deal.valueEstimate,
        contractSignedAt: new Date(),
        status: "on_track",
        // Seed the engagement with the deal's context — by now the note has
        // been structured by the structure-deal-notes pass on create.
        notes: deal.notes?.trim() || null,
        partnerLeadId: deal.partnerLeadId,
        primaryContactId: deal.contactId,
      },
    });

    const project = await tx.project.create({
      data: {
        name: `${deal.company} · Phase 1 — Discovery`,
        phase: "discovery",
        projectType: projectType as never,
        status: "on_track",
        startDate,
        targetEndDate,
        // Seed the fee from the accepted estimate if present, else the deal's
        // estimated value, so the project doesn't start at $0; editable later.
        budgetFee: acceptedEstimate && acceptedEstimate.totalValue > 0 ? acceptedEstimate.totalValue : deal.valueEstimate || 0,
        description: scope,
        clientId: client.id,
        partnerLeadId: deal.partnerLeadId,
      },
    });

    // Convert the accepted estimate's lines into the project's economics lines,
    // carrying the tier + rate snapshots over (Phase 5).
    if (acceptedEstimate && acceptedEstimate.lines.length > 0) {
      for (let i = 0; i < acceptedEstimate.lines.length; i++) {
        const l = acceptedEstimate.lines[i];
        await tx.projectEconomicsLine.create({
          data: {
            projectId: project.id,
            role: l.role,
            hours: l.hours,
            payRateCents: l.payRateCents,
            billRateCents: l.billRateCents,
            isExtra: l.isExtra,
            sortOrder: i,
            rateTierId: l.rateTierId,
            fromFirmDefault: false,
          },
        });
      }
    }

    await tx.deal.update({
      where: { id: dealId },
      data: { stage: "signed", lastTouchAt: new Date(), stageEnteredAt: new Date() },
    });

    // Auto-generate the firm's standard 50/25/25 client schedule from the
    // seeded project value, so the new project opens with a billing plan.
    let scheduleCreated = 0;
    if (project.budgetFee > 0) {
      const sched = await applyStandardScheduleTx(tx, {
        projectId: project.id,
        value: project.budgetFee,
        startDate,
        targetEndDate,
      });
      scheduleCreated = sched.created;
    }

    await writeAudit(tx, {
      actor,
      action: "convert.deal.signed",
      targetType: "Deal",
      targetId: dealId,
      changes: {
        stage: { before: deal.stage, after: "signed" },
        createdClientId: client.id,
        createdProjectId: project.id,
        installmentsCreated: scheduleCreated,
        driveFolderId: folderId,
      },
    });

    await writeActivity(tx, {
      actor,
      type: "status",
      target: deal.company,
      detail: "Signed — engagement opened",
      link: `/clients/${client.id}`,
    });

    return { clientId: client.id, projectId: project.id };
  });

  revalidatePath(`/pipeline/${dealId}`);
  revalidatePath("/pipeline");
  revalidatePath("/clients");
  revalidatePath("/projects");
  revalidatePath("/dashboard");

  return result;
}

// ──────────────────────────────────────────────────────────────────────
// Draft proposal Quick Action — generation + persistence for the `scope` skill.
//
// generateProposal: read/generate only — pulls deal + contact + recent
// interactions, runs the scope skill, returns the draft (editable in the modal).
// saveProposal: persists per the recipe — Drive upload + Artifact + AuditLog +
// Activity, one transaction. A deal has no Drive folder yet, so the file lands
// in the Shared Drive root; the Artifact is scoped to the deal.
// ──────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────
// updateDeal — edit a deal's core fields (company, value, stage, industry,
// close-target date, notes) from the deal detail page. One write; the page
// re-renders from it (no denormalized copies).
//
// Stage rules mirror the board (pipeline/actions.ts updateDealStage):
//   - "signed" is NOT settable here — signing runs Convert (scaffolds the
//     Client + Project + Drive folder); a bare flip would orphan all that.
//   - An already-signed deal is frozen — it's been converted; edit the Client.
//   - A real stage change resets lastTouchAt + stageEnteredAt (the board's
//     aging color goes back to fresh).
// ──────────────────────────────────────────────────────────────────────

const VALID_STAGES_EDIT: DealStage[] = ["lead", "qualified", "discovery", "discussion", "proposal", "negotiation"];
const VALID_INDUSTRIES_EDIT: Industry[] = ["automotive", "motorsport", "engineering", "construction", "other"];

export async function updateDeal(
  dealId: string,
  input: {
    company?: string;
    valueEstimate?: number;
    stage?: string;
    industry?: string;
    closeTargetDate?: string; // YYYY-MM-DD
    notes?: string | null;
  },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      company: true,
      valueEstimate: true,
      stage: true,
      industry: true,
      closeTargetDate: true,
      notes: true,
    },
  });
  if (!deal) throw new Error("Deal not found");
  if (deal.stage === "signed") {
    throw new Error("This deal is signed — edit the client it became, not the deal.");
  }

  const data: {
    company?: string;
    valueEstimate?: number;
    stage?: DealStage;
    industry?: Industry;
    closeTargetDate?: Date;
    notes?: string | null;
    lastTouchAt?: Date;
    stageEnteredAt?: Date;
  } = {};
  const changes: Record<string, { before: unknown; after: unknown }> = {};

  if (input.company !== undefined) {
    const company = input.company.trim();
    if (!company) throw new Error("Company is required");
    if (company.length > 200) throw new Error("Company name is too long (max 200 chars)");
    if (company !== deal.company) {
      data.company = company;
      changes.company = { before: deal.company, after: company };
    }
  }

  if (input.valueEstimate !== undefined) {
    const value = Math.round(Number(input.valueEstimate));
    if (!Number.isFinite(value) || value < 0) throw new Error("Enter a valid estimated value");
    if (value !== deal.valueEstimate) {
      data.valueEstimate = value;
      changes.valueEstimate = { before: deal.valueEstimate, after: value };
    }
  }

  let stageChanged = false;
  if (input.stage !== undefined && input.stage !== deal.stage) {
    if (input.stage === "signed") {
      throw new Error("Use Convert → Client to sign a deal — it scaffolds the engagement.");
    }
    if (!VALID_STAGES_EDIT.includes(input.stage as DealStage)) {
      throw new Error(`Invalid stage: ${input.stage}`);
    }
    data.stage = input.stage as DealStage;
    changes.stage = { before: deal.stage, after: input.stage };
    stageChanged = true;
  }

  if (input.industry !== undefined && input.industry !== deal.industry) {
    if (!VALID_INDUSTRIES_EDIT.includes(input.industry as Industry)) {
      throw new Error(`Invalid industry: ${input.industry}`);
    }
    data.industry = input.industry as Industry;
    changes.industry = { before: deal.industry, after: input.industry };
  }

  if (input.closeTargetDate !== undefined) {
    const d = new Date(input.closeTargetDate);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid close-target date: ${input.closeTargetDate}`);
    if (d.getTime() !== deal.closeTargetDate.getTime()) {
      data.closeTargetDate = d;
      changes.closeTargetDate = { before: deal.closeTargetDate.toISOString(), after: d.toISOString() };
    }
  }

  if (input.notes !== undefined) {
    const notes = input.notes?.trim() || null;
    if (notes !== (deal.notes ?? null)) {
      data.notes = notes;
      changes.notes = { before: deal.notes ?? null, after: notes };
    }
  }

  if (Object.keys(changes).length === 0) return { ok: true as const };

  // A stage move is a touch — reset both clocks so the board ages from now.
  if (stageChanged) {
    const now = new Date();
    data.lastTouchAt = now;
    data.stageEnteredAt = now;
  }

  await prisma.$transaction(async (tx) => {
    await tx.deal.update({ where: { id: dealId }, data });
    await writeAudit(tx, {
      actor,
      action: "update.deal",
      targetType: "Deal",
      targetId: dealId,
      changes,
    });
    if (stageChanged) {
      await writeActivity(tx, {
        actor,
        type: "status",
        target: data.company ?? deal.company,
        detail: `Moved to ${STAGE_LABELS_EDIT[data.stage as DealStage]}`,
        link: `/pipeline/${dealId}`,
      });
    }
  });

  revalidatePath(`/pipeline/${dealId}`);
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

// ──────────────────────────────────────────────────────────────────────
// markDealReplied (D36) — a cold-emailed lead-stage deal got a reply.
//
// Guards: the deal is at stage "lead", coldOutreachAt is set, and
// outreachRepliedAt is still null. Promotes lead → qualified, stamps
// outreachRepliedAt, resets the stage clock, and logs an email_received
// Interaction on the deal's Contact. Audit (update.deal.stage) + activity.
// ──────────────────────────────────────────────────────────────────────
export async function markDealReplied(dealId: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { stage: true, company: true, contactId: true, coldOutreachAt: true, outreachRepliedAt: true },
  });
  if (!deal) throw new Error("Deal not found");
  if (deal.stage !== "lead" || !deal.coldOutreachAt || deal.outreachRepliedAt) {
    throw new Error("This deal isn’t awaiting a cold-outreach reply");
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.deal.update({
      where: { id: dealId },
      data: { stage: "qualified", stageEnteredAt: now, lastTouchAt: now, outreachRepliedAt: now },
    });
    await tx.interaction.create({
      data: {
        contactId: deal.contactId,
        type: "email_received",
        date: now,
        summary: "Prospect replied to cold outreach",
        loggedBy: partnerLabel,
        channel: "email",
      },
    });
    await writeAudit(tx, {
      actor,
      action: "update.deal.stage",
      targetType: "Deal",
      targetId: dealId,
      changes: { stage: { before: "lead", after: "qualified" }, repliedAt: now.toISOString() },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: deal.company,
      detail: "Prospect replied — moved to Qualified",
      link: `/pipeline/${dealId}`,
    });
  });

  revalidatePath(`/pipeline/${dealId}`);
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true };
}

const STAGE_LABELS_EDIT: Record<DealStage, string> = {
  lead: "Lead",
  qualified: "Qualified",
  discovery: "Discovery Call",
  discussion: "Discussion Call",
  proposal: "Proposal",
  negotiation: "Negotiation",
  signed: "Signed",
};

export async function generateProposal(
  dealId: string,
  input: { focus: string; fee?: string; timeline?: string; notes?: string },
): Promise<{ body: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const focus = input.focus.trim();
  if (!focus) throw new Error("Focus is required");

  const { deal, context } = await buildDealContext(dealId);

  const intake = [
    "## This proposal",
    `Focus / what to scope: ${focus}`,
    `Fee to state: ${input.fee?.trim() || "(none provided — do not invent one; use [NEEDS INPUT] where a fee belongs)"}`,
    `Timeline to state: ${input.timeline?.trim() || "(none provided — do not invent dates; use [NEEDS INPUT])"}`,
    `Extra notes from the partner: ${input.notes?.trim() || "(none)"}`,
    `Prepared by: ${deal.partnerLead?.name ?? "[NEEDS INPUT: preparer name]"}`,
  ].join("\n");

  const body = await generate({ skill: "scope", context, intake, maxTokens: 6000 });
  return { body: body.trim() };
}

// ──────────────────────────────────────────────────────────────────────
// Deal-scoped generative docs — discovery prep (internal), post-call survey,
// book-a-meeting note. Mirror the client-doc pattern (generateClientDoc /
// saveClientDoc) but read deal context. Each follows the canonical recipe:
// generate* (read + generate, returns the editable draft) → save* (Drive
// upload → Artifact + AuditLog + Activity, one transaction). The skill name IS
// the registry key (matches the skills/<name>/SKILL.md folder).
// ──────────────────────────────────────────────────────────────────────

const DEAL_DOCS = {
  "discovery-prep": { title: "Discovery prep", fileSuffix: "discovery-prep", artifactType: "report", maxTokens: 3000 },
  "client-survey": { title: "Post-call survey", fileSuffix: "survey", artifactType: "report", maxTokens: 2500 },
  "book-meeting": { title: "Meeting note", fileSuffix: "meeting-note", artifactType: "other", maxTokens: 1200 },
} as const;
type DealDocSkill = keyof typeof DEAL_DOCS;

function isDealDocSkill(s: string): s is DealDocSkill {
  return s in DEAL_DOCS;
}

export async function generateDealDoc(
  dealId: string,
  input: { skill: string; focus: string; notes?: string },
): Promise<{ body: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  if (!isDealDocSkill(input.skill)) throw new Error(`Unknown deal doc skill: ${input.skill}`);

  const focus = input.focus.trim();
  if (!focus) throw new Error("Focus is required");

  const { context } = await buildDealContext(dealId);
  const cfg = DEAL_DOCS[input.skill];

  const intake = [
    `## This ${cfg.title.toLowerCase()}`,
    `Focus / what to anchor on: ${focus}`,
    `Anything else to weave in: ${input.notes?.trim() || "(none)"}`,
  ].join("\n");

  const body = await generate({ skill: input.skill, context, intake, maxTokens: cfg.maxTokens });
  return { body: body.trim() };
}

export async function saveDealDoc(dealId: string, input: { skill: string; body: string }) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  if (!isDealDocSkill(input.skill)) throw new Error(`Unknown deal doc skill: ${input.skill}`);
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);
  const cfg = DEAL_DOCS[input.skill];

  const body = input.body.trimEnd();
  if (!body.trim()) throw new Error(`${cfg.title} body is required`);
  assertNoNeedsInput(body, cfg.title.toLowerCase());

  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, company: true } });
  if (!deal) throw new Error("Deal not found");

  // Deals have no Drive folder of their own — file into the Shared Drive root.
  const sharedDriveFolderId = process.env.DRIVE_SHARED_DRIVE_FOLDER_ID;
  if (!sharedDriveFolderId) throw new Error("DRIVE_SHARED_DRIVE_FOLDER_ID is not configured");

  const today = new Date().toISOString().slice(0, 10);
  const fileName = `${today}-${deal.company.replace(/\s+/g, "-")}-${cfg.fileSuffix}.md`;
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [sharedDriveFolderId], mimeType: "text/markdown" },
    media: { mimeType: "text/markdown", body: Readable.from(body) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  const fileId = res.data.id;
  const webViewLink = res.data.webViewLink;
  if (!fileId || !webViewLink) throw new Error("Drive upload returned no ID");

  const artifact = await prisma.$transaction(async (tx) => {
    const created = await tx.artifact.create({
      data: {
        type: cfg.artifactType as ArtifactType,
        title: `${cfg.title} · ${deal.company} · ${today}`,
        driveUrl: webViewLink,
        fileName,
        createdBy: partnerLabel,
        generatedFromSkill: input.skill,
        reviewStatus: "draft",
        dealId: deal.id,
      },
    });
    await writeAudit(tx, {
      actor,
      action: "create.artifact.dealDoc.draft",
      targetType: "Artifact",
      targetId: created.id,
      changes: { dealId, skill: input.skill, driveFileId: fileId, bodyLength: body.length },
    });
    await writeActivity(tx, {
      actor,
      type: "doc",
      target: deal.company,
      detail: `Drafted ${cfg.title.toLowerCase()} — awaiting review`,
      link: `/pipeline/${dealId}`,
    });
    return created;
  });

  revalidatePath(`/pipeline/${dealId}`);
  return { artifactId: artifact.id, driveUrl: webViewLink };
}

export async function saveProposal(dealId: string, input: { body: string }) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const body = input.body.trimEnd();
  if (!body.trim()) throw new Error("Proposal body is required");
  assertNoNeedsInput(body, "proposal");

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, company: true },
  });
  if (!deal) throw new Error("Deal not found");

  const sharedDriveFolderId = process.env.DRIVE_SHARED_DRIVE_FOLDER_ID;
  if (!sharedDriveFolderId) throw new Error("DRIVE_SHARED_DRIVE_FOLDER_ID is not configured");

  const today = new Date().toISOString().slice(0, 10);
  const fileName = `${today}-${deal.company.replace(/\s+/g, "-")}-proposal.md`;
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [sharedDriveFolderId], mimeType: "text/markdown" },
    media: { mimeType: "text/markdown", body: Readable.from(body) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  const fileId = res.data.id;
  const webViewLink = res.data.webViewLink;
  if (!fileId || !webViewLink) throw new Error("Drive upload returned no ID");

  const artifact = await prisma.$transaction(async (tx) => {
    const created = await tx.artifact.create({
      data: {
        type: "proposal",
        title: `Proposal · ${deal.company} · ${today}`,
        driveUrl: webViewLink,
        fileName,
        createdBy: partnerLabel,
        generatedFromSkill: "scope",
        reviewStatus: "draft",
        dealId: deal.id,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.artifact.proposal.draft",
      targetType: "Artifact",
      targetId: created.id,
      changes: { dealId, driveFileId: fileId, bodyLength: body.length },
    });

    await writeActivity(tx, {
      actor,
      type: "doc",
      target: deal.company,
      detail: "Drafted proposal — awaiting review",
      link: `/pipeline/${dealId}`,
    });

    return created;
  });

  revalidatePath(`/pipeline/${dealId}`);
  return { artifactId: artifact.id, driveUrl: webViewLink };
}
