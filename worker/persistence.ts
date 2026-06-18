// PERSISTENCE — writes a PrototypeRun + one PrototypeIteration per round, and uploads
// each round's HTML + screenshot to Supabase Storage (URLs in the rows, never blobs in
// Postgres). The worker is plain Node, so it writes rows DIRECTLY via lib/prisma — no
// server action, no revalidatePath, no server-only imports.
//
// Everything here is best-effort: if the DATABASE_URL tables don't exist yet (the
// migration is prepared but unapplied — needs Jason's approval) or Storage is unset,
// it logs and no-ops so the build loop still completes. Configured = rows + URLs.
import path from "node:path";
import { prisma } from "../lib/prisma";
import { uploadFileAt } from "./storage";
import { uploadFile } from "../lib/drive";
import { writeAudit, writeActivity, agentActor } from "../lib/audit";
import type { GateRecord } from "./tools/gate";
import type { BuildKind } from "./config";

// Per-kind Artifact shape — how each build kind files its final deliverable
// (Drive file name + the Artifact row's type/skill/title + the audit/activity copy).
const ARTIFACT_CFG: Record<
  BuildKind,
  { type: "other" | "deck"; label: string; fileSuffix: string; skill: string; createdBy: string; auditAction: string; activityDetail: string }
> = {
  prototype: {
    type: "other",
    label: "Prototype",
    fileSuffix: "prototype",
    skill: "prototype-builder",
    createdBy: "AGENT · PROTOTYPE-BUILDER",
    auditAction: "create.artifact.prototype.draft",
    activityDetail: "Built an interactive prototype — awaiting review",
  },
  deck: {
    type: "deck",
    label: "Proposal deck",
    fileSuffix: "proposal-deck",
    skill: "proposal-deck",
    createdBy: "AGENT · PROPOSAL-DECK",
    auditAction: "create.artifact.deck.draft",
    activityDetail: "Built a proposal deck — awaiting review",
  },
};

export type RunInit = {
  kind?: BuildKind;
  clientName: string;
  industry?: string;
  model?: string;
  dealId?: string;
  clientId?: string;
  brief?: string;
};

export type RunFinish = {
  status: "done" | "error";
  rounds: number;
  finalScore: number | null;
  finalHtmlPath?: string; // local path to the final prototype.html
  error?: string;
};

export type PrototypeRecorder = {
  runId: string | null;
  setSession: (sessionId: string) => Promise<void>;
  recordIteration: (rec: GateRecord, partnerComment?: string | null) => Promise<void>;
  finish: (f: RunFinish) => Promise<void>;
  recordArtifact: (input: { kind: BuildKind; dealId: string; company: string; folderId: string; htmlPath: string }) => Promise<void>;
};

