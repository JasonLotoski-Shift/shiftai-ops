-- 005_task_milestone_on_delete_setnull.sql
-- M5: make Task -> Milestone delete-safe (ON DELETE SET NULL) so deleting a
-- milestone nulls its child tasks' milestoneId instead of failing on Restrict.
--
-- IMPORTANT — THIS MAY BE A NO-OP AGAINST THE LIVE DB:
--   The existing constraint "Task_milestoneId_fkey" was ALREADY created with
--   `ON DELETE SET NULL ON UPDATE CASCADE` (see migration
--   20260601043604_universal_milestones_task_board_project_type, line 59) —
--   that is the Prisma default for an optional relation. This step only brings
--   schema.prisma into explicit agreement with the DB (the relation now spells
--   out `onDelete: SetNull`). When you run `npx prisma migrate dev`, Prisma will
--   most likely emit NO SQL for this change because the DB constraint already
--   matches. This file is kept for completeness / manual-apply parity.
--
-- If you DO apply manually, drop-and-re-add is idempotent and harmless:

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_milestoneId_fkey";

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
