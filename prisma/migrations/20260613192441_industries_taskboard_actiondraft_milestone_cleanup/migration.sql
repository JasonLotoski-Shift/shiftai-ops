/*
  Warnings:

  - You are about to drop the column `dealId` on the `Milestone` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Industry" ADD VALUE 'architecture';
ALTER TYPE "Industry" ADD VALUE 'real_estate';
ALTER TYPE "Industry" ADD VALUE 'manufacturing';
ALTER TYPE "Industry" ADD VALUE 'heavy_equipment';
ALTER TYPE "Industry" ADD VALUE 'distribution';
ALTER TYPE "Industry" ADD VALUE 'logistics';
ALTER TYPE "Industry" ADD VALUE 'professional_services';
ALTER TYPE "Industry" ADD VALUE 'healthcare';
ALTER TYPE "Industry" ADD VALUE 'beverage';

-- DropForeignKey
ALTER TABLE "Milestone" DROP CONSTRAINT "Milestone_dealId_fkey";

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "subIndustry" TEXT;

-- AlterTable
ALTER TABLE "Milestone" DROP COLUMN "dealId";

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "dealId" TEXT,
ADD COLUMN     "reviewerId" TEXT;

-- CreateTable
CREATE TABLE "ActionDraft" (
    "id" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "clientId" TEXT,
    "dealId" TEXT,
    "contactId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionDraft_clientId_idx" ON "ActionDraft"("clientId");

-- CreateIndex
CREATE INDEX "ActionDraft_dealId_idx" ON "ActionDraft"("dealId");

-- CreateIndex
CREATE INDEX "ActionDraft_contactId_idx" ON "ActionDraft"("contactId");

-- CreateIndex
CREATE INDEX "ActionDraft_projectId_idx" ON "ActionDraft"("projectId");

-- CreateIndex
CREATE INDEX "ActionDraft_skill_idx" ON "ActionDraft"("skill");

-- CreateIndex
CREATE INDEX "Task_dealId_idx" ON "Task"("dealId");

-- CreateIndex
CREATE INDEX "Task_contactId_idx" ON "Task"("contactId");

-- CreateIndex
CREATE INDEX "Task_reviewerId_idx" ON "Task"("reviewerId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionDraft" ADD CONSTRAINT "ActionDraft_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionDraft" ADD CONSTRAINT "ActionDraft_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionDraft" ADD CONSTRAINT "ActionDraft_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionDraft" ADD CONSTRAINT "ActionDraft_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
