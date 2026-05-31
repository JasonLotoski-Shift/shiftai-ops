"use server";

// Pipeline / deal-scoped mutations.
//
// Canonical mutation recipe (see shiftai-ops/CLAUDE.md "Wire a Quick
// Action end-to-end").

import { Readable } from "node:stream";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { drive } from "@/lib/drive";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { assertNoNeedsInput } from "@/lib/no-hallucination";
import { generate } from "@/lib/ai";
import { formatCAD, formatDate } from "@/lib/format";

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
export async function convertDeal(
  dealId: string,
  input: { scope: string },
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

  // Sensible defaults for fields not collected by the modal — partners
  // can edit on the Client / Project pages after convert.
  const workspacePath = `C:\\Users\\jason\\Desktop\\Shift\\03-Clients\\${deal.company.replace(/\s+/g, "")}`;
  const startDate = new Date();
  const targetEndDate = new Date(startDate);
  targetEndDate.setDate(targetEndDate.getDate() + 28); // ~4 weeks for Discovery

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
        status: "on_track",
        startDate,
        targetEndDate,
        // Seed the fee from the deal's estimated value so the project doesn't
        // start at $0; the partner can adjust it on the project page.
        budgetFee: deal.valueEstimate || 0,
        description: scope,
        clientId: client.id,
        partnerLeadId: deal.partnerLeadId,
      },
    });

    await tx.deal.update({
      where: { id: dealId },
      data: { stage: "signed", lastTouchAt: new Date(), stageEnteredAt: new Date() },
    });

    await writeAudit(tx, {
      actor,
      action: "convert.deal.signed",
      targetType: "Deal",
      targetId: dealId,
      changes: {
        stage: { before: deal.stage, after: "signed" },
        createdClientId: client.id,
        createdProjectId: project.id,
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

export async function generateProposal(
  dealId: string,
  input: { focus: string; fee?: string; timeline?: string; notes?: string },
): Promise<{ body: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const focus = input.focus.trim();
  if (!focus) throw new Error("Focus is required");

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      contact: {
        select: {
          name: true,
          title: true,
          company: true,
          interactions: {
            orderBy: { date: "desc" },
            take: 6,
            select: { type: true, date: true, summary: true },
          },
        },
      },
      partnerLead: { select: { name: true } },
    },
  });
  if (!deal) throw new Error("Deal not found");

  const contextLines: string[] = [
    "## Opportunity",
    `Company: ${deal.company}`,
    `Industry: ${deal.industry}`,
    `Deal stage: ${deal.stage}`,
    `Estimated value: ${formatCAD(deal.valueEstimate)}`,
    `Target close: ${formatDate(deal.closeTargetDate)}`,
  ];
  if (deal.notes) contextLines.push(`Deal notes: ${deal.notes}`);
  contextLines.push(
    "",
    "## Primary contact",
    `${deal.contact.name} — ${deal.contact.title}, ${deal.contact.company}`,
  );
  if (deal.contact.interactions.length) {
    contextLines.push("", "## Recent interactions (newest first)");
    for (const i of deal.contact.interactions) {
      contextLines.push(`- ${formatDate(i.date)} · ${i.type.replace("_", "-")} — ${i.summary}`);
    }
  } else {
    contextLines.push("", "## Recent interactions", "None logged yet.");
  }
  const context = contextLines.join("\n");

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
