-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('discovery-report', 'pilot-project', 'monthly-project', 'full-build');

-- CreateEnum
CREATE TYPE "WorkCategory" AS ENUM ('firm', 'project', 'pipeline', 'other');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('todo', 'in-progress', 'in-review', 'done');

-- DropForeignKey
ALTER TABLE "Milestone" DROP CONSTRAINT "Milestone_projectId_fkey";

-- AlterTable
ALTER TABLE "BillingInstallment" ADD COLUMN     "isExtra" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "category" "WorkCategory" NOT NULL DEFAULT 'other',
ADD COLUMN     "categoryLabel" TEXT,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "dealId" TEXT,
ADD COLUMN     "ownerId" TEXT,
ALTER COLUMN "dueDate" DROP NOT NULL,
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "projectType" "ProjectType";

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "category" "WorkCategory" NOT NULL DEFAULT 'other',
ADD COLUMN     "categoryLabel" TEXT,
ADD COLUMN     "milestoneId" TEXT,
ADD COLUMN     "status" "TaskStatus" NOT NULL DEFAULT 'todo';

-- CreateIndex
CREATE INDEX "Milestone_projectId_idx" ON "Milestone"("projectId");

-- CreateIndex
CREATE INDEX "Milestone_ownerId_idx" ON "Milestone"("ownerId");

-- CreateIndex
CREATE INDEX "Task_milestoneId_idx" ON "Task"("milestoneId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
