-- Task board columns v2.
-- New column set: Backlog · To Do · To Do Priority · Staging · In Progress · Done
-- (plus the board's Archive pseudo-column, which is driven by archivedAt, not
-- this enum). Adds backlog / todo-priority / staging and removes in-review.
--
-- Postgres can't DROP a value from an enum in place, so we build a fresh type
-- and swap the two columns that use it (Task.status, Milestone.boardStatus).
-- Any existing in-review rows fold into staging — its closest analog.
BEGIN;

CREATE TYPE "TaskStatus_new" AS ENUM ('backlog', 'todo', 'todo-priority', 'staging', 'in-progress', 'done');

ALTER TABLE "Task" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Milestone" ALTER COLUMN "boardStatus" DROP DEFAULT;

ALTER TABLE "Task" ALTER COLUMN "status" TYPE "TaskStatus_new"
  USING (CASE WHEN "status"::text = 'in-review' THEN 'staging' ELSE "status"::text END::"TaskStatus_new");
ALTER TABLE "Milestone" ALTER COLUMN "boardStatus" TYPE "TaskStatus_new"
  USING (CASE WHEN "boardStatus"::text = 'in-review' THEN 'staging' ELSE "boardStatus"::text END::"TaskStatus_new");

ALTER TYPE "TaskStatus" RENAME TO "TaskStatus_old";
ALTER TYPE "TaskStatus_new" RENAME TO "TaskStatus";
DROP TYPE "TaskStatus_old";

ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'todo';
ALTER TABLE "Milestone" ALTER COLUMN "boardStatus" SET DEFAULT 'todo';

COMMIT;
