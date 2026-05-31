-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('chat', 'task-assigned', 'deliverable-added', 'approval-needed');

-- AlterEnum
ALTER TYPE "ChannelKind" ADD VALUE 'system';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "kind" "MessageKind" NOT NULL DEFAULT 'chat';

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "whatsNewSeenAt" TIMESTAMP(3);
