"use server";

// Clients-list–scoped server actions (creation lives here; per-client
// mutations live in clients/[id]/actions.ts).
//
// Canonical mutation recipe (see app/(app)/pipeline/[id]/actions.ts
// convertDeal, which this mirrors): create the Drive folder, then a Client +
// AuditLog + Activity in one $transaction, then revalidate.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { drive, seedClientSubfolders } from "@/lib/drive";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { validateIndustry, validateSubIndustry } from "@/lib/industries";
import type { Industry } from "@/lib/generated/prisma/enums";

export type CreateClientInput = {
  company: string;
  industry: string;
  /** Tier-2 sub-industry (controlled vocabulary for the chosen vertical). */
  subIndustry?: string;
  /** Free-text annual revenue (e.g. "$50M"). Optional — defaults to "—". */
  revenue?: string;
  contractValue: number;
  /** ISO date string from the date input (yyyy-mm-dd). */
  contractSignedAt: string;
  /** Partner who leads the engagement. Defaults to the signed-in partner. */
  partnerLeadId?: string;
  primaryContactId: string;
  paymentTerms?: string;
};

// Manual "Add a new client" — for engagements that didn't come through the
// pipeline (or where the deal wasn't tracked). Mirrors convertDeal's record
// creation: Drive folder + Client row, with the same defaults convertDeal uses.
export async function createClient(input: CreateClientInput) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  // Validate
  const company = input.company.trim();
  if (!company) throw new Error("Company is required");
  if (!validateIndustry(input.industry)) {
    throw new Error(`Invalid industry: ${input.industry}`);
  }
  // Optional Tier-2 sub-industry — validated against the chosen vertical's
  // vocabulary; an off-list value is dropped (never guessed) rather than thrown.
  const subIndustry =
    input.subIndustry && validateSubIndustry(input.industry, input.subIndustry)
      ? input.subIndustry.trim()
      : null;
  const contractValue = Number(input.contractValue);
  if (!Number.isFinite(contractValue) || contractValue < 0) {
    throw new Error("Contract value must be a non-negative number");
  }
  const contractSignedAt = new Date(input.contractSignedAt);
  if (Number.isNaN(contractSignedAt.getTime())) {
    throw new Error("Contract signed date is invalid");
  }

  // Default the partner lead to whoever is signed in; allow an explicit
  // override (the form offers the roster). Validate the FK exists.
  const partnerLeadId = input.partnerLeadId?.trim() || session.user.partnerId;
  const partnerLead = await prisma.partner.findUnique({
    where: { id: partnerLeadId },
    select: { id: true },
  });
  if (!partnerLead) throw new Error("Partner lead not found");

  // Primary contact is required and must exist.
  const primaryContactId = input.primaryContactId?.trim();
  if (!primaryContactId) throw new Error("Primary contact is required");
  const primaryContact = await prisma.contact.findUnique({
    where: { id: primaryContactId },
    select: { id: true },
  });
  if (!primaryContact) throw new Error("Primary contact not found");

  // Create the Drive folder BEFORE the DB transaction so we have its URL to
  // store on the Client row — same approach as convertDeal. If this fails, no
  // DB writes happen. On a later DB failure the orphan folder is harmless and
  // its ID is recorded in the audit row so it's findable.
  const sharedDriveFolderId = process.env.DRIVE_SHARED_DRIVE_FOLDER_ID;
  if (!sharedDriveFolderId) {
    throw new Error("DRIVE_SHARED_DRIVE_FOLDER_ID is not configured");
  }
  const folderRes = await drive.files.create({
    requestBody: {
      name: company,
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
  // Client create if a subfolder hiccups).
  await seedClientSubfolders(folderId);

  const workspacePath = `C:\\Users\\jason\\Desktop\\Shift\\03-Clients\\${company.replace(/\s+/g, "")}`;

  const client = await prisma.$transaction(async (tx) => {
    const created = await tx.client.create({
      data: {
        company,
        industry: input.industry as Industry,
        subIndustry,
        revenue: input.revenue?.trim() || "—",
        driveFolderUrl: folderUrl,
        workspacePath,
        contractValue,
        contractSignedAt,
        status: "on_track",
        paymentTerms: input.paymentTerms?.trim() || null,
        partnerLeadId,
        primaryContactId,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.client",
      targetType: "Client",
      targetId: created.id,
      changes: {
        company,
        industry: input.industry,
        subIndustry,
        contractValue,
        partnerLeadId,
        primaryContactId,
        driveFolderId: folderId,
      },
    });

    await writeActivity(tx, {
      actor,
      type: "status",
      target: company,
      detail: "Client added — engagement opened",
      link: `/clients/${created.id}`,
    });

    return created;
  });

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return { id: client.id };
}
