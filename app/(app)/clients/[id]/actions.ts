"use server";

// Client-scoped Quick Actions.
//
// Canonical recipe (see shiftai-ops/CLAUDE.md "Wire a Quick Action end-to-end"):
//   generate*  — read/generate only, returns the draft (editable in the modal)
//   save*      — Drive upload + Artifact (+ Interaction) + AuditLog + Activity,
//                one transaction
//
// Two generative docs (Draft client survey, Draft discussion doc) share one
// context loader + generate/save pair, keyed by skill. Upload client files is
// an ingest round-trip (no generation).

import { Readable } from "node:stream";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { drive, folderIdFromUrl } from "@/lib/drive";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { assertNoNeedsInput } from "@/lib/no-hallucination";
import { generate } from "@/lib/ai";
import { formatDate } from "@/lib/format";
import type { ArtifactType, InteractionType } from "@/lib/generated/prisma/enums";

// Which generative client docs exist, and how each is labelled / filed.
const CLIENT_DOCS = {
  "client-survey": { kind: "survey", title: "Client survey", fileSuffix: "survey" },
  "discussion-doc": { kind: "discussion", title: "Discussion doc", fileSuffix: "discussion-doc" },
} as const;
type ClientDocSkill = keyof typeof CLIENT_DOCS;

function isClientDocSkill(s: string): s is ClientDocSkill {
  return s in CLIENT_DOCS;
}

// Resolve the client's Drive folder; fall back to the Shared Drive root when the
// stored URL is a placeholder without /folders/<id> (seed data). Mirrors the
// email-draft scope resolution.
function resolveClientFolderId(driveFolderUrl: string): string {
  const shared = process.env.DRIVE_SHARED_DRIVE_FOLDER_ID;
  if (!shared) throw new Error("DRIVE_SHARED_DRIVE_FOLDER_ID is not configured");
  try {
    return folderIdFromUrl(driveFolderUrl);
  } catch {
    return shared;
  }
}

async function uploadMarkdown(body: string, fileName: string, parentFolderId: string) {
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [parentFolderId], mimeType: "text/markdown" },
    media: { mimeType: "text/markdown", body: Readable.from(body) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  if (!res.data.id || !res.data.webViewLink) throw new Error("Drive upload returned no ID");
  return { fileId: res.data.id, webViewLink: res.data.webViewLink };
}

// ──────────────────────────────────────────────────────────────────────
// Generative client docs — survey + discussion doc
// ──────────────────────────────────────────────────────────────────────

export async function generateClientDoc(
  clientId: string,
  input: { skill: string; focus: string; notes?: string },
): Promise<{ body: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  if (!isClientDocSkill(input.skill)) throw new Error(`Unknown client doc skill: ${input.skill}`);

  const focus = input.focus.trim();
  if (!focus) throw new Error("Focus is required");

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      company: true,
      industry: true,
      status: true,
      description: true,
      companyKeyFacts: true,
      primaryContact: {
        select: {
          name: true,
          title: true,
          interactions: {
            orderBy: { date: "desc" },
            take: 6,
            select: { type: true, date: true, summary: true },
          },
        },
      },
      projects: {
        orderBy: { startDate: "desc" },
        select: { name: true, phase: true, status: true },
      },
    },
  });
  if (!client) throw new Error("Client not found");

  const contextLines: string[] = [
    "## Client",
    `Company: ${client.company}`,
    `Industry: ${client.industry}`,
    `Engagement status: ${client.status.replace("_", "-")}`,
  ];
  if (client.description) contextLines.push(`About: ${client.description}`);
  if (client.companyKeyFacts.length) contextLines.push(`Key facts: ${client.companyKeyFacts.join("; ")}`);

  if (client.projects.length) {
    contextLines.push("", "## What we're building");
    for (const p of client.projects) {
      contextLines.push(`- ${p.name} — phase: ${p.phase}, status: ${p.status.replace("_", "-")}`);
    }
  }

  contextLines.push(
    "",
    "## Primary contact",
    `${client.primaryContact.name} — ${client.primaryContact.title}`,
  );
  if (client.primaryContact.interactions.length) {
    contextLines.push("", "## Recent interactions (newest first)");
    for (const i of client.primaryContact.interactions) {
      contextLines.push(`- ${formatDate(i.date)} · ${i.type.replace("_", "-")} — ${i.summary}`);
    }
  }
  const context = contextLines.join("\n");

  const intake = [
    `## This ${CLIENT_DOCS[input.skill].title.toLowerCase()}`,
    `Focus / what it's for: ${focus}`,
    `Extra notes from the partner: ${input.notes?.trim() || "(none)"}`,
  ].join("\n");

  const body = await generate({ skill: input.skill, context, intake, maxTokens: 5000 });
  return { body: body.trim() };
}

