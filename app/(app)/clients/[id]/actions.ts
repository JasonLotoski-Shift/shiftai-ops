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

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { folderIdFromUrl, uploadFile } from "@/lib/drive";
import { writeAudit, writeActivity, partnerActor, agentActor } from "@/lib/audit";
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

function uploadMarkdown(body: string, fileName: string, parentFolderId: string) {
  return uploadFile(body, fileName, parentFolderId, "text/markdown");
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

// ──────────────────────────────────────────────────────────────────────
// Company web enrichment — the "Enrich from web" Quick Action on the
// company-profile tab. Web counterpart to the contact enrich pattern:
//
//   generateCompanyEnrichment() runs the enrich-company-web skill with
//     web_search ON, PROPOSES company-profile additions + conflicts
//     (cited from public sources), writes nothing.
//   applyCompanyEnrichment() takes the partner-approved additions and merges
//     them append-only: single-value fields set ONLY if currently empty;
//     companyKeyFacts appended with case-insensitive dedupe. Never overwrites
//     an existing scalar — divergences come back as conflicts the skill flags.
//
// Mirrors contacts applyEnrichment() exactly (set-if-empty scalars + dedup'd
// list append + enrichedAt + writeAudit/writeActivity under agentActor).
// ──────────────────────────────────────────────────────────────────────

// Fields the enrich-company-web skill is allowed to touch, split by shape so
// the merge knows append (list) vs set-if-empty (scalar).
const COMPANY_ENRICH_LIST_FIELDS = ["companyKeyFacts"] as const;
const COMPANY_ENRICH_SCALAR_FIELDS = [
  "companySize",
  "headquarters",
  "founded",
  "website",
  "ownership",
  "description",
] as const;
type CompanyEnrichListField = (typeof COMPANY_ENRICH_LIST_FIELDS)[number];
type CompanyEnrichScalarField = (typeof COMPANY_ENRICH_SCALAR_FIELDS)[number];
type CompanyEnrichField = CompanyEnrichListField | CompanyEnrichScalarField;

export type CompanyEnrichAddition = { field: CompanyEnrichField; value: string };
export type CompanyEnrichConflict = {
  field: CompanyEnrichScalarField;
  existing: string;
  proposed: string;
  note?: string;
};

const ALL_COMPANY_ENRICH_FIELDS: string[] = [
  ...COMPANY_ENRICH_LIST_FIELDS,
  ...COMPANY_ENRICH_SCALAR_FIELDS,
];

function isCompanyEnrichField(f: unknown): f is CompanyEnrichField {
  return typeof f === "string" && ALL_COMPANY_ENRICH_FIELDS.includes(f);
}

function parseCompanyEnrichmentJSON(raw: string): {
  additions: CompanyEnrichAddition[];
  conflicts: CompanyEnrichConflict[];
} {
  let text = raw.trim();
  // Strip a ```json fence if the model added one despite instructions.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  // Otherwise slice to the outermost braces.
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  }

  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error("Enrichment returned malformed output — try again.");
  }
  const o = obj as { additions?: unknown; conflicts?: unknown };

  const additions: CompanyEnrichAddition[] = Array.isArray(o.additions)
    ? o.additions
        .filter(
          (a): a is { field: CompanyEnrichField; value: string } =>
            !!a &&
            typeof a === "object" &&
            isCompanyEnrichField((a as { field?: unknown }).field) &&
            typeof (a as { value?: unknown }).value === "string" &&
            (a as { value: string }).value.trim().length > 0,
        )
        .map((a) => ({ field: a.field, value: a.value.trim() }))
    : [];

  const isScalarField = (f: unknown): f is CompanyEnrichScalarField =>
    typeof f === "string" &&
    (COMPANY_ENRICH_SCALAR_FIELDS as readonly string[]).includes(f);

  const conflicts: CompanyEnrichConflict[] = Array.isArray(o.conflicts)
    ? o.conflicts
        .filter(
          (c): c is CompanyEnrichConflict =>
            !!c &&
            typeof c === "object" &&
            isScalarField((c as { field?: unknown }).field) &&
            typeof (c as { existing?: unknown }).existing === "string" &&
            typeof (c as { proposed?: unknown }).proposed === "string",
        )
        .map((c) => ({
          field: c.field,
          existing: c.existing,
          proposed: c.proposed,
          note: typeof c.note === "string" ? c.note : undefined,
        }))
    : [];

  return { additions, conflicts };
}

