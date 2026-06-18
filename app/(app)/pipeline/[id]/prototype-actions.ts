"use server";
// Home ⇄ worker control plane for the prototype-builder. Inserts the run row, hands the
// job to the Railway worker over authenticated HTTP, and exposes a read-only poll target
// (mirrors targeting/run-actions.ts) plus the approve action.
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureDealSubfolder } from "@/lib/deal-drive";
import { writeAudit, partnerActor } from "@/lib/audit";
import { assertNoNeedsInput } from "@/lib/no-hallucination";
import { pruneSession } from "@/lib/agent-session-store";

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
  const run = await prisma.prototypeRun.findUnique({ where: { id: runId }, select: { artifactId: true, dealId: true, sessionId: true } });
  if (!run?.artifactId) throw new Error("No artifact to approve yet");
  await prisma.$transaction(async (tx) => {
    await tx.artifact.update({ where: { id: run.artifactId! }, data: { reviewStatus: "approved" } });
    await writeAudit(tx, { actor, action: "approve.artifact.prototype", targetType: "Artifact", targetId: run.artifactId!, changes: { runId } });
  });
  // The session is no longer needed once the run is approved — best-effort cleanup.
  if (run.sessionId) await pruneSession(run.sessionId);
  return { ok: true };
}
