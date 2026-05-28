"use server";

// Contact-scoped server actions.
//
// Canonical mutation recipe (see app/(app)/dashboard/actions.ts header).

import { Readable } from "node:stream";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { drive, folderIdFromUrl } from "@/lib/drive";
import { writeAudit, partnerActor } from "@/lib/audit";
import { assertNoNeedsInput } from "@/lib/no-hallucination";
import type { InteractionType } from "@/lib/generated/prisma/enums";

// Accept only the schema's enum values — defense in depth on top of the
// <select> in LogInteractionModal.
const VALID_TYPES: InteractionType[] = ["call", "meeting", "email_sent", "email_received", "other"];

export async function logInteraction(
  contactId: string,
  input: {
    type: string; // underscored Prisma identifier (e.g. "email_sent")
    date: string; // ISO date "YYYY-MM-DD"
    summary: string;
    channel?: string;
  },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const summary = input.summary.trim();
  if (!summary) throw new Error("Summary is required");
  if (!VALID_TYPES.includes(input.type as InteractionType)) {
    throw new Error(`Invalid interaction type: ${input.type}`);
  }
  const date = new Date(input.date);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${input.date}`);

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, lastTouchAt: true },
  });
  if (!contact) throw new Error("Contact not found");

  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );
  const advanceTouch = date > contact.lastTouchAt;

  const interaction = await prisma.$transaction(async (tx) => {
    const created = await tx.interaction.create({
      data: {
        contactId,
        type: input.type as InteractionType,
        date,
        summary,
        channel: input.channel?.trim() || null,
        // Partner display name as the actor label — agents use "AGENT · CLAUDE".
        loggedBy: session.user.name ?? session.user.email ?? "Unknown",
      },
    });

    if (advanceTouch) {
      await tx.contact.update({
        where: { id: contactId },
        data: { lastTouchAt: date },
      });
    }

    await writeAudit(tx, {
      actor,
      action: "create.interaction",
      targetType: "Interaction",
      targetId: created.id,
      changes: {
        contactId,
        type: input.type,
        date: date.toISOString(),
        summaryLength: summary.length,
        advancedLastTouch: advanceTouch,
      },
    });

    return created;
  });

  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/contacts");
  return { id: interaction.id };
}

// ──────────────────────────────────────────────────────────────────────
// Email draft / send — persistence recipe for the Draft email Quick Action.
//
// Both actions follow the canonical recipe end-to-end:
//   1. Validate body (no-hallucination gate)
//   2. Resolve scope (Client > Deal > orphan) for the Artifact + Drive folder
//   3. Upload body to Drive (Client folder if reachable, else Shared Drive root)
//   4. Inside a $transaction: Artifact row + (if sent) Interaction row +
//      advance Contact.lastTouchAt + writeAudit
//
// Drive upload happens BEFORE the transaction so a DB failure rolls back the
// DB writes; the orphan Drive file stays but its ID is in the audit row.
//
// Phase 3d note: the body is currently built client-side by DraftEmailModal
// (template-fill from partner inputs). When the Claude API integration lands
// in a follow-up, the action signature stays the same — just upstream of
// the call, the modal will receive an LLM-generated body instead.
// ──────────────────────────────────────────────────────────────────────

type EmailScope = {
  clientId: string | null;
  dealId: string | null;
  parentFolderId: string;
};

async function resolveEmailScope(contactId: string): Promise<{
  contact: { id: string; name: string; lastTouchAt: Date };
  scope: EmailScope;
}> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      name: true,
      lastTouchAt: true,
      primaryForClients: {
        select: { id: true, driveFolderUrl: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      deals: {
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });
  if (!contact) throw new Error("Contact not found");

  const sharedDriveFolderId = process.env.DRIVE_SHARED_DRIVE_FOLDER_ID;
  if (!sharedDriveFolderId) {
    throw new Error("DRIVE_SHARED_DRIVE_FOLDER_ID is not configured");
  }

  const client = contact.primaryForClients[0] ?? null;
  const deal = client ? null : contact.deals[0] ?? null;

  // Try the client's Drive folder; fall back to the Shared Drive root if the
  // URL doesn't parse (seed data uses placeholder URLs without /folders/<id>).
  let parentFolderId = sharedDriveFolderId;
  if (client) {
    try {
      parentFolderId = folderIdFromUrl(client.driveFolderUrl);
    } catch {
      // Placeholder URL — fall back to Shared Drive root and tag the artifact
      // (caller handles labeling).
    }
  }

  return {
    contact: { id: contact.id, name: contact.name, lastTouchAt: contact.lastTouchAt },
    scope: { clientId: client?.id ?? null, dealId: deal?.id ?? null, parentFolderId },
  };
}

async function uploadEmailToDrive(
  body: string,
  fileName: string,
  parentFolderId: string,
): Promise<{ fileId: string; webViewLink: string }> {
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentFolderId],
      mimeType: "text/markdown",
    },
    media: {
      mimeType: "text/markdown",
      body: Readable.from(body),
    },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  if (!res.data.id || !res.data.webViewLink) {
    throw new Error("Drive upload returned no ID");
  }
  return { fileId: res.data.id, webViewLink: res.data.webViewLink };
}

function summarizeBody(body: string): string {
  const firstLines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
  return firstLines.length > 200 ? firstLines.slice(0, 197) + "…" : firstLines;
}

export async function saveEmailDraft(
  contactId: string,
  input: { body: string },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const body = input.body.trimEnd();
  if (!body.trim()) throw new Error("Email body is required");
  assertNoNeedsInput(body, "email body");

  const { contact, scope } = await resolveEmailScope(contactId);

  const today = new Date().toISOString().slice(0, 10);
  const fileName = `${today}-${contact.name.replace(/\s+/g, "-")}-email-draft.md`;
  const { fileId, webViewLink } = await uploadEmailToDrive(body, fileName, scope.parentFolderId);

  const artifact = await prisma.$transaction(async (tx) => {
    const created = await tx.artifact.create({
      data: {
        type: "email",
        title: `Email draft · ${contact.name} · ${today}`,
        driveUrl: webViewLink,
        fileName,
        createdBy: partnerLabel,
        generatedFromSkill: null,
        reviewStatus: "draft",
        clientId: scope.clientId,
        dealId: scope.dealId,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.artifact.email.draft",
      targetType: "Artifact",
      targetId: created.id,
      changes: {
        contactId,
        scope: scope.clientId
          ? `client:${scope.clientId}`
          : scope.dealId
            ? `deal:${scope.dealId}`
            : "orphan",
        driveFileId: fileId,
        bodyLength: body.length,
      },
    });

    return created;
  });

  revalidatePath(`/contacts/${contactId}`);
  if (scope.clientId) revalidatePath(`/clients/${scope.clientId}`);
  return { artifactId: artifact.id, driveUrl: webViewLink };
}

export async function sendEmail(
  contactId: string,
  input: { body: string },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const body = input.body.trimEnd();
  if (!body.trim()) throw new Error("Email body is required");
  assertNoNeedsInput(body, "email body");

  const { contact, scope } = await resolveEmailScope(contactId);

  const today = new Date().toISOString().slice(0, 10);
  const fileName = `${today}-${contact.name.replace(/\s+/g, "-")}-email-sent.md`;
  const { fileId, webViewLink } = await uploadEmailToDrive(body, fileName, scope.parentFolderId);

  const sentAt = new Date();
  const summary = summarizeBody(body);

  const result = await prisma.$transaction(async (tx) => {
    const artifact = await tx.artifact.create({
      data: {
        type: "email",
        title: `Email sent · ${contact.name} · ${today}`,
        driveUrl: webViewLink,
        fileName,
        createdBy: partnerLabel,
        generatedFromSkill: null,
        reviewStatus: "sent",
        clientId: scope.clientId,
        dealId: scope.dealId,
      },
    });

    const interaction = await tx.interaction.create({
      data: {
        contactId,
        type: "email_sent" as InteractionType,
        date: sentAt,
        summary,
        loggedBy: partnerLabel,
      },
    });

    if (sentAt > contact.lastTouchAt) {
      await tx.contact.update({
        where: { id: contactId },
        data: { lastTouchAt: sentAt },
      });
    }

    await writeAudit(tx, {
      actor,
      action: "create.artifact.email.sent",
      targetType: "Artifact",
      targetId: artifact.id,
      changes: {
        contactId,
        scope: scope.clientId
          ? `client:${scope.clientId}`
          : scope.dealId
            ? `deal:${scope.dealId}`
            : "orphan",
        driveFileId: fileId,
        bodyLength: body.length,
        interactionId: interaction.id,
        advancedLastTouch: sentAt > contact.lastTouchAt,
      },
    });

    return { artifactId: artifact.id, interactionId: interaction.id };
  });

  revalidatePath(`/contacts/${contactId}`);
  if (scope.clientId) revalidatePath(`/clients/${scope.clientId}`);
  return { ...result, driveUrl: webViewLink };
}