export async function generateCompanyEnrichment(
  clientId: string,
): Promise<{ additions: CompanyEnrichAddition[]; conflicts: CompanyEnrichConflict[] }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      company: true,
      industry: true,
      companySize: true,
      headquarters: true,
      founded: true,
      website: true,
      ownership: true,
      description: true,
      companyKeyFacts: true,
    },
  });
  if (!client) throw new Error("Client not found");

  const ctx: string[] = [
    "## Company record (existing)",
    `Company: ${client.company}`,
    `Industry: ${client.industry}`,
    `Website: ${client.website || "(empty)"}`,
    `Company size: ${client.companySize || "(empty)"}`,
    `Headquarters: ${client.headquarters || "(empty)"}`,
    `Founded: ${client.founded || "(empty)"}`,
    `Ownership: ${client.ownership || "(empty)"}`,
    `Description: ${client.description || "(empty)"}`,
    `Key facts: ${client.companyKeyFacts.length ? client.companyKeyFacts.join("; ") : "(none)"}`,
  ];

  const raw = await generate({
    skill: "enrich-company-web",
    context: ctx.join("\n"),
    intake:
      "Use web search to find public, authoritative facts about this exact company (use the company name, industry, and website to disambiguate). Propose company-profile additions, citing a source for every fact. Return the JSON object exactly as specified.",
    webSearch: true,
    maxTokens: 2000,
  });

  return parseCompanyEnrichmentJSON(raw);
}

export async function applyCompanyEnrichment(
  clientId: string,
  additions: CompanyEnrichAddition[],
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";

  const clean = (additions ?? []).filter(
    (a) => isCompanyEnrichField(a?.field) && a.value?.trim(),
  );
  if (clean.length === 0) throw new Error("No additions to apply");

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      company: true,
      companySize: true,
      headquarters: true,
      founded: true,
      website: true,
      ownership: true,
      description: true,
      companyKeyFacts: true,
    },
  });
  if (!client) throw new Error("Client not found");

  // Non-destructive update: append new list facts (case-insensitive dedupe);
  // set scalar fields ONLY if currently empty (never overwrite — that's a
  // conflict the partner resolves by hand).
  const data: Record<string, unknown> = {};
  const keyFacts = [...client.companyKeyFacts];
  const applied: CompanyEnrichAddition[] = [];
  const skipped: CompanyEnrichAddition[] = [];

  for (const a of clean) {
    if ((COMPANY_ENRICH_LIST_FIELDS as readonly string[]).includes(a.field)) {
      const exists = keyFacts.some((v) => v.toLowerCase() === a.value.toLowerCase());
      if (!exists) {
        keyFacts.push(a.value);
        applied.push(a);
      } else {
        skipped.push(a);
      }
    } else {
      const f = a.field as CompanyEnrichScalarField;
      const current = client[f];
      if (!current || !current.trim()) {
        data[f] = a.value;
        applied.push(a);
      } else {
        // Already set — don't overwrite. Partner resolves conflicts manually.
        skipped.push(a);
      }
    }
  }

  if (keyFacts.length !== client.companyKeyFacts.length) data.companyKeyFacts = keyFacts;

  if (applied.length === 0) {
    return { applied: 0, skipped: skipped.length };
  }

  data.enrichedAt = new Date();
  // The act of enriching is itself an AI surface, attributed to the skill.
  const aiActor = agentActor("enrich-company-web");

  await prisma.$transaction(async (tx) => {
    await tx.client.update({ where: { id: clientId }, data });

    await writeAudit(tx, {
      actor: aiActor,
      action: "update.client.enrich",
      targetType: "Client",
      targetId: clientId,
      changes: {
        approvedBy: partnerLabel,
        applied: applied.map((a) => ({ field: a.field, value: a.value })),
        skipped: skipped.length,
      },
    });

    await writeActivity(tx, {
      actor: aiActor,
      type: "ai",
      target: client.company,
      detail: `Enriched company profile — ${applied.length} fact(s) added (approved by ${partnerLabel.split(" ")[0]})`,
      link: `/clients/${clientId}`,
    });
  });

  revalidatePath(`/clients/${clientId}`);
  return { applied: applied.length, skipped: skipped.length };
}
