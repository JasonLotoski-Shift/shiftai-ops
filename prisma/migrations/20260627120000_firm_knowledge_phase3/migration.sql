-- Firm Knowledge — Phase 3 (historical knowledge + decision log + tags).
-- PREPARED, NOT YET APPLIED. The shared Supabase IS production; do NOT run
-- `prisma migrate dev` (it wants to RESET). Apply forward-only with the safe recipe:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20260627120000_firm_knowledge_phase3/migration.sql
--   npx prisma migrate resolve --applied 20260627120000_firm_knowledge_phase3
-- Everything here is additive (2 new enums, 4 new tables, additive back-relations
-- only) so it breaks no existing rows or code. The `fts` column on KnowledgeItem
-- is a Postgres GENERATED tsvector — Prisma never writes it; FTS runs via $queryRaw.

-- CreateEnum
CREATE TYPE "KnowledgeSource" AS ENUM ('uploaded', 'captured', 'transcript', 'agent', 'manual');

-- CreateEnum
CREATE TYPE "KnowledgeParseStatus" AS ENUM ('pending', 'parsed', 'empty', 'failed');

-- CreateTable
CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" "KnowledgeSource" NOT NULL DEFAULT 'uploaded',
    "summary" TEXT,
    "extractedText" TEXT,
    "storagePath" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "byteSize" INTEGER,
    "contentHash" TEXT,
    "driveUrl" TEXT,
    "parseStatus" "KnowledgeParseStatus" NOT NULL DEFAULT 'pending',
    "parseError" TEXT,
    "parsedAt" TIMESTAMP(3),
    "knowledgeCategoryId" TEXT,
    "reviewStatus" "ArtifactReviewStatus" NOT NULL DEFAULT 'draft',
    "sensitivity" "KnowledgeSensitivity" NOT NULL DEFAULT 'firm_wide',
    "ownerId" TEXT,
    "confidence" "KnowledgeConfidence",
    "lastVerifiedAt" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3),
    "generatedFromSkill" TEXT,
    "createdBy" TEXT NOT NULL,
    "clientId" TEXT,
    "projectId" TEXT,
    "dealId" TEXT,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

-- Generated tsvector column (title + summary + extractedText). Prisma maps this
-- as Unsupported("tsvector") and never writes it; Postgres keeps it in sync.
ALTER TABLE "KnowledgeItem" ADD COLUMN "fts" tsvector
    GENERATED ALWAYS AS (
        to_tsvector('english',
            coalesce("title", '') || ' ' || coalesce("summary", '') || ' ' || coalesce("extractedText", ''))
    ) STORED;

-- CreateTable
CREATE TABLE "DecisionRecord" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT,
    "optionsConsidered" TEXT,
    "decision" TEXT NOT NULL,
    "consequences" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "decidedById" TEXT,
    "decidedByLabel" TEXT,
    "sourceInteractionId" TEXT,
    "knowledgeCategoryId" TEXT,
    "reviewStatus" "ArtifactReviewStatus" NOT NULL DEFAULT 'draft',
    "sensitivity" "KnowledgeSensitivity" NOT NULL DEFAULT 'firm_wide',
    "validFrom" TIMESTAMP(3),
    "generatedFromSkill" TEXT,
    "createdBy" TEXT NOT NULL,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeTag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "stewardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeItemTag" (
    "knowledgeItemId" TEXT NOT NULL,
    "knowledgeTagId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeItemTag_pkey" PRIMARY KEY ("knowledgeItemId", "knowledgeTagId")
);

-- CreateIndex
CREATE INDEX "KnowledgeItem_knowledgeCategoryId_reviewStatus_idx" ON "KnowledgeItem"("knowledgeCategoryId", "reviewStatus");
CREATE INDEX "KnowledgeItem_ownerId_idx" ON "KnowledgeItem"("ownerId");
CREATE INDEX "KnowledgeItem_contentHash_idx" ON "KnowledgeItem"("contentHash");
CREATE INDEX "KnowledgeItem_supersedesId_idx" ON "KnowledgeItem"("supersedesId");
CREATE INDEX "KnowledgeItem_parseStatus_idx" ON "KnowledgeItem"("parseStatus");
CREATE INDEX "KnowledgeItem_clientId_idx" ON "KnowledgeItem"("clientId");
CREATE INDEX "KnowledgeItem_projectId_idx" ON "KnowledgeItem"("projectId");
CREATE INDEX "KnowledgeItem_dealId_idx" ON "KnowledgeItem"("dealId");
CREATE INDEX "KnowledgeItem_fts_idx" ON "KnowledgeItem" USING GIN ("fts");

CREATE INDEX "DecisionRecord_knowledgeCategoryId_reviewStatus_idx" ON "DecisionRecord"("knowledgeCategoryId", "reviewStatus");
CREATE INDEX "DecisionRecord_decidedById_idx" ON "DecisionRecord"("decidedById");
CREATE INDEX "DecisionRecord_sourceInteractionId_idx" ON "DecisionRecord"("sourceInteractionId");
CREATE INDEX "DecisionRecord_supersedesId_idx" ON "DecisionRecord"("supersedesId");
CREATE INDEX "DecisionRecord_decidedAt_idx" ON "DecisionRecord"("decidedAt");

CREATE UNIQUE INDEX "KnowledgeTag_slug_key" ON "KnowledgeTag"("slug");
CREATE INDEX "KnowledgeTag_stewardId_idx" ON "KnowledgeTag"("stewardId");

CREATE INDEX "KnowledgeItemTag_knowledgeTagId_idx" ON "KnowledgeItemTag"("knowledgeTagId");

-- AddForeignKey
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_knowledgeCategoryId_fkey" FOREIGN KEY ("knowledgeCategoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "KnowledgeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_sourceInteractionId_fkey" FOREIGN KEY ("sourceInteractionId") REFERENCES "Interaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_knowledgeCategoryId_fkey" FOREIGN KEY ("knowledgeCategoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "DecisionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "KnowledgeTag" ADD CONSTRAINT "KnowledgeTag_stewardId_fkey" FOREIGN KEY ("stewardId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "KnowledgeItemTag" ADD CONSTRAINT "KnowledgeItemTag_knowledgeItemId_fkey" FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeItemTag" ADD CONSTRAINT "KnowledgeItemTag_knowledgeTagId_fkey" FOREIGN KEY ("knowledgeTagId") REFERENCES "KnowledgeTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
