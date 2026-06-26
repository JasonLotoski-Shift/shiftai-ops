-- Firm Knowledge — Phase 1 (additive, lowest-risk).
-- PREPARED, NOT YET APPLIED. The shared Supabase IS production; do NOT run
-- `prisma migrate dev` (it wants to RESET). Apply with the safe recipe:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20260625130000_firm_knowledge_phase1/migration.sql
--   npx prisma migrate resolve --applied 20260625130000_firm_knowledge_phase1
-- Everything here is additive (new enums, one new table, nullable columns on
-- Artifact) so it breaks no existing rows or code.

-- CreateEnum
CREATE TYPE "KnowledgeSensitivity" AS ENUM ('firm_wide', 'managing_partner');

-- CreateEnum
CREATE TYPE "KnowledgeConfidence" AS ENUM ('high', 'medium', 'low');

-- CreateTable
CREATE TABLE "KnowledgeCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "stewardId" TEXT,
    "reviewCadenceDays" INTEGER NOT NULL DEFAULT 90,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeCategory_slug_key" ON "KnowledgeCategory"("slug");

-- CreateIndex
CREATE INDEX "KnowledgeCategory_parentId_idx" ON "KnowledgeCategory"("parentId");

-- CreateIndex
CREATE INDEX "KnowledgeCategory_stewardId_idx" ON "KnowledgeCategory"("stewardId");

-- AlterTable
ALTER TABLE "Artifact" ADD COLUMN     "sensitivity" "KnowledgeSensitivity" NOT NULL DEFAULT 'firm_wide',
ADD COLUMN     "knowledgeCategoryId" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "confidence" "KnowledgeConfidence";

-- CreateIndex
CREATE INDEX "Artifact_knowledgeCategoryId_idx" ON "Artifact"("knowledgeCategoryId");

-- CreateIndex
CREATE INDEX "Artifact_ownerId_idx" ON "Artifact"("ownerId");

-- AddForeignKey
ALTER TABLE "KnowledgeCategory" ADD CONSTRAINT "KnowledgeCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCategory" ADD CONSTRAINT "KnowledgeCategory_stewardId_fkey" FOREIGN KEY ("stewardId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_knowledgeCategoryId_fkey" FOREIGN KEY ("knowledgeCategoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the six ratified top-level categories. Stewards (stewardId) are assigned
-- later in Phase 0; idempotent via slug so a re-run is harmless.
INSERT INTO "KnowledgeCategory" ("id", "slug", "label", "description", "reviewCadenceDays", "sortOrder", "createdAt", "updatedAt") VALUES
  ('kc-meetings-decisions',    'meetings-decisions',    'Meetings & Decisions',     'Team meetings, outcomes, and the decisions that came out of them.',            90,  1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('kc-build-systems',         'build-systems',         'Build & Systems',          'How the firm builds — system architecture, the ops tool, technical reference.', 90,  2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('kc-product-features',      'product-features',      'Product & Features',       'Product capabilities and features, including those harvested from projects.',   90,  3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('kc-brand-sales-marketing', 'brand-sales-marketing', 'Brand, Sales & Marketing', 'Positioning, brand, sales collateral, and go-to-market material.',              90,  4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('kc-learning',              'learning',              'Learning',                 'Lessons learned, playbooks, and how-we-do-it knowledge.',                       365, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('kc-reference',             'reference',             'Reference',                'Stable reference docs — policies, templates, canonical facts.',                 365, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
