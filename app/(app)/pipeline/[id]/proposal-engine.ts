"use server";

// Proposal engine — the prototype-brief step at the Proposal stage.
//
// The prototype is a two-stage workflow with a partner review gate:
//   Stage 1 (brief): a Stage 0 kickoff picks the target from the discovery report +
//     discussion notes, then a three-stage chain (interpret&diverge -> red-team ->
//     commit) writes the reviewable brief.
//   Stage 2 (build): the brief is handed to the always-on worker loop (see
//     prototype-actions.startPrototypeBuild) which builds + self-critiques the .html.
//
// The PROPOSAL DECK no longer lives here: it became its own worker-loop build
// (kind="deck") that renders the approved SOW + links the prototype. Kick it off via
// prototype-actions.startDeckBuild; the worker persists it (Artifact + AuditLog + Activity).
//
// The brief save follows the canonical recipe: Drive upload via uploadFile → Artifact +
// AuditLog + Activity, one transaction. assertNoNeedsInput gates the save.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { uploadFile } from "@/lib/drive";
import { ensureDealSubfolder } from "@/lib/deal-drive";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { assertNoNeedsInput } from "@/lib/no-hallucination";
import { generate } from "@/lib/ai";
import { buildDealContext } from "@/lib/deal-context";
import { loadDealDriveFiles, type DealDriveManifestEntry } from "@/lib/deal-drive-context";
import { runBriefChain } from "@/lib/prototype-brief/chain";
import type { KickoffSeed } from "@/lib/prototype-brief/types";
import type { ArtifactType } from "@/lib/generated/prisma/enums";

const PROTOTYPE_SUBFOLDER = "Prototype";

// ── Prototype brief — staged engine: Stage 1->2->3 over the deal corpus ──
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
