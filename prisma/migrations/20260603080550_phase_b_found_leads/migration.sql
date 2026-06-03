-- CreateEnum
CREATE TYPE "ProspectLeadStatus" AS ENUM ('pending', 'added', 'ghost');

-- CreateEnum
CREATE TYPE "LeadRunStatus" AS ENUM ('running', 'done', 'error');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "domain" TEXT;

-- CreateTable
CREATE TABLE "ProspectLead" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "website" TEXT,
    "industryTags" TEXT[],
    "revenueEstimate" INTEGER,
    "employeeEstimate" INTEGER,
    "headquarters" TEXT,
    "segmentId" TEXT,
    "score" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "disqualified" BOOLEAN NOT NULL DEFAULT false,
    "status" "ProspectLeadStatus" NOT NULL DEFAULT 'pending',
    "people" JSONB NOT NULL DEFAULT '[]',
    "foundBy" TEXT[],
    "sources" JSONB,
    "createdBy" TEXT NOT NULL DEFAULT 'AGENT · CLAUDE',
    "generatedFromSkill" TEXT,
    "convertedContactId" TEXT,
    "convertedDealId" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadRun" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT,
    "status" "LeadRunStatus" NOT NULL DEFAULT 'running',
    "evaluatedCount" INTEGER NOT NULL DEFAULT 0,
    "foundCount" INTEGER NOT NULL DEFAULT 0,
    "ghostCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL DEFAULT 'AGENT · CLAUDE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "LeadRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProspectLead_domain_key" ON "ProspectLead"("domain");

-- CreateIndex
CREATE INDEX "ProspectLead_status_score_idx" ON "ProspectLead"("status", "score");

-- CreateIndex
CREATE INDEX "ProspectLead_segmentId_idx" ON "ProspectLead"("segmentId");

-- CreateIndex
CREATE INDEX "LeadRun_segmentId_startedAt_idx" ON "LeadRun"("segmentId", "startedAt");

-- AddForeignKey
ALTER TABLE "ProspectLead" ADD CONSTRAINT "ProspectLead_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "TargetSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadRun" ADD CONSTRAINT "LeadRun_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "TargetSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
