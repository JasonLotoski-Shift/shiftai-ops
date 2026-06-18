-- Phase C.2: partner-refine + durable AgentSessionEntry session store.
-- AlterEnum
ALTER TYPE "PrototypeRunStatus" ADD VALUE 'refining';

-- AlterTable
ALTER TABLE "PrototypeRun" ADD COLUMN     "refineUsed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PrototypeIteration" ADD COLUMN     "partnerComment" TEXT;

-- CreateTable
CREATE TABLE "AgentSessionEntry" (
    "id" BIGSERIAL NOT NULL,
    "projectKey" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "uuid" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentSessionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentSessionEntry_projectKey_sessionId_id_idx" ON "AgentSessionEntry"("projectKey", "sessionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSessionEntry_projectKey_sessionId_uuid_key" ON "AgentSessionEntry"("projectKey", "sessionId", "uuid");
