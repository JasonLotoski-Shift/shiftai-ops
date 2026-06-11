-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "driveFolderId" TEXT,
ADD COLUMN     "driveFolderUrl" TEXT;

-- AlterTable
ALTER TABLE "ProspectLead" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "claimedBy" TEXT,
ADD COLUMN     "claimedById" TEXT;
