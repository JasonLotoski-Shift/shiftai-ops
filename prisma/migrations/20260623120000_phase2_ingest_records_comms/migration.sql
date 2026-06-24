-- Phase 2 — ingest & records redesign.
--   • Task.due → nullable (undated tasks show "no date" instead of fake-overdue)
--   • Interaction → comms record (nullable contactId + body/subject/thread/external + client/deal scope)
--   • Artifact versioning (supersedesId self-relation)
--   • IngestProposal thread id (Gmail thread-collapse)
--
-- ALL additive / nullable — no backfill, no data rewrite, no destructive ops.
--
-- ⚠ The shared Supabase is PROD and has known drift, so `prisma migrate dev` would
-- try a destructive RESET. Apply this file via the drift-safe recipe instead:
--   npx prisma db execute --file prisma/migrations/20260623120000_phase2_ingest_records_comms/migration.sql --schema prisma/schema.prisma
--   npx prisma migrate resolve --applied 20260623120000_phase2_ingest_records_comms
-- (Run AFTER the in-flight 20260622193000_ongoing_service_contracts_and_source_commissions migration —
--  the two are additive and independent, so order only matters for a clean history.)

BEGIN;

-- 1) Task.due → nullable
ALTER TABLE "Task" ALTER COLUMN "due" DROP NOT NULL;

-- 2) Interaction → comms record. contactId becomes nullable (auto-ingested mail
--    that matched no contact still lands, scoped by client/deal). The existing
--    Interaction_contactId_fkey is left as-is (a NULL FK value is permitted); the
--    Prisma schema models it as optional (SetNull) — a benign referential-action
--    drift, consistent with the repo's existing drift-managed model.
ALTER TABLE "Interaction" ALTER COLUMN "contactId" DROP NOT NULL;
ALTER TABLE "Interaction" ADD COLUMN "body"       TEXT;
ALTER TABLE "Interaction" ADD COLUMN "subject"    TEXT;
ALTER TABLE "Interaction" ADD COLUMN "threadId"   TEXT;
ALTER TABLE "Interaction" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Interaction" ADD COLUMN "clientId"   TEXT;
ALTER TABLE "Interaction" ADD COLUMN "dealId"     TEXT;
ALTER TABLE "Interaction"
  ADD CONSTRAINT "Interaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Interaction"
  ADD CONSTRAINT "Interaction_dealId_fkey"   FOREIGN KEY ("dealId")   REFERENCES "Deal"("id")   ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Interaction_clientId_date_idx" ON "Interaction"("clientId", "date");
CREATE INDEX "Interaction_dealId_date_idx"   ON "Interaction"("dealId", "date");
CREATE INDEX "Interaction_threadId_idx"      ON "Interaction"("threadId");
CREATE INDEX "Interaction_externalId_idx"    ON "Interaction"("externalId");

-- 3) Artifact versioning self-relation (a "replace" upload supersedes the prior row)
ALTER TABLE "Artifact" ADD COLUMN "supersedesId" TEXT;
ALTER TABLE "Artifact"
  ADD CONSTRAINT "Artifact_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Artifact_supersedesId_idx" ON "Artifact"("supersedesId");

-- 4) IngestProposal thread key (Gmail thread-collapse). externalId @unique UNCHANGED.
ALTER TABLE "IngestProposal" ADD COLUMN "threadId" TEXT;
CREATE INDEX "IngestProposal_threadId_idx"      ON "IngestProposal"("threadId");
CREATE INDEX "IngestProposal_source_status_idx" ON "IngestProposal"("source", "status");

COMMIT;
