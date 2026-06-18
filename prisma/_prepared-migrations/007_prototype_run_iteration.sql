-- 007 — Prototype builder persistence (Phase B)
-- PREPARED, NOT APPLIED. Needs Jason's approval before it runs — the local .env
-- DATABASE_URL points at the one shared Supabase that also backs production.
--
-- Independent of 001–006 (the industries/task-board batch): this adds two NEW
-- tables + one enum for the prototype-builder worker (worker/). Purely additive —
-- no column drops, no data backfill, nothing touches existing rows. The matching
-- edits are already in prisma/schema.prisma (models PrototypeRun, PrototypeIteration,
-- enum PrototypeRunStatus) and the Prisma client has been regenerated against them.
--
-- Generated with:
--   prisma migrate diff --from-schema <pre-change schema> --to-schema prisma/schema.prisma --script
--
-- Apply (recommended): `npx prisma migrate dev --name add_prototype_run_iteration`
-- with the local Direct URL — Prisma will emit exactly this SQL (001–006 are
-- already applied) and write the _prisma_migrations ledger. Or paste this file
-- into the Supabase SQL editor as a manual fallback (leaves the ledger out of sync).

-- CreateEnum
CREATE TYPE "PrototypeRunStatus" AS ENUM ('pending', 'running', 'done', 'error');

-- CreateTable
CREATE TABLE "PrototypeRun" (
    "id" TEXT NOT NULL,
    "status" "PrototypeRunStatus" NOT NULL DEFAULT 'running',
    "clientName" TEXT NOT NULL,
    "industry" TEXT,
    "sessionId" TEXT,
    "model" TEXT,
    "brief" TEXT,
    "artifactId" TEXT,
    "rounds" INTEGER NOT NULL DEFAULT 0,
    "finalScore" INTEGER,
    "finalHtmlUrl" TEXT,
    "error" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'AGENT · CLAUDE',
    "dealId" TEXT,
    "clientId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PrototypeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrototypeIteration" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "htmlUrl" TEXT,
    "screenshotUrl" TEXT,
    "critique" TEXT,
    "score" INTEGER,
    "structure" INTEGER,
    "fidelity" INTEGER,
    "design" INTEGER,
    "interactivity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrototypeIteration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrototypeRun_dealId_startedAt_idx" ON "PrototypeRun"("dealId", "startedAt");

-- CreateIndex
CREATE INDEX "PrototypeRun_clientId_startedAt_idx" ON "PrototypeRun"("clientId", "startedAt");

-- CreateIndex
CREATE INDEX "PrototypeRun_status_startedAt_idx" ON "PrototypeRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "PrototypeIteration_runId_round_idx" ON "PrototypeIteration"("runId", "round");

-- AddForeignKey
ALTER TABLE "PrototypeRun" ADD CONSTRAINT "PrototypeRun_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrototypeRun" ADD CONSTRAINT "PrototypeRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrototypeIteration" ADD CONSTRAINT "PrototypeIteration_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PrototypeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

