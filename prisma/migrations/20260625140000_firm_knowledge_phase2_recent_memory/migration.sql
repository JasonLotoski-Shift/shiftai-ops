-- Firm Knowledge — Phase 2 (recent-memory tier). PREPARED, NOT YET APPLIED.
-- The shared Supabase IS production. Apply forward-only (no reset):
--   npx prisma migrate deploy
-- Additive only: a new enum + one new table + 4 seeded empty draft blocks.

-- CreateEnum
CREATE TYPE "MemoryBlockKey" AS ENUM ('firm_state', 'active_engagements', 'recent_decisions', 'watch_list');

-- CreateTable
CREATE TABLE "MemoryBlock" (
    "id" TEXT NOT NULL,
    "key" "MemoryBlockKey" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "draftBody" TEXT NOT NULL DEFAULT '',
    "approvedBody" TEXT,
    "asOf" TIMESTAMP(3),
    "sensitivity" "KnowledgeSensitivity" NOT NULL DEFAULT 'firm_wide',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemoryBlock_key_key" ON "MemoryBlock"("key");

-- CreateIndex
CREATE INDEX "MemoryBlock_approvedById_idx" ON "MemoryBlock"("approvedById");

-- AddForeignKey
ALTER TABLE "MemoryBlock" ADD CONSTRAINT "MemoryBlock_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the 4 recent-memory blocks as empty drafts (partners fill + approve).
INSERT INTO "MemoryBlock" ("id", "key", "label", "description", "draftBody", "createdAt", "updatedAt") VALUES
  ('mb-firm-state',         'firm_state',         'Firm state',         'Where the firm is right now — priorities, what is in flight, what changed this week.', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mb-active-engagements', 'active_engagements', 'Active engagements', 'Current clients and what is happening on each.',                                       '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mb-recent-decisions',   'recent_decisions',   'Recent decisions',   'Decisions made recently and why — so skills do not contradict them.',                  '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mb-watch-list',         'watch_list',         'Watch list',         'Risks, things to keep an eye on, and open questions.',                                 '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
