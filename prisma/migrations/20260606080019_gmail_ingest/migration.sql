-- AlterEnum
ALTER TYPE "IngestSource" ADD VALUE 'gmail';

-- CreateTable
CREATE TABLE "PartnerGmailAuth" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,

    CONSTRAINT "PartnerGmailAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestSyncState" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "source" "IngestSource" NOT NULL,
    "cursor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerGmailAuth_partnerId_key" ON "PartnerGmailAuth"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "IngestSyncState_partnerId_source_key" ON "IngestSyncState"("partnerId", "source");

-- AddForeignKey
ALTER TABLE "PartnerGmailAuth" ADD CONSTRAINT "PartnerGmailAuth_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestSyncState" ADD CONSTRAINT "IngestSyncState_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
