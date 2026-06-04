-- AlterTable
ALTER TABLE "ScanRun" ADD COLUMN     "criteria" JSONB,
ADD COLUMN     "title" TEXT NOT NULL DEFAULT 'Scan';

-- CreateTable
CREATE TABLE "ScanResult" (
    "id" TEXT NOT NULL,
    "scanRunId" TEXT NOT NULL,
    "importedContactId" TEXT NOT NULL,
    "partnerLeadId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "leadType" "ImportLeadType" NOT NULL,
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanResult_scanRunId_score_idx" ON "ScanResult"("scanRunId", "score");

-- CreateIndex
CREATE INDEX "ScanResult_importedContactId_idx" ON "ScanResult"("importedContactId");

-- CreateIndex
CREATE UNIQUE INDEX "ScanResult_scanRunId_importedContactId_key" ON "ScanResult"("scanRunId", "importedContactId");

-- AddForeignKey
ALTER TABLE "ScanResult" ADD CONSTRAINT "ScanResult_scanRunId_fkey" FOREIGN KEY ("scanRunId") REFERENCES "ScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanResult" ADD CONSTRAINT "ScanResult_importedContactId_fkey" FOREIGN KEY ("importedContactId") REFERENCES "ImportedContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
