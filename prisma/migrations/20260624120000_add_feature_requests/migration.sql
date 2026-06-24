-- CreateEnum
CREATE TYPE "FeatureRequestType" AS ENUM ('bug', 'feature', 'improvement', 'broken');

-- CreateEnum
CREATE TYPE "FeatureRequestStatus" AS ENUM ('open', 'in_progress', 'done', 'declined');

-- CreateTable
CREATE TABLE "FeatureRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "FeatureRequestType" NOT NULL,
    "status" "FeatureRequestStatus" NOT NULL DEFAULT 'open',
    "areaTab" TEXT NOT NULL,
    "areaSubTab" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeatureRequest_status_idx" ON "FeatureRequest"("status");

-- CreateIndex
CREATE INDEX "FeatureRequest_areaTab_idx" ON "FeatureRequest"("areaTab");

-- CreateIndex
CREATE INDEX "FeatureRequest_createdById_idx" ON "FeatureRequest"("createdById");

-- CreateIndex
CREATE INDEX "FeatureRequest_createdAt_idx" ON "FeatureRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "FeatureRequest" ADD CONSTRAINT "FeatureRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
