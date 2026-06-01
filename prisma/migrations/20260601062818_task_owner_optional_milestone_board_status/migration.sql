-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_ownerId_fkey";

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "boardStatus" "TaskStatus" NOT NULL DEFAULT 'todo';

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "ownerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