// Create the PrototypeRun row (status=running). Returns a recorder whose methods
// no-op when the row couldn't be created (tables missing / DB down) so the caller
// never has to branch on persistence being available.
export async function createPrototypeRun(
  init: RunInit,
  opts: { existingRunId?: string } = {},
): Promise<PrototypeRecorder> {
  let runId: string | null = null;
  try {
    if (opts.existingRunId) {
      // Home pre-inserted a pending row — attach to it and flip to running.
      const run = await prisma.prototypeRun.update({
        where: { id: opts.existingRunId },
        data: { status: "running", model: init.model ?? undefined },
        select: { id: true },
      });
      runId = run.id;
      console.log(`[persistence] PrototypeRun ${runId} attached (status=running)`);
    } else {
      const run = await prisma.prototypeRun.create({
        data: {
          status: "running",
          kind: init.kind ?? "prototype",
          clientName: init.clientName,
          industry: init.industry ?? null,
          model: init.model ?? null,
          dealId: init.dealId ?? null,
          clientId: init.clientId ?? null,
          brief: init.brief ?? null,
        },
        select: { id: true },
      });
      runId = run.id;
      console.log(`[persistence] PrototypeRun ${runId} created (status=running)`);
    }
  } catch (err) {
    console.warn(
      "[persistence] could not open PrototypeRun (tables may be unmigrated — see prisma/_prepared-migrations/007). Continuing without persistence:",
      err instanceof Error ? err.message : err,
    );
  }

  return {
    get runId() {
      return runId;
    },

    async setSession(sessionId: string) {
      if (!runId) return;
      try {
        await prisma.prototypeRun.update({ where: { id: runId }, data: { sessionId } });
      } catch (err) {
        console.warn("[persistence] setSession failed:", err instanceof Error ? err.message : err);
      }
    },

    async recordIteration(rec: GateRecord, partnerComment?: string | null) {
      if (!runId) return;
      const base = `${runId}/round-${rec.round}`;
      // Upload the round's artifacts first; store whatever URLs we got (null on miss).
      const screenshotUrl = rec.screenshotPath
        ? await uploadFileAt(`${base}.jpg`, rec.screenshotPath, "image/jpeg")
        : null;
      const htmlUrl = rec.htmlPath
        ? await uploadFileAt(`${base}.html`, rec.htmlPath, "text/html")
        : null;

      const critique = [rec.summary, ...(rec.remainingIssues ?? [])]
        .filter(Boolean)
        .join(" · ");

      try {
        await prisma.prototypeIteration.create({
          data: {
            runId,
            round: rec.round,
            partnerComment: partnerComment ?? null,
            htmlUrl,
            screenshotUrl,
            critique: critique || null,
            score: rec.overall,
            // Named sub-score columns are prototype-shaped; a kind only fills the
            // dimensions in its rubric (deck fills `design`, leaves the rest null).
            structure: rec.scores.structure ?? null,
            fidelity: rec.scores.fidelity ?? null,
            design: rec.scores.design ?? null,
            interactivity: rec.scores.interactivity ?? null,
          },
        });
      } catch (err) {
        console.warn(
          `[persistence] recordIteration round ${rec.round} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    },

    async finish(f: RunFinish) {
      if (!runId) return;
      let finalHtmlUrl: string | null = null;
      if (f.finalHtmlPath) {
        finalHtmlUrl = await uploadFileAt(
          `${runId}/${path.basename(f.finalHtmlPath)}`,
          f.finalHtmlPath,
          "text/html",
        );
      }
      try {
        await prisma.prototypeRun.update({
          where: { id: runId },
          data: {
            status: f.status,
            rounds: f.rounds,
            finalScore: f.finalScore,
            finalHtmlUrl,
            error: f.error ? f.error.slice(0, 500) : null,
            finishedAt: new Date(),
          },
        });
        console.log(`[persistence] PrototypeRun ${runId} finished (status=${f.status})`);
      } catch (err) {
        console.warn("[persistence] finish failed:", err instanceof Error ? err.message : err);
      }
    },

    async recordArtifact(input: {
      kind: BuildKind;
      dealId: string;
      company: string;
      folderId: string;
      htmlPath: string;
    }) {
      if (!runId) return;
      const cfg = ARTIFACT_CFG[input.kind];
      let html: string;
      try {
        html = require("node:fs").readFileSync(input.htmlPath, "utf8");
      } catch (err) {
        console.warn("[persistence] recordArtifact: could not read final HTML:", err);
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const slug = input.company.replace(/\s+/g, "-");
      const fileName = `${today}-${slug}-${cfg.fileSuffix}.html`;
      let webViewLink: string;
      try {
        ({ webViewLink } = await uploadFile(html, fileName, input.folderId, "text/html"));
      } catch (err) {
        console.warn("[persistence] recordArtifact: Drive upload failed:", err);
        return;
      }
      const actor = agentActor(cfg.skill);
      // Match the firm convention (CLAUDE.md persistence recipe) + the actorLabel
      // that resolveActor stamps on this same transaction's AuditLog/Activity rows
      // (`AGENT · <SKILL>`), so the artifact card/feed shows a consistent author.
      const createdBy = cfg.createdBy;
      try {
        const artifact = await prisma.$transaction(async (tx) => {
          const created = await tx.artifact.create({
            data: {
              type: cfg.type,
              title: `${cfg.label} · ${input.company} · ${today}`,
              driveUrl: webViewLink,
              fileName,
              createdBy,
              generatedFromSkill: cfg.skill,
              reviewStatus: "draft",
              dealId: input.dealId,
            },
          });
          await writeAudit(tx, {
            actor,
            action: cfg.auditAction,
            targetType: "Artifact",
            targetId: created.id,
            changes: { dealId: input.dealId, runId, fileName, kind: input.kind },
          });
          await writeActivity(tx, {
            actor,
            type: "ai",
            target: input.company,
            detail: cfg.activityDetail,
            link: `/pipeline/${input.dealId}`,
          });
          return created;
        });
        await prisma.prototypeRun.update({ where: { id: runId }, data: { artifactId: artifact.id } });
        console.log(`[persistence] Artifact ${artifact.id} written for run ${runId} (${input.kind})`);
      } catch (err) {
        console.warn("[persistence] recordArtifact: DB write failed:", err instanceof Error ? err.message : err);
      }
    },
  };
}
