-- Remove Log hours from the tool: drop HoursEntry, the Project hours columns,
-- and the 'hours' value from the ActivityType enum.

-- DropForeignKey
ALTER TABLE "HoursEntry" DROP CONSTRAINT IF EXISTS "HoursEntry_projectId_fkey";

-- Remove any Activity rows using the 'hours' type before narrowing the enum
DELETE FROM "Activity" WHERE "type" = 'hours';

-- AlterEnum
BEGIN;
CREATE TYPE "ActivityType_new" AS ENUM ('touch', 'status', 'doc', 'ai');
ALTER TABLE "Activity" ALTER COLUMN "type" TYPE "ActivityType_new" USING ("type"::text::"ActivityType_new");
ALTER TYPE "ActivityType" RENAME TO "ActivityType_old";
ALTER TYPE "ActivityType_new" RENAME TO "ActivityType";
DROP TYPE "ActivityType_old";
COMMIT;

-- DropTable
DROP TABLE "HoursEntry";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "budgetHours",
DROP COLUMN "hoursLogged";
