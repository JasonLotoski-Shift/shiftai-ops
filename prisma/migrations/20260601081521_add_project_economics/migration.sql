-- CreateTable
CREATE TABLE "ProjectEconomicsLine" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "hours" DECIMAL(7,2) NOT NULL,
    "payRateCents" INTEGER NOT NULL,
    "billRateCents" INTEGER NOT NULL,
    "isExtra" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "fromFirmDefault" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "projectId" TEXT NOT NULL,
    "consultantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectEconomicsLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectEconomicsLine_projectId_sortOrder_idx" ON "ProjectEconomicsLine"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProjectEconomicsLine_consultantId_idx" ON "ProjectEconomicsLine"("consultantId");

-- AddForeignKey
ALTER TABLE "ProjectEconomicsLine" ADD CONSTRAINT "ProjectEconomicsLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEconomicsLine" ADD CONSTRAINT "ProjectEconomicsLine_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
