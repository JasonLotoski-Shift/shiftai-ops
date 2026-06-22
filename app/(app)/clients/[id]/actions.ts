"use server";

// Client-scoped Quick Actions.
//
// Canonical recipe (see shiftai-ops/CLAUDE.md "Wire a Quick Action end-to-end"):
//   generate*  — read/generate only, returns the draft (editable in the modal)
//   save*      — Drive upload + Artifact (+ Interaction) + AuditLog + Activity,
//                one transaction
//
// Upload client files is an ingest round-trip (no generation). The client
// survey skill was removed 2026-06-12 — the deal-side discovery questionnaire
// (pipeline/[id]/tally-actions.ts) covers that step with a live Tally form.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { folderIdFromUrl, uploadFile, uploadAsGoogleDoc } from "@/lib/drive";
import { writeAudit, writeActivity, partnerActor, agentActor } from "@/lib/audit";
import { assertNoNeedsInput } from "@/lib/no-hallucination";
import { generate } from "@/lib/ai";
import { renderContract, type ContractIntake } from "@/lib/contract/template";
import { latestScopeText } from "@/lib/contract/scope-source";
import { loadScreenshotImages } from "@/lib/ingest-uploads";
import { formatDate } from "@/lib/format";
import { normalizeDomain } from "@/lib/apollo";
import type { ArtifactType, InteractionType } from "@/lib/generated/prisma/enums";

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

function uploadHtml(body: string, fileName: string, parentFolderId: string) {
  return uploadFile(body, fileName, parentFolderId, "text/html");
}

// ──────────────────────────────────────────────────────────────────────
// Discovery report — a client-facing HTML build-plan deck (light mode +
// client brand). Same generate/save split, but the output is HTML. Reads the
// client's saved brandColors (captured by enrich-company-web) so the deck
// renders in the client's accent on the Shift light canvas; no pricing.
// ──────────────────────────────────────────────────────────────────────

export async function generateDiscoveryReport(
  clientId: string,
  input: { findings: string; timeBack?: string; outcomes?: string },
): Promise<{ body: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const findings = input.findings.trim();
  if (!findings) throw new Error("Discovery findings are required");

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      company: true,
      industry: true,
      description: true,
      companyKeyFacts: true,
      brandColors: true,
      primaryContact: {
        select: {
          name: true,
          title: true,
          interactions: {
            orderBy: { date: "desc" },
            take: 10,
            select: { type: true, date: true, summary: true },
          },
        },
      },
    },
  });
  if (!client) throw new Error("Client not found");

  const contextLines: string[] = [
    "## Client",
    `Company: ${client.company}`,
    `Industry: ${client.industry}`,
  ];
  if (client.description) contextLines.push(`About: ${client.description}`);
  if (client.companyKeyFacts.length) contextLines.push(`Key facts: ${client.companyKeyFacts.join("; ")}`);

  contextLines.push(
    "",
    "## Primary contact",
    `${client.primaryContact.name} — ${client.primaryContact.title}`,
  );
  if (client.primaryContact.interactions.length) {
    contextLines.push("", "## Discovery interactions (newest first)");
    for (const i of client.primaryContact.interactions) {
      contextLines.push(`- ${formatDate(i.date)} · ${i.type.replace("_", "-")} — ${i.summary}`);
    }
  }
  if (client.brandColors.length) {
    contextLines.push(
      "",
      "## Client brand colors (deck accent only — Shift fonts and layout stay)",
      `Primary: ${client.brandColors[0]}`,
    );
    if (client.brandColors[1]) contextLines.push(`Secondary: ${client.brandColors[1]}`);
  }
  const context = contextLines.join("\n");

  const intake = [
    "## Discovery findings (systems to build + what we found + the one new insight)",
    findings,
    "",
    "## Time-back target",
    input.timeBack?.trim() || "(not supplied — mark [NEEDS INPUT: time-back target])",
    "",
    "## The two outcomes the close confirms (X and Y)",
    input.outcomes?.trim() || "(not supplied — mark [NEEDS INPUT: outcomes X and Y])",
  ].join("\n");

  // Screenshots the client shared via Ingest become visual evidence of their
  // current tools/workflows — pass them to vision alongside the written context.
  const images = await loadScreenshotImages({ clientId });

  const body = await generate({
    skill: "discovery-report",
    context,
    intake,
    maxTokens: 10000,
    images: images.length ? images : undefined,
  });
  return { body: body.trim() };
}

