-- AlterEnum
-- 'contacted' sits between pending and added (cosmetic ordinal); the app keys on
-- string equality. ADD VALUE cannot run inside the implicit migration tx on older
-- PG, so it is its own statement applied via `prisma migrate deploy`.
ALTER TYPE "ProspectLeadStatus" ADD VALUE 'contacted' BEFORE 'added';

-- AlterTable — cold-outreach draft fields (all nullable; no backfill).
ALTER TABLE "ProspectLead" ADD COLUMN     "outreachSubject" TEXT;
ALTER TABLE "ProspectLead" ADD COLUMN     "outreachDraft" TEXT;
ALTER TABLE "ProspectLead" ADD COLUMN     "outreachPersonIndex" INTEGER;
ALTER TABLE "ProspectLead" ADD COLUMN     "outreachSentAt" TIMESTAMP(3);
