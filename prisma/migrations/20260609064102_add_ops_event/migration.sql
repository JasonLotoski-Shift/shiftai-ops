-- CreateEnum
CREATE TYPE "OpsKind" AS ENUM ('claude', 'cron', 'ingest', 'integration', 'mcp');

-- CreateEnum
CREATE TYPE "OpsStatus" AS ENUM ('ok', 'error');

-- AlterEnum
ALTER TYPE "MessageKind" ADD VALUE 'ops-alert';

-- CreateTable
CREATE TABLE "OpsEvent" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "OpsKind" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "OpsStatus" NOT NULL,
    "actor" TEXT NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "detail" TEXT,
    "error" TEXT,
    "durationMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cacheReadTokens" INTEGER,
    "cacheWriteTokens" INTEGER,
    "model" TEXT,
    "clientId" TEXT,
    "meta" JSONB,

    CONSTRAINT "OpsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OpsEvent_ts_idx" ON "OpsEvent"("ts");

-- CreateIndex
CREATE INDEX "OpsEvent_kind_ts_idx" ON "OpsEvent"("kind", "ts");

-- CreateIndex
CREATE INDEX "OpsEvent_kind_status_ts_idx" ON "OpsEvent"("kind", "status", "ts");