export async function saveDiscoveryReport(clientId: string, input: { body: string }) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const body = input.body.trim();
  if (!body) throw new Error("Report body is required");
  assertNoNeedsInput(body, "discovery report");

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, company: true, driveFolderUrl: true },
  });
  if (!client) throw new Error("Client not found");

  const parentFolderId = resolveClientFolderId(client.driveFolderUrl);
  const today = new Date().toISOString().slice(0, 10);
  const fileName = `${today}-${client.company.replace(/\s+/g, "-")}-discovery-report.html`;
  const { fileId, webViewLink } = await uploadHtml(body, fileName, parentFolderId);

  const artifact = await prisma.$transaction(async (tx) => {
    const created = await tx.artifact.create({
      data: {
        type: "report" as ArtifactType,
        title: `Discovery report · ${client.company} · ${today}`,
        driveUrl: webViewLink,
        fileName,
        createdBy: partnerLabel,
        generatedFromSkill: "discovery-report",
        reviewStatus: "draft",
        clientId: client.id,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.artifact.discovery-report.draft",
      targetType: "Artifact",
      targetId: created.id,
      changes: { clientId, driveFileId: fileId, bodyLength: body.length },
    });

    await writeActivity(tx, {
      actor,
      type: "doc",
      target: client.company,
      detail: "Drafted discovery report, awaiting review",
      link: `/clients/${clientId}`,
    });

    return created;
  });

  revalidatePath(`/clients/${clientId}`);
  return { artifactId: artifact.id, driveUrl: webViewLink };
}

// ──────────────────────────────────────────────────────────────────────
// Statement of Work — a contract-grade draft filed as a native Google Doc in
// the client's Drive folder for the partner and counsel to redline. Output is
// semantic HTML; Drive converts it to a Doc on save. Never signature-ready: the
// skill stamps a DRAFT banner and [for counsel] / [NEEDS INPUT] markers.
// ──────────────────────────────────────────────────────────────────────

export async function generateSow(
  clientId: string,
  input: { terms: string; scopeNotes?: string },
): Promise<{ body: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const terms = input.terms.trim();
  if (!terms) throw new Error("Agreed terms are required");

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      company: true,
      industry: true,
      contractValue: true,
      description: true,
      primaryContact: { select: { name: true, title: true } },
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
    `Contract value on file: ${client.contractValue}`,
  ];
  if (client.description) contextLines.push(`About: ${client.description}`);
  contextLines.push(
    "",
    "## Primary contact",
    `${client.primaryContact.name} — ${client.primaryContact.title}`,
  );
  if (client.projects.length) {
    contextLines.push("", "## Projects / engagement");
    for (const p of client.projects) {
      contextLines.push(`- ${p.name} — phase: ${p.phase}, status: ${p.status.replace("_", "-")}`);
    }
  }
  const context = contextLines.join("\n");

  const intake = [
    "## Final agreed terms (parties' legal names, build fee, monthly subscription, any buy-out price, milestone dates, deployment choice)",
    terms,
    "",
    "## Scope notes",
    input.scopeNotes?.trim() || "(use the project scope from the context)",
  ].join("\n");

  const body = await generate({ skill: "sow", context, intake, maxTokens: 12000 });
  return { body: body.trim() };
}

