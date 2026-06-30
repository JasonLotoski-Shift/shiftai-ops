-- Ingest Lane 4 (Intro / Relationship) + Call Review spine (2026-06-30)
--
-- ADDITIVE ONLY. Creates 2 enum types + 2 new tables (Intro, CallReview) with
-- their indexes/FKs, adds 3 nullable/defaulted columns to existing tables
-- (Contact.isChannelPartner, Contact.channelNotes, Task.introId + its FK), and
-- seeds 1 KnowledgeCategory. Behavior-preserving: no existing row changes value,
-- no column is dropped or retyped. Safe to apply to the shared, drifted prod
-- Supabase via `prisma db execute` + `prisma migrate resolve`.
-- DO NOT run `prisma migrate dev` (it would diff the drifted DB and propose a
-- RESET). Wrapped in a transaction so a mid-file failure leaves zero new objects.

BEGIN;

-- 1. Enum types (brand-new → plain underscored values, no @map). The
--    KnowledgeSensitivity type already exists (firm-knowledge phase 1).
CREATE TYPE "IntroStatus" AS ENUM ('proposed', 'requested', 'made', 'meeting_set', 'converted', 'declined', 'dead');
CREATE TYPE "CallReviewStatus" AS ENUM ('draft', 'approved');

-- 2. Additive columns on existing tables
ALTER TABLE "Contact" ADD COLUMN "isChannelPartner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contact" ADD COLUMN "channelNotes" TEXT;
ALTER TABLE "Task" ADD COLUMN "introId" TEXT;

-- 3. New tables
CREATE TABLE "Intro" (
    "id" TEXT NOT NULL,
    "targetCompany" TEXT NOT NULL,
    "status" "IntroStatus" NOT NULL DEFAULT 'proposed',
    "notes" TEXT,
    "introducerId" TEXT NOT NULL,
    "targetContactId" TEXT,
    "ownerId" TEXT,
    "dealId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Intro_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CallReview" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "callDate" TIMESTAMP(3) NOT NULL,
    "whatWorked" TEXT[],
    "whatDidnt" TEXT[],
    "lessons" TEXT[],
    "coachingNotes" TEXT,
    "sourceInteractionId" TEXT,
    "lane" TEXT,
    "clientId" TEXT,
    "dealId" TEXT,
    "contactId" TEXT,
    "status" "CallReviewStatus" NOT NULL DEFAULT 'draft',
    "sensitivity" "KnowledgeSensitivity" NOT NULL DEFAULT 'firm_wide',
    "promotedKnowledgeItemId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CallReview_pkey" PRIMARY KEY ("id")
);

-- 4. Indexes
CREATE INDEX "Task_introId_idx" ON "Task"("introId");
CREATE INDEX "Intro_introducerId_idx" ON "Intro"("introducerId");
CREATE INDEX "Intro_targetContactId_idx" ON "Intro"("targetContactId");
CREATE INDEX "Intro_ownerId_idx" ON "Intro"("ownerId");
CREATE INDEX "Intro_dealId_idx" ON "Intro"("dealId");
CREATE INDEX "Intro_status_idx" ON "Intro"("status");
CREATE INDEX "CallReview_lane_callDate_idx" ON "CallReview"("lane", "callDate");
CREATE INDEX "CallReview_clientId_idx" ON "CallReview"("clientId");
CREATE INDEX "CallReview_dealId_idx" ON "CallReview"("dealId");
CREATE INDEX "CallReview_contactId_idx" ON "CallReview"("contactId");
CREATE INDEX "CallReview_sourceInteractionId_idx" ON "CallReview"("sourceInteractionId");
CREATE INDEX "CallReview_status_idx" ON "CallReview"("status");

-- 5. Foreign keys (Cascade where the child is owned by its parent — an Intro
--    belongs to its introducer; SET NULL for the optional scope/owner FKs, the
--    same convention the nullable Task scope FKs already use).
ALTER TABLE "Task" ADD CONSTRAINT "Task_introId_fkey" FOREIGN KEY ("introId") REFERENCES "Intro"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Intro" ADD CONSTRAINT "Intro_introducerId_fkey" FOREIGN KEY ("introducerId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Intro" ADD CONSTRAINT "Intro_targetContactId_fkey" FOREIGN KEY ("targetContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Intro" ADD CONSTRAINT "Intro_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Intro" ADD CONSTRAINT "Intro_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallReview" ADD CONSTRAINT "CallReview_sourceInteractionId_fkey" FOREIGN KEY ("sourceInteractionId") REFERENCES "Interaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallReview" ADD CONSTRAINT "CallReview_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallReview" ADD CONSTRAINT "CallReview_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallReview" ADD CONSTRAINT "CallReview_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Seed the BD / Sales Playbook knowledge category — the promotion target for
--    durable call-review lessons (Workstream B). Idempotent via slug.
INSERT INTO "KnowledgeCategory" ("id", "slug", "label", "description", "reviewCadenceDays", "sortOrder", "createdAt", "updatedAt") VALUES
  ('kc-bd-sales-playbook', 'bd-sales-playbook', 'BD & Sales Playbook', 'Repeatable sales and business-development lessons harvested from call reviews — what works in intro and client calls.', 365, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

COMMIT;
