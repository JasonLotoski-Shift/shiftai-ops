-- CreateEnum
CREATE TYPE "IngestSource" AS ENUM ('paste', 'fireflies');

-- CreateEnum
CREATE TYPE "IngestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "IngestProposal" (
    "id" TEXT NOT NULL,
    "source" "IngestSource" NOT NULL DEFAULT 'paste',
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "transcript" TEXT NOT NULL,
    "proposal" JSONB NOT NULL,
    "status" "IngestStatus" NOT NULL DEFAULT 'pending',
    "matchedContactId" TEXT,
    "matchedClientId" TEXT,
    "matchedDealId" TEXT,
    "createdBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IngestProposal_externalId_key" ON "IngestProposal"("externalId");

-- CreateIndex
CREATE INDEX "IngestProposal_status_idx" ON "IngestProposal"("status");
