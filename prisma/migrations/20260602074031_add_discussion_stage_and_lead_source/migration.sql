-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('intro', 'outbound', 'referral', 'event', 'inbound', 'other');

-- AlterEnum
ALTER TYPE "DealStage" ADD VALUE 'discussion';

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "sourceCategory" "LeadSource";
