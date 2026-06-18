"use server";
// Home ⇄ worker control plane for the prototype-builder. Inserts the run row, hands the
// job to the Railway worker over authenticated HTTP, and exposes a read-only poll target
// (mirrors targeting/run-actions.ts) plus the approve action.
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureDealSubfolder, ensureDealDriveFolder } from "@/lib/deal-drive";
import { writeAudit, partnerActor } from "@/lib/audit";
import { assertNoNeedsInput } from "@/lib/no-hallucination";
import { pruneSession } from "@/lib/agent-session-store";
import { downloadDriveFile, fileIdFromUrl } from "@/lib/drive";

// WORKER_URL is set by hand in Vercel/Railway and is easy to paste without a scheme
// (e.g. "shiftai-ops-production.up.railway.app"), which makes fetch() throw
// "Failed to parse URL". Normalize: ensure an https:// scheme and strip any trailing
// slash so `${base}/build` is always a valid absolute URL.
function workerBase(raw: string): string {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/$/, "");
}

export async function startPrototypeBuild(dealId: string, brief: string): Promise<{ runId: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const text = brief.trim();
  if (!text) throw new Error("Approve a brief first");
  assertNoNeedsInput(text, "brief");

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, company: true, industry: true },
  });
  if (!deal) throw new Error("Deal not found");

  const { folderId } = await ensureDealSubfolder(dealId, "Prototype");

  const run = await prisma.prototypeRun.create({
    data: { status: "pending", clientName: deal.company, industry: deal.industry, dealId: deal.id, brief: text, model: process.env.PROTOTYPE_MODEL ?? null },
    select: { id: true },
  });

  const workerUrl = process.env.WORKER_URL;
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!workerUrl || !secret) {
    await prisma.prototypeRun.update({ where: { id: run.id }, data: { status: "error", error: "WORKER_URL/secret not configured", finishedAt: new Date() } });
    throw new Error("Worker not configured");
  }
  try {
    const resp = await fetch(`${workerBase(workerUrl)}/build`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ runId: run.id, dealId: deal.id, brief: text, client: deal.company, industry: deal.industry, drivePrototypeFolderId: folderId }),
    });
    if (!resp.ok) throw new Error(`worker returned ${resp.status}`);
  } catch (err) {
    await prisma.prototypeRun.update({ where: { id: run.id }, data: { status: "error", error: err instanceof Error ? err.message.slice(0, 500) : "POST failed", finishedAt: new Date() } });
    throw new Error("Could not reach the build worker");
  }
  return { runId: run.id };
}

// Deck build — the second step of the proposal chain. Reads the deal's approved SOW
// (the `scope` Artifact) + the prototype link, hands both to the SAME worker loop as
// the prototype (kind="deck"), which renders the deck and self-critiques over a few
// rounds. The deck files into the deal's 00-Pipeline root (matches the deck's prior
// home), so we pass that folder id. Mirrors startPrototypeBuild's row-then-POST shape.
export async function startDeckBuild(dealId: string, input: { focus: string }): Promise<{ runId: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const focus = input.focus.trim();
  if (!focus) throw new Error("Tell the deck what to emphasize");

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, company: true, industry: true },
  });
  if (!deal) throw new Error("Deal not found");

  // The deck is built FROM the approved scope of work. Require one first.
  const sow = await prisma.artifact.findFirst({
    where: { dealId, generatedFromSkill: "scope" },
    orderBy: { createdAt: "desc" },
    select: { driveUrl: true },
  });
  if (!sow?.driveUrl) throw new Error("Draft the scope of work first — the deck is built from it.");
  const sowFileId = fileIdFromUrl(sow.driveUrl);
  if (!sowFileId) throw new Error("Could not locate the scope-of-work file in Drive.");
  let sowText: string;
  try {
    sowText = (await downloadDriveFile(sowFileId)).toString("utf8").trim();
  } catch {
    throw new Error("Could not read the scope of work from Drive.");
  }
  if (!sowText) throw new Error("The scope of work is empty — redraft it before building the deck.");
  // The SOW was [NEEDS INPUT]-gated at save, so this is belt-and-suspenders.
  assertNoNeedsInput(sowText, "scope of work");

  // Link the prototype the deck demos. The UI gates this action on a prototype
  // existing; this is the server-side guard.
  const proto = await prisma.artifact.findFirst({
    where: { dealId, generatedFromSkill: { in: ["prototype-builder", "html-prototype"] } },
    orderBy: { createdAt: "desc" },
    select: { driveUrl: true },
  });
  if (!proto?.driveUrl) throw new Error("Build a prototype first — the deck links to it.");

  // The worker's generic `brief` carries the deck's full source: the approved SOW,
  // the prototype URL, and the partner's emphasis. The proposal-deck skill renders it.
  const brief = [
    "## What to emphasize",
    focus,
    "",
    `PROTOTYPE_URL: ${proto.driveUrl}`,
    "",
    "## Approved scope of work (render this into the deck — do not invent beyond it)",
    sowText,
  ].join("\n");

  // The deck files into the deal's 00-Pipeline working folder (root), created on first use.
  const { folderId } = await ensureDealDriveFolder(dealId);

  const run = await prisma.prototypeRun.create({
    data: { status: "pending", kind: "deck", clientName: deal.company, industry: deal.industry, dealId: deal.id, brief, model: process.env.PROTOTYPE_MODEL ?? null },
    select: { id: true },
  });

  const workerUrl = process.env.WORKER_URL;
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!workerUrl || !secret) {
    await prisma.prototypeRun.update({ where: { id: run.id }, data: { status: "error", error: "WORKER_URL/secret not configured", finishedAt: new Date() } });
    throw new Error("Worker not configured");
  }
  try {
    const resp = await fetch(`${workerBase(workerUrl)}/build`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ runId: run.id, dealId: deal.id, kind: "deck", brief, client: deal.company, industry: deal.industry, drivePrototypeFolderId: folderId }),
    });
    if (!resp.ok) throw new Error(`worker returned ${resp.status}`);
  } catch (err) {
    await prisma.prototypeRun.update({ where: { id: run.id }, data: { status: "error", error: err instanceof Error ? err.message.slice(0, 500) : "POST failed", finishedAt: new Date() } });
    throw new Error("Could not reach the build worker");
  }
  return { runId: run.id };
}