export async function saveSow(clientId: string, input: { body: string }) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const body = input.body.trim();
  if (!body) throw new Error("SOW body is required");
  assertNoNeedsInput(body, "statement of work");

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, company: true, driveFolderUrl: true },
  });
  if (!client) throw new Error("Client not found");

  const parentFolderId = resolveClientFolderId(client.driveFolderUrl);
  const today = new Date().toISOString().slice(0, 10);
  const docName = `Statement of Work (DRAFT) - ${client.company} - ${today}`;
  const { fileId, webViewLink } = await uploadAsGoogleDoc(body, docName, parentFolderId);

  const artifact = await prisma.$transaction(async (tx) => {
    const created = await tx.artifact.create({
      data: {
        type: "sow" as ArtifactType,
        title: `SOW (draft) · ${client.company} · ${today}`,
        driveUrl: webViewLink,
        fileName: docName,
        createdBy: partnerLabel,
        generatedFromSkill: "sow",
        reviewStatus: "draft",
        clientId: client.id,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.artifact.sow.draft",
      targetType: "Artifact",
      targetId: created.id,
      changes: { clientId, driveFileId: fileId, bodyLength: body.length },
    });

    await writeActivity(tx, {
      actor,
      type: "doc",
      target: client.company,
      detail: "Drafted a Statement of Work (for partner + counsel review)",
      link: `/clients/${clientId}`,
    });

    return created;
  });

  revalidatePath(`/clients/${clientId}`);
  return { artifactId: artifact.id, driveUrl: webViewLink };
}

// ──────────────────────────────────────────────────────────────────────
// Generate Contract — the firm's standard client agreement, filed as a native
// Google Doc the client can redline (comments, track changes, export to PDF).
//
// Split, like every Quick Action: generateContract drafts (no writes),
// saveContract files it + Artifact + AuditLog + Activity in one transaction.
//
// Architecture (see lib/contract/template.ts): the binding legal terms are a
// FIXED, counsel-approved template — the LLM never rewrites them. Claude only
// drafts Schedule A (the Deliverable), grounded in the approved SOW. The server
// fills the parties/fees/dates deterministically and renders clean semantic HTML
// that uploadAsGoogleDoc imports into a Google Doc. The deal-scoped twin lives in
// app/(app)/pipeline/[id]/actions.ts.
// ──────────────────────────────────────────────────────────────────────

export async function generateContract(
  clientId: string,
  input: ContractIntake,
): Promise<{ body: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const preparedBy = session.user.name ?? session.user.email ?? "";

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      company: true,
      industry: true,
      contractValue: true,
      description: true,
      primaryContact: { select: { name: true, title: true, email: true } },
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
    `Contract value on file: ${client.contractValue}`,
  ];
  if (client.description) contextLines.push(`About: ${client.description}`);
  contextLines.push(
    "",
    "## Primary contact",
    `${client.primaryContact.name} — ${client.primaryContact.title}`,
  );
  if (client.projects.length) {
    contextLines.push("", "## Projects / engagement");
    for (const p of client.projects) {
      contextLines.push(`- ${p.name} — phase: ${p.phase}, status: ${p.status.replace("_", "-")}`);
    }
  }
  const sowText = await latestScopeText({ clientId });
  if (sowText) {
    contextLines.push(
      "",
      "## Approved Statement of Work (source of truth for Appendix A — build the scope from this)",
      sowText,
    );
  }
  const context = contextLines.join("\n");

  const intake = [
    "## Draft Schedule A (the Deliverable / Statement of Work) for this client's contract.",
    `Engagement / project name: ${input.projectName?.trim() || "(use the project name from the context)"}`,
    "",
    "## Scope notes from the partner",
    input.scopeNotes?.trim() ||
      "(none — build Schedule A from the approved SOW and the project scope in the context)",
  ].join("\n");

  const scheduleAHtml = (
    await generate({ skill: "generate-contract", context, intake, maxTokens: 8000 })
  ).trim();

  const body = renderContract({
    clientLegalName: input.clientLegalName,
    clientAddress: input.clientAddress,
    clientContactName: client.primaryContact.name,
    clientContactTitle: client.primaryContact.title,
    clientContactEmail: client.primaryContact.email,
    effectiveDate: input.effectiveDate,
    projectName: input.projectName,
    recital: input.recital ?? "",
    buildFee: input.buildFee,
    backgroundIpLicenseFee: input.backgroundIpLicenseFee,
    supportFee: input.supportFee ?? "",
    paymentTerms: input.paymentTerms,
    scheduleAHtml,
    preparedBy,
  });

  return { body };
}

