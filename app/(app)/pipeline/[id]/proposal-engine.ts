"use server";

// Proposal engine — the heavy generative step at the Proposal stage.
//
// Two products, each its own server action(s):
//   1. HTML PROTOTYPE — a two-stage workflow with a partner review gate:
//        Stage 1 (brief): a Stage 0 kickoff picks the target from the discovery
//          report + discussion notes, then a three-stage chain (interpret&diverge
//          -> red-team -> commit) writes the reviewable brief.
//        Stage 2 (build): an isolated Opus call turns the approved brief into ONE
//          self-contained, multi-tab interactive .html. No Drive I/O competing
//          for wall-clock, so each stage stays under the function timeout.
//   2. PROPOSAL DECK — one Opus call producing a single-file HTML deck that links
//      the prototype via a "Demo prototype" button.
//
// All saves follow the canonical recipe: Drive upload via uploadFile → Artifact +
// AuditLog + Activity, one transaction. assertNoNeedsInput gates the save; HTML
// skills emit the marker as visible on-page text (never an HTML comment).
//
// NOTE: the Opus build can take 60–120s. The route sets maxDuration (see
// pipeline/[id]/page.tsx); on a constrained host this may need a higher function
// timeout (Vercel Pro).

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/drive";
import { ensureDealDriveFolder, ensureDealSubfolder } from "@/lib/deal-drive";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { assertNoNeedsInput } from "@/lib/no-hallucination";
import { generate } from "@/lib/ai";
import { buildDealContext } from "@/lib/deal-context";
import { loadDealDriveFiles, type DealDriveManifestEntry } from "@/lib/deal-drive-context";
import { runBriefChain } from "@/lib/prototype-brief/chain";
import type { KickoffSeed } from "@/lib/prototype-brief/types";
import type { ArtifactType } from "@/lib/generated/prisma/enums";

const BUILD_MODEL = "claude-opus-4-8";
const PROTOTYPE_SUBFOLDER = "Prototype";

// Models often wrap HTML in a ```html … ``` fence — strip it so the saved file
// is a clean document.
function stripCodeFence(s: string): string {
  const t = s.trim();
  const m = t.match(/^```(?:html)?\s*\n([\s\S]*?)\n```$/);
  return (m ? m[1] : t).trim();
}

// ── 1a. Prototype brief — staged engine: Stage 1->2->3 over the deal corpus ──
// Stage 0 (proposePrototypeKickoff) runs first in the UI and hands back the seed.
export async function generatePrototypeBrief(
  dealId: string,
  input: { seed: KickoffSeed },
): Promise<{ brief: string; manifest: DealDriveManifestEntry[] }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  if (!input.seed?.candidate?.title) throw new Error("Confirm a prototype target first");

  const { context } = await buildDealContext(dealId);
  const corpus = await loadDealDriveFiles(dealId);

  const brief = await runBriefChain({
    context,
    corpusText: corpus.text,
    images: corpus.images.length ? corpus.images : undefined,
    seed: input.seed,
    gen: generate,
  });

  return { brief: brief.trim(), manifest: corpus.manifest };
}

export async function savePrototypeBrief(
  dealId: string,
  input: { brief: string },
): Promise<{ artifactId: string; driveUrl: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const brief = input.brief.trim();
  if (!brief) throw new Error("Brief is required");
  assertNoNeedsInput(brief, "prototype brief");

  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, company: true } });
  if (!deal) throw new Error("Deal not found");

  const { folderId } = await ensureDealSubfolder(dealId, PROTOTYPE_SUBFOLDER);
  const today = new Date().toISOString().slice(0, 10);
  const fileName = `${today}-${deal.company.replace(/\s+/g, "-")}-prototype-brief.md`;
  const { fileId, webViewLink } = await uploadFile(brief, fileName, folderId, "text/markdown");

  const artifact = await prisma.$transaction(async (tx) => {
    const created = await tx.artifact.create({
      data: {
        type: "other" as ArtifactType,
        title: `Prototype brief · ${deal.company} · ${today}`,
        driveUrl: webViewLink,
        fileName,
        createdBy: partnerLabel,
        generatedFromSkill: "prototype-brief",
        reviewStatus: "draft",
        dealId: deal.id,
      },
    });
    await writeAudit(tx, {
      actor,
      action: "create.artifact.brief.draft",
      targetType: "Artifact",
      targetId: created.id,
      changes: { dealId, skill: "prototype-brief", driveFileId: fileId, bytes: brief.length },
    });
    await writeActivity(tx, {
      actor,
      type: "doc",
      target: deal.company,
      detail: "Wrote prototype brief — ready to build",
      link: `/pipeline/${dealId}`,
    });
    return created;
  });

  revalidatePath(`/pipeline/${dealId}`);
  return { artifactId: artifact.id, driveUrl: webViewLink };
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
// `subfolder` files the artifact into a named subfolder of the deal folder
// (prototypes → Prototype/); undefined keeps it in the deal's 00-Pipeline root
// (the deck's existing behavior — don't change it).
const HTML_ARTIFACTS = {
  "html-prototype": { type: "other", label: "Prototype", fileSuffix: "prototype", subfolder: PROTOTYPE_SUBFOLDER },
  "proposal-deck": { type: "deck", label: "Proposal deck", fileSuffix: "proposal-deck", subfolder: undefined },
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

  // File into the deal's Prototype/ subfolder (prototype) or its 00-Pipeline
  // working folder (deck) — both created on first use.
  const { folderId } = cfg.subfolder
    ? await ensureDealSubfolder(dealId, cfg.subfolder)
    : await ensureDealDriveFolder(dealId);

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

export async function saveProposalDeck(dealId: string, input: { html: string }) {
  return saveHtml("proposal-deck", dealId, input.html);
}
