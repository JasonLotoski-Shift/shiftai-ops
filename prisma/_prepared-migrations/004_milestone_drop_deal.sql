-- 004_milestone_drop_deal.sql
-- ============================================================================
-- *** DESTRUCTIVE — THIS IS THE ONLY COLUMN DROP IN THE CHANGESET ***
-- ============================================================================
-- M4: remove the Milestone -> Deal link. Milestones now tag ONLY a project or a
-- client (or nothing — firm-level). The deal scope was never used.
--
-- WHY THIS IS SAFE:
--   - No fixture sets Milestone.dealId (lib/data/seed.ts milestones m-1..m-8 set
--     only projectId; prisma/seed.ts writes only { id, title, dueDate, status,
--     projectId }).
--   - No code path writes Milestone.dealId (createMilestone took no dealId in
--     practice; the changeset removes the param entirely).
--   - Therefore every "dealId" value in the live "Milestone" table is NULL and
--     this DROP COLUMN loses no data.
--
-- The matching `milestones Milestone[]` back-relation on Deal and the
-- `deal`/`dealId` fields on Milestone are removed from schema.prisma in the
-- same changeset, so there is no dangling relation after this runs.
--
-- The FK constraint name "Milestone_dealId_fkey" comes from the migration that
-- added it (20260601043604_universal_milestones_task_board_project_type).

-- DropForeignKey
ALTER TABLE "Milestone" DROP CONSTRAINT "Milestone_dealId_fkey";

-- DropColumn (DESTRUCTIVE)
ALTER TABLE "Milestone" DROP COLUMN "dealId";
