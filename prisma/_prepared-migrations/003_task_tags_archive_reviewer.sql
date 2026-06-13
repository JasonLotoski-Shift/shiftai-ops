-- 003_task_tags_archive_reviewer.sql
-- M3: extend Task with deal/contact scope tags, an archive timestamp, and a
-- reviewer FK. All columns are nullable / additive — no backfill needed.
--
--   dealId      -> the deal a task hangs off (pipeline task)
--   contactId   -> the contact a task hangs off
--   archivedAt  -> set when moved to the board's Archive column (7-day auto-hide)
--   reviewerId  -> a partner asked to review this task's output
--
-- FK on-delete policies mirror the existing nullable scope FKs on Task
-- (clientId/projectId/artifactId all use ON DELETE SET NULL ON UPDATE CASCADE,
-- the Prisma default for an optional relation).

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "dealId" TEXT,
ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "reviewerId" TEXT;

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