export async function getPrototypeRunStatus(runId: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const run = await prisma.prototypeRun.findUnique({
    where: { id: runId },
    select: {
      status: true, rounds: true, finalScore: true, finalHtmlUrl: true, artifactId: true, error: true, refineUsed: true,
      iterations: { orderBy: { round: "asc" }, select: { round: true, score: true, critique: true, screenshotUrl: true, htmlUrl: true, partnerComment: true } },
    },
  });
  return run;
}

// The single partner-refine pass: leaves ONE partner comment that resumes the run's own
// agent session for exactly one more directed round. Blank notes skip this and go straight
// to Approve. Reverts status on POST failure; the worker flips refineUsed once it lands.
export async function refinePrototype(runId: string, comment: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const text = comment.trim();
  if (!text) throw new Error("Leave a comment to refine, or approve as-is");

  const run = await prisma.prototypeRun.findUnique({ where: { id: runId }, select: { refineUsed: true, status: true } });
  if (!run) throw new Error("Run not found");
  if (run.refineUsed) throw new Error("This prototype has already been refined once");
  if (run.status !== "done") throw new Error("Refine is only available once the build is done");

  const workerUrl = process.env.WORKER_URL;
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!workerUrl || !secret) throw new Error("Worker not configured");

  await prisma.prototypeRun.update({ where: { id: runId }, data: { status: "refining" } });
  try {
    const resp = await fetch(`${workerBase(workerUrl)}/refine`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ runId, comment: text }),
    });
    if (!resp.ok) throw new Error(`worker returned ${resp.status}`);
  } catch (err) {
    // Couldn't hand off — put the run back to done so the partner can retry or approve.
    await prisma.prototypeRun.update({ where: { id: runId }, data: { status: "done" } });
    throw new Error(err instanceof Error && err.message.startsWith("worker returned") ? err.message : "Could not reach the build worker");
  }
  return { ok: true };
}

export async function approvePrototype(runId: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);
  const run = await prisma.prototypeRun.findUnique({ where: { id: runId }, select: { artifactId: true, dealId: true, sessionId: true, kind: true } });
  if (!run?.artifactId) throw new Error("No artifact to approve yet");
  await prisma.$transaction(async (tx) => {
    await tx.artifact.update({ where: { id: run.artifactId! }, data: { reviewStatus: "approved" } });
    await writeAudit(tx, { actor, action: `approve.artifact.${run.kind}`, targetType: "Artifact", targetId: run.artifactId!, changes: { runId } });
  });
  // The session is no longer needed once the run is approved — best-effort cleanup.
  if (run.sessionId) await pruneSession(run.sessionId);
  return { ok: true };
}
