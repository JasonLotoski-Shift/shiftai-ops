-- CreateEnum
CREATE TYPE "AgentPlanKind" AS ENUM ('agent', 'mcp');

-- AlterTable
ALTER TABLE "AgentPlan" ADD COLUMN     "kind" "AgentPlanKind" NOT NULL DEFAULT 'agent';

-- CreateIndex
CREATE INDEX "AgentPlan_kind_idx" ON "AgentPlan"("kind");
