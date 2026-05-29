-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "assignedById" TEXT,
ADD COLUMN     "context" TEXT;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
