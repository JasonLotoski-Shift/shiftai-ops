-- CreateEnum
CREATE TYPE "ImportContactCompleteness" AS ENUM ('complete', 'needs_identification');

-- CreateEnum
CREATE TYPE "ImportLeadType" AS ENUM ('decision_maker', 'connector', 'none');

-- CreateEnum
CREATE TYPE "ImportScanStatus" AS ENUM ('pending', 'scored', 'skipped', 'error');

-- CreateEnum
CREATE TYPE "ScanRunStatus" AS ENUM ('pending', 'submitted', 'scoring', 'done', 'error');

-- CreateEnum
CREATE TYPE "ImportContactPromotion" AS ENUM ('none', 'promoted');

-- CreateEnum
CREATE TYPE "ProspectLeadOrigin" AS ENUM ('discovery', 'imported');

-- AlterTable
ALTER TABLE "ProspectLead" ADD COLUMN     "origin" "ProspectLeadOrigin" NOT NULL DEFAULT 'discovery',
ADD COLUMN     "promotedBy" TEXT;

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "partnerLeadId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "columnMapping" JSONB,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "needsIdCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportedContact" (
    "id" TEXT NOT NULL,
    "partnerLeadId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "linkedin" TEXT,
    "domain" TEXT,
    "raw" JSONB NOT NULL,
    "completeness" "ImportContactCompleteness" NOT NULL DEFAULT 'complete',
    "dedupeKey" TEXT NOT NULL,
    "scanStatus" "ImportScanStatus" NOT NULL DEFAULT 'pending',
    "scanScore" INTEGER,
    "leadType" "ImportLeadType",
    "matchedSegmentId" TEXT,
    "scanRationale" TEXT,
    "scannedAt" TIMESTAMP(3),
    "promotion" "ImportContactPromotion" NOT NULL DEFAULT 'none',
    "promotedProspectLeadId" TEXT,
    "promotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportedContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanRun" (
    "id" TEXT NOT NULL,
    "partnerLeadId" TEXT NOT NULL,
    "batchId" TEXT,
    "status" "ScanRunStatus" NOT NULL DEFAULT 'pending',
    "batchApiId" TEXT,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "scoredCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "segmentScope" TEXT[],
    "createdBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ScanRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportBatch_partnerLeadId_createdAt_idx" ON "ImportBatch"("partnerLeadId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportedContact_partnerLeadId_scanStatus_scanScore_idx" ON "ImportedContact"("partnerLeadId", "scanStatus", "scanScore");

-- CreateIndex
CREATE INDEX "ImportedContact_batchId_idx" ON "ImportedContact"("batchId");

-- CreateIndex
CREATE INDEX "ImportedContact_matchedSegmentId_idx" ON "ImportedContact"("matchedSegmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportedContact_partnerLeadId_dedupeKey_key" ON "ImportedContact"("partnerLeadId", "dedupeKey");

-- CreateIndex
CREATE INDEX "ScanRun_partnerLeadId_startedAt_idx" ON "ScanRun"("partnerLeadId", "startedAt");

-- CreateIndex
CREATE INDEX "ProspectLead_origin_status_score_idx" ON "ProspectLead"("origin", "status", "score");

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_partnerLeadId_fkey" FOREIGN KEY ("partnerLeadId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedContact" ADD CONSTRAINT "ImportedContact_partnerLeadId_fkey" FOREIGN KEY ("partnerLeadId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportedContact" ADD CONSTRAINT "ImportedContact_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanRun" ADD CONSTRAINT "ScanRun_partnerLeadId_fkey" FOREIGN KEY ("partnerLeadId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanRun" ADD CONSTRAINT "ScanRun_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
