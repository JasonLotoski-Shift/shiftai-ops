"use server";

// Pipeline / deal-scoped mutations.
//
// Canonical mutation recipe (see shiftai-ops/CLAUDE.md "Wire a Quick
// Action end-to-end").

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { drive } from "@/lib/drive";
import { writeAudit, partnerActor } from "@/lib/audit";
import { assertNoNeedsInput } from "@/lib/no-hallucination";

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
        budgetHours: 0, // partner sets when scoping
        hoursLogged: 0,
        budgetFee: 0,
        description: scope,
        clientId: client.id,
        partnerLeadId: deal.partnerLeadId,
      },
    });

    await tx.deal.update({
      where: { id: dealId },
      data: { stage: "signed", lastTouchAt: new Date() },
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

    return { clientId: client.id, projectId: project.id };
  });

  revalidatePath(`/pipeline/${dealId}`);
  revalidatePath("/pipeline");
  revalidatePath("/clients");
  revalidatePath("/projects");
  revalidatePath("/dashboard");

  return result;
}