export async function saveClientDoc(
  clientId: string,
  input: { skill: string; body: string },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  if (!isClientDocSkill(input.skill)) throw new Error(`Unknown client doc skill: ${input.skill}`);
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const body = input.body.trimEnd();
  if (!body.trim()) throw new Error("Document body is required");
  assertNoNeedsInput(body, CLIENT_DOCS[input.skill].title.toLowerCase());

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, company: true, driveFolderUrl: true },
  });
  if (!client) throw new Error("Client not found");

  const cfg = CLIENT_DOCS[input.skill];
  const parentFolderId = resolveClientFolderId(client.driveFolderUrl);
  const today = new Date().toISOString().slice(0, 10);
  const fileName = `${today}-${client.company.replace(/\s+/g, "-")}-${cfg.fileSuffix}.md`;
  const { fileId, webViewLink } = await uploadMarkdown(body, fileName, parentFolderId);

  const artifact = await prisma.$transaction(async (tx) => {
    const created = await tx.artifact.create({
      data: {
        type: "report" as ArtifactType,
        title: `${cfg.title} · ${client.company} · ${today}`,
        driveUrl: webViewLink,
        fileName,
        createdBy: partnerLabel,
        generatedFromSkill: input.skill,
        reviewStatus: "draft",
        clientId: client.id,
      },
    });

    await writeAudit(tx, {
      actor,
      action: `create.artifact.${cfg.kind}.draft`,
      targetType: "Artifact",
      targetId: created.id,
      changes: { clientId, driveFileId: fileId, bodyLength: body.length },
    });

    await writeActivity(tx, {
      actor,
      type: "doc",
      target: client.company,
      detail: `Drafted ${cfg.title.toLowerCase()} — awaiting review`,
      link: `/clients/${clientId}`,
    });

    return created;
  });

  revalidatePath(`/clients/${clientId}`);
  return { artifactId: artifact.id, driveUrl: webViewLink };
}

// ──────────────────────────────────────────────────────────────────────
// Upload client files — ingest round-trip (e.g. Fireflies meeting notes).
// No generation: the partner supplies the content; we file it to Drive,
// register an Artifact, and — if it's a meeting — log an Interaction so the
// touch shows on the timeline. Same round-trip rule as every other channel.
// ──────────────────────────────────────────────────────────────────────

export async function uploadClientFile(
  clientId: string,
  input: { fileName: string; content: string; logAsMeeting?: boolean; summary?: string },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const content = input.content.trim();
  const rawName = input.fileName.trim();
  if (!content) throw new Error("File content is empty");
  if (!rawName) throw new Error("File name is required");
  // Normalise to a markdown filename so it renders in Drive.
  const fileName = /\.(md|txt|markdown)$/i.test(rawName) ? rawName : `${rawName}.md`;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, company: true, driveFolderUrl: true, primaryContactId: true, primaryContact: { select: { lastTouchAt: true } } },
  });
  if (!client) throw new Error("Client not found");

  const parentFolderId = resolveClientFolderId(client.driveFolderUrl);
  const { fileId, webViewLink } = await uploadMarkdown(content, fileName, parentFolderId);

  const logAsMeeting = !!input.logAsMeeting;
  const summary = (input.summary?.trim() || `Uploaded meeting notes — ${fileName}`).slice(0, 300);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const artifact = await tx.artifact.create({
      data: {
        type: "other" as ArtifactType,
        title: `Uploaded · ${fileName}`,
        driveUrl: webViewLink,
        fileName,
        createdBy: partnerLabel,
        generatedFromSkill: null,
        // A real uploaded reference doc, not a pending AI draft.
        reviewStatus: "approved",
        clientId: client.id,
      },
    });

    if (logAsMeeting) {
      await tx.interaction.create({
        data: {
          contactId: client.primaryContactId,
          type: "meeting" as InteractionType,
          date: now,
          summary,
          channel: "Meeting notes (upload)",
          loggedBy: partnerLabel,
        },
      });
      if (now > client.primaryContact.lastTouchAt) {
        await tx.contact.update({ where: { id: client.primaryContactId }, data: { lastTouchAt: now } });
      }
    }

    await writeAudit(tx, {
      actor,
      action: "create.artifact.upload",
      targetType: "Artifact",
      targetId: artifact.id,
      changes: { clientId, driveFileId: fileId, fileName, loggedAsMeeting: logAsMeeting },
    });

    await writeActivity(tx, {
      actor,
      type: "doc",
      target: client.company,
      detail: logAsMeeting ? `Uploaded meeting notes — ${fileName}` : `Uploaded file — ${fileName}`,
      link: `/clients/${clientId}`,
    });

    return artifact;
  });

  revalidatePath(`/clients/${clientId}`);
  return { artifactId: result.id, driveUrl: webViewLink };
}
