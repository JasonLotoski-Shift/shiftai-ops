"use server";

// Proposal engine — the heavy generative step at the Proposal stage.
//
// Two products, each its own server action:
//   1. HTML PROTOTYPE — a chained "multi-agent" workflow: brief (Sonnet) →
//      spec (Sonnet) → build (Opus). Each step's output feeds the next intake.
//      Produces ONE self-contained .html showing how Shift would solve the
//      client's problem.
//   2. PROPOSAL DECK — one Opus call producing a single-file HTML deck
//      (project, scope, timeline, deliverables, price) that links the prototype
//      via a "Demo prototype" button.
//
// Both follow the canonical recipe: generate* (read + generate, returns the
// editable HTML draft) → save* (Drive upload via uploadFile → Artifact +
// AuditLog + Activity, one transaction). assertNoNeedsInput gates the save;
// HTML skills emit the marker as visible on-page text (never an HTML comment).
//
// NOTE: the Opus build can take 60–120s. The route sets maxDuration (see
// pipeline/[id]/page.tsx); on a constrained host this chain may need a higher
// function timeout (Vercel Pro).

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/drive";
import { ensureDealDriveFolder } from "@/lib/deal-drive";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { assertNoNeedsInput } from "@/lib/no-hallucination";
import { generate } from "@/lib/ai";
import { buildDealContext } from "@/lib/deal-context";
import { loadScreenshotImages } from "@/lib/ingest-uploads";
import type { ArtifactType } from "@/lib/generated/prisma/enums";

const BUILD_MODEL = "claude-opus-4-8";

// Models often wrap HTML in a ```html … ``` fence — strip it so the saved file
// is a clean document.
function stripCodeFence(s: string): string {
  const t = s.trim();
  const m = t.match(/^```(?:html)?\s*\n([\s\S]*?)\n```$/);
  return (m ? m[1] : t).trim();
}

// ── 1. Prototype — chained brief → spec → build ──
export async function generatePrototype(
  dealId: string,
  input: { focus: string },
): Promise<{ html: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const focus = input.focus.trim();
  if (!focus) throw new Error("Tell the engine what problem to prototype");

  const { context } = await buildDealContext(dealId);

  // Screenshots the prospect shared via Ingest (their current tool/spreadsheet)
  // ground the prototype in what they actually use today — pass them to vision on
  // the framing step and the build step.
  const images = await loadScreenshotImages({ dealId });
  const withImages = images.length ? images : undefined;

  // Step 1 — frame the problem (fast, Sonnet).
  const brief = await generate({
    skill: "prototype-brief",
    context,
    intake: `## What to prototype\n${focus}`,
    maxTokens: 1500,
    images: withImages,
  });

  // Step 2 — turn the brief into a concrete build spec (fast, Sonnet).
  const spec = await generate({
    skill: "prototype-spec",
    context,
    intake: `## Problem brief\n${brief}`,
    maxTokens: 2500,
  });

  // Step 3 — build the single-file HTML (Opus; the long, high-stakes step).
  const html = await generate({
    skill: "html-prototype",
    context,
    intake: `## Build spec\n${spec}`,
    model: BUILD_MODEL,
    maxTokens: 16000,
    images: withImages,
  });

  return { html: stripCodeFence(html) };
}

// ── 2. Proposal deck — one Opus call, links the prototype ──
export async function generateProposalDeck(
  dealId: string,
  input: { focus: string },
): Promise<{ html: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const focus = input.focus.trim();
  if (!focus) throw new Error("Tell the engine what to emphasize in the deck");

  const { context } = await buildDealContext(dealId);

  // Link the most recent prototype for this deal; if none, force the partner to
  // build one first (the gate flags it).
  const proto = await prisma.artifact.findFirst({
    where: { dealId, generatedFromSkill: "html-prototype" },
    orderBy: { createdAt: "desc" },
    select: { driveUrl: true },
  });
  const prototypeUrl = proto?.driveUrl ?? "[NEEDS INPUT: prototype link — build the prototype first]";

  const intake = [
    "## This proposal deck",
    `Focus / what to emphasize: ${focus}`,
    `PROTOTYPE_URL: ${prototypeUrl}`,
  ].join("\n");

  const html = await generate({
    skill: "proposal-deck",
    context,
    intake,
    model: BUILD_MODEL,
    maxTokens: 16000,
  });

  return { html: stripCodeFence(html) };
}

// ── Shared HTML save — Drive upload + Artifact + AuditLog + Activity ──
const HTML_ARTIFACTS = {
  "html-prototype": { type: "other", label: "Prototype", fileSuffix: "prototype" },
  "proposal-deck": { type: "deck", label: "Proposal deck", fileSuffix: "proposal-deck" },
} as const;
type HtmlArtifactSkill = keyof typeof HTML_ARTIFACTS;

async function saveHtml(skill: HtmlArtifactSkill, dealId: string, htmlRaw: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);
  const cfg = HTML_ARTIFACTS[skill];

  const html = stripCodeFence(htmlRaw);
  if (!html) throw new Error(`${cfg.label} HTML is required`);
  assertNoNeedsInput(html, cfg.label.toLowerCase());

  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, company: true } });
  if (!deal) throw new Error("Deal not found");

  // File into the deal's own 00-Pipeline working folder (created on first use).
  const { folderId } = await ensureDealDriveFolder(dealId);

  const today = new Date().toISOString().slice(0, 10);
  const fileName = `${today}-${deal.company.replace(/\s+/g, "-")}-${cfg.fileSuffix}.html`;
  const { fileId, webViewLink } = await uploadFile(html, fileName, folderId, "text/html");

  const artifact = await prisma.$transaction(async (tx) => {
    const created = await tx.artifact.create({
      data: {
        type: cfg.type as ArtifactType,
        title: `${cfg.label} · ${deal.company} · ${today}`,
        driveUrl: webViewLink,
        fileName,
        createdBy: partnerLabel,
        generatedFromSkill: skill,
        reviewStatus: "draft",
        dealId: deal.id,
      },
    });
    await writeAudit(tx, {
      actor,
      action: "create.artifact.html.draft",
      targetType: "Artifact",
      targetId: created.id,
      changes: { dealId, skill, driveFileId: fileId, bytes: html.length },
    });
    await writeActivity(tx, {
      actor,
      type: "doc",
      target: deal.company,
      detail: `Built ${cfg.label.toLowerCase()} — awaiting review`,
      link: `/pipeline/${dealId}`,
    });
    return created;
  });

  revalidatePath(`/pipeline/${dealId}`);
  return { artifactId: artifact.id, driveUrl: webViewLink };
}

export async function savePrototype(dealId: string, input: { html: string }) {
  return saveHtml("html-prototype", dealId, input.html);
}

export async function saveProposalDeck(dealId: string, input: { html: string }) {
  return saveHtml("proposal-deck", dealId, input.html);
}
