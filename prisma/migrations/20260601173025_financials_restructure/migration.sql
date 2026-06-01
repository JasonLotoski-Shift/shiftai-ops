-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('fifty-twenty-five', 'monthly-even', 'custom');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('draft', 'sent', 'accepted', 'superseded');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "gstBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "total" INTEGER NOT NULL DEFAULT 0;

-- Backfill: existing invoices are GST-free, so total == amount (subtotal).
UPDATE "Invoice" SET "total" = "amount" WHERE "total" = 0;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "isFirstContract" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "originationPct" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
ADD COLUMN     "scheduleType" "ScheduleType" NOT NULL DEFAULT 'fifty-twenty-five';

-- AlterTable
ALTER TABLE "ProjectEconomicsLine" ADD COLUMN     "rateTierId" TEXT;

-- CreateTable
CREATE TABLE "RateTier" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "billRateCents" INTEGER NOT NULL,
    "payRateCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDirectCost" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDirectCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Origination" (
    "id" TEXT NOT NULL,
    "sharePct" DECIMAL(5,2) NOT NULL,
    "notes" TEXT,
    "projectId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Origination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "EstimateStatus" NOT NULL DEFAULT 'draft',
    "totalValue" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "dealId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateLine" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "hours" DECIMAL(7,2) NOT NULL,
    "payRateCents" INTEGER NOT NULL,
    "billRateCents" INTEGER NOT NULL,
    "isExtra" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "estimateId" TEXT NOT NULL,
    "rateTierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimateLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RateTier_key_key" ON "RateTier"("key");

-- CreateIndex
CREATE INDEX "ProjectDirectCost_projectId_sortOrder_idx" ON "ProjectDirectCost"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "Origination_projectId_idx" ON "Origination"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Origination_projectId_partnerId_key" ON "Origination"("projectId", "partnerId");

-- CreateIndex
CREATE INDEX "Estimate_dealId_idx" ON "Estimate"("dealId");

-- CreateIndex
CREATE INDEX "EstimateLine_estimateId_sortOrder_idx" ON "EstimateLine"("estimateId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProjectEconomicsLine" ADD CONSTRAINT "ProjectEconomicsLine_rateTierId_fkey" FOREIGN KEY ("rateTierId") REFERENCES "RateTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDirectCost" ADD CONSTRAINT "ProjectDirectCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Origination" ADD CONSTRAINT "Origination_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Origination" ADD CONSTRAINT "Origination_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLine" ADD CONSTRAINT "EstimateLine_rateTierId_fkey" FOREIGN KEY ("rateTierId") REFERENCES "RateTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
