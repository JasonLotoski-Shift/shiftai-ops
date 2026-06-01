-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('owed', 'paid', 'confirmed');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('e-transfer', 'wire', 'cheque', 'other');

-- CreateTable
CREATE TABLE "ConsultantPayout" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'owed',
    "method" "PayoutMethod",
    "paidAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "clientPaidFirst" BOOLEAN,
    "notes" TEXT,
    "projectId" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "installmentId" TEXT NOT NULL,
    "economicsLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultantPayout_projectId_status_idx" ON "ConsultantPayout"("projectId", "status");

-- CreateIndex
CREATE INDEX "ConsultantPayout_consultantId_status_idx" ON "ConsultantPayout"("consultantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultantPayout_installmentId_consultantId_key" ON "ConsultantPayout"("installmentId", "consultantId");

-- AddForeignKey
ALTER TABLE "ConsultantPayout" ADD CONSTRAINT "ConsultantPayout_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantPayout" ADD CONSTRAINT "ConsultantPayout_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantPayout" ADD CONSTRAINT "ConsultantPayout_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "BillingInstallment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantPayout" ADD CONSTRAINT "ConsultantPayout_economicsLineId_fkey" FOREIGN KEY ("economicsLineId") REFERENCES "ProjectEconomicsLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
