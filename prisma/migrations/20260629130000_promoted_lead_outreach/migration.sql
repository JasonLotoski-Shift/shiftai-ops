-- Promoted Leads working layer (Pipeline "Promoted Leads" outreach tracker).
-- Additive + nullable only — safe to apply to the shared prod DB with no data
-- loss and no table rewrite. No new enums (loose strings, per convention).
--
-- AlterTable
ALTER TABLE "ProspectLead" ADD COLUMN     "dismissReason" TEXT,
ADD COLUMN     "touchChannel" TEXT,
ADD COLUMN     "touchAt" TIMESTAMP(3),
ADD COLUMN     "repliedAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT;