export async function saveContract(clientId: string, input: { body: string }) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const body = input.body.trim();
  if (!body) throw new Error("Contract body is required");
  assertNoNeedsInput(body, "contract");

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, company: true, driveFolderUrl: true },
  });
  if (!client) throw new Error("Client not found");

  const parentFolderId = resolveClientFolderId(client.driveFolderUrl);
  const today = new Date().toISOString().slice(0, 10);
  // File as a native Google Doc (not raw HTML) so the client can redline it.
  const fileName = `Services Agreement (DRAFT) - ${client.company} - ${today}`;
  const { fileId, webViewLink } = await uploadAsGoogleDoc(body, fileName, parentFolderId);

  const artifact = await prisma.$transaction(async (tx) => {
    const created = await tx.artifact.create({
      data: {
        type: "contract" as ArtifactType,
        title: `Contract (draft) · ${client.company} · ${today}`,
        driveUrl: webViewLink,
        fileName,
        createdBy: partnerLabel,
        generatedFromSkill: "generate-contract",
        reviewStatus: "draft",
        clientId: client.id,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.artifact.contract.draft",
      targetType: "Artifact",
      targetId: created.id,
      changes: { clientId, driveFileId: fileId, bodyLength: body.length },
    });

    await writeActivity(tx, {
      actor,
      type: "doc",
      target: client.company,
      detail: "Drafted a client contract",
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
// the merge knows append (list) vs set-if-empty (scalar). The D40 set —
// must match the field lists in skills/enrich-company-web/SKILL.md.
const COMPANY_ENRICH_LIST_FIELDS = [
  "companyKeyFacts",
  "brandColors",
  "currentSystems",
  "painPoints",
  "keyServices",
  "competitors",
] as const;
const COMPANY_ENRICH_SCALAR_FIELDS = [
  "companySize",
  "headquarters",
  "founded",
  "website",
  "ownership",
  "description",
  "linkedinUrl",
  "instagramUrl",
  "revenueEstimate",
  "employeeCount",
  "subIndustry",
  "locations",
] as const;
// Int columns inside the scalar set — proposals arrive as strings and get
// coerced (or skipped) before the merge.
const COMPANY_ENRICH_INT_FIELDS = ["revenueEstimate", "employeeCount"] as const;
type CompanyEnrichListField = (typeof COMPANY_ENRICH_LIST_FIELDS)[number];
type CompanyEnrichScalarField = (typeof COMPANY_ENRICH_SCALAR_FIELDS)[number];
type CompanyEnrichIntField = (typeof COMPANY_ENRICH_INT_FIELDS)[number];
type CompanyEnrichField = CompanyEnrichListField | CompanyEnrichScalarField;

// "~$12.5M", "1,200 employees", "1.2B" → a whole number (CAD for revenue).
// The skill appends a "(source: …)" tag to every value — stripped first so
// "220 (source: trade-press profile)" parses. Conservative on purpose:
// anything ambiguous returns null and the addition is skipped, never guessed.
function coerceEnrichInt(raw: string): number | null {
  const cleaned = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/[$,~]/g, "")
    .replace(/\bCAD\b/gi, "")
    .replace(/\b(employees|people|staff)\b/gi, "")
    .trim();
  const m = cleaned.match(/^(\d+(?:\.\d+)?)\s*([kKmMbB])?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const mult = m[2] ? { k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase() as "k" | "m" | "b"] : 1;
  const value = Math.round(n * mult);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

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
      linkedinUrl: true,
      instagramUrl: true,
      revenueEstimate: true,
      employeeCount: true,
      subIndustry: true,
      locations: true,
      companyKeyFacts: true,
      brandColors: true,
      currentSystems: true,
      painPoints: true,
      keyServices: true,
      competitors: true,
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
    `LinkedIn: ${client.linkedinUrl || "(empty)"}`,
    `Instagram: ${client.instagramUrl || "(empty)"}`,
    `Revenue estimate (whole CAD): ${client.revenueEstimate ?? "(empty)"}`,
    `Employee count: ${client.employeeCount ?? "(empty)"}`,
    `Sub-industry: ${client.subIndustry || "(empty)"}`,
    `Locations: ${client.locations || "(empty)"}`,
    `Key facts: ${client.companyKeyFacts.length ? client.companyKeyFacts.join("; ") : "(none)"}`,
    `Brand colors: ${client.brandColors.length ? client.brandColors.join(", ") : "(none)"}`,
    `Current systems: ${client.currentSystems.length ? client.currentSystems.join("; ") : "(none)"}`,
    `Pain points: ${client.painPoints.length ? client.painPoints.join("; ") : "(none)"}`,
    `Key services: ${client.keyServices.length ? client.keyServices.join("; ") : "(none)"}`,
    `Competitors: ${client.competitors.length ? client.competitors.join("; ") : "(none)"}`,
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
      domain: true,
      ownership: true,
      description: true,
      linkedinUrl: true,
      instagramUrl: true,
      revenueEstimate: true,
      employeeCount: true,
      subIndustry: true,
      locations: true,
      companyKeyFacts: true,
      brandColors: true,
      currentSystems: true,
      painPoints: true,
      keyServices: true,
      competitors: true,
    },
  });
  if (!client) throw new Error("Client not found");

  // Non-destructive update: append new list facts (case-insensitive dedupe);
  // set scalar fields ONLY if currently empty (never overwrite — that's a
  // conflict the partner resolves by hand).
  const data: Record<string, unknown> = {};
  // Each list field appends to its own array (case-insensitive dedupe); scalars
  // set only if empty. brandColors keeps insertion order (primary first).
  const lists: Record<CompanyEnrichListField, string[]> = {
    companyKeyFacts: [...client.companyKeyFacts],
    brandColors: [...client.brandColors],
    currentSystems: [...client.currentSystems],
    painPoints: [...client.painPoints],
    keyServices: [...client.keyServices],
    competitors: [...client.competitors],
  };
  const applied: CompanyEnrichAddition[] = [];
  const skipped: CompanyEnrichAddition[] = [];

  for (const a of clean) {
    if ((COMPANY_ENRICH_LIST_FIELDS as readonly string[]).includes(a.field)) {
      const arr = lists[a.field as CompanyEnrichListField];
      const exists = arr.some((v) => v.toLowerCase() === a.value.toLowerCase());
      if (!exists) {
        arr.push(a.value);
        applied.push(a);
      } else {
        skipped.push(a);
      }
    } else if ((COMPANY_ENRICH_INT_FIELDS as readonly string[]).includes(a.field)) {
      // Int columns — coerce the proposed string; skip if it doesn't parse
      // cleanly rather than guess.
      const f = a.field as CompanyEnrichIntField;
      const parsed = coerceEnrichInt(a.value);
      if (parsed !== null && client[f] == null) {
        data[f] = parsed;
        applied.push(a);
      } else {
        skipped.push(a);
      }
    } else {
      const f = a.field as Exclude<CompanyEnrichScalarField, CompanyEnrichIntField>;
      const current = client[f];
      if (!current || !current.trim()) {
        // URL fields land as the bare value — drop the trailing source tag so
        // click-outs work and the domain derives clean (mirrors the deal path).
        const isUrlField = f === "website" || f === "linkedinUrl" || f === "instagramUrl";
        const value = isUrlField ? a.value.replace(/\s*\(.*$/, "").trim() : a.value;
        if (!value) {
          skipped.push(a);
          continue;
        }
        data[f] = value;
        applied.push(a);
        if (f === "website" && !client.domain) {
          const domain = normalizeDomain(value);
          if (domain) data.domain = domain;
        }
      } else {
        // Already set — don't overwrite. Partner resolves conflicts manually.
        skipped.push(a);
      }
    }
  }

  for (const lf of COMPANY_ENRICH_LIST_FIELDS) {
    if (lists[lf].length !== client[lf].length) data[lf] = lists[lf];
  }

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
