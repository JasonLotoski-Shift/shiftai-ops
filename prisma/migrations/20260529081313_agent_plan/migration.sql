-- CreateEnum
CREATE TYPE "AgentPlanStatus" AS ENUM ('idea', 'active', 'paused', 'done');

-- CreateTable
CREATE TABLE "AgentPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "keyTasks" TEXT[],
    "notes" TEXT,
    "status" "AgentPlanStatus" NOT NULL DEFAULT 'idea',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentPlan_status_idx" ON "AgentPlan"("status");

-- AddForeignKey
ALTER TABLE "AgentPlan" ADD CONSTRAINT "AgentPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
