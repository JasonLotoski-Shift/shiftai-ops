-- AlterTable
ALTER TABLE "TargetSegment" DROP COLUMN "anchorCompanies",
DROP COLUMN "buyerPersonas",
ADD COLUMN     "anchors" JSONB,
ADD COLUMN     "personas" JSONB,
ADD COLUMN     "priorityLocation" TEXT;
