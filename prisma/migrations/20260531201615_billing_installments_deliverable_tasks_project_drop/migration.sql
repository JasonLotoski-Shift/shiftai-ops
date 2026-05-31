-- CreateEnum
CREATE TYPE "InstallmentTrigger" AS ENUM ('on-signing', 'milestone', 'date', 'manual');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('planned', 'invoiced', 'paid');

-- AlterEnum
ALTER TYPE "IngestSource" ADD VALUE 'drop';

-- AlterTable
ALTER TABLE "IngestProposal" ADD COLUMN     "matchedProjectId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "artifactId" TEXT;

-- CreateTable
CREATE TABLE "BillingInstallment" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "trigger" "InstallmentTrigger" NOT NULL DEFAULT 'manual',
    "dueDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'planned',
    "projectId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingInstallment_invoiceId_key" ON "BillingInstallment"("invoiceId");

-- CreateIndex
CREATE INDEX "BillingInstallment_projectId_sortOrder_idx" ON "BillingInstallment"("projectId", "sortOrder");

-- CreateIndex
CREATE INDEX "Task_artifactId_idx" ON "Task"("artifactId");

-- AddForeignKey
ALTER TABLE "BillingInstallment" ADD CONSTRAINT "BillingInstallment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInstallment" ADD CONSTRAINT "BillingInstallment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
