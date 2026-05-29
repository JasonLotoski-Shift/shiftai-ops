-- Pipeline aging: track when a deal entered its current stage.
ALTER TABLE "Deal" ADD COLUMN "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill existing rows from their last touch so current deals age sensibly
-- instead of all resetting to "fresh" on deploy.
UPDATE "Deal" SET "stageEnteredAt" = "lastTouchAt";
