-- Ingest 3-lane redesign, Phase 1 (the spine).
-- Adds the nullable destination-lane axis to IngestProposal and backfills
-- existing rows. App-validated string (no DB enum), mirroring the ingestType
-- convention. See docs/ingest-3-lane-plan.md §5, §6.
--
-- DRIFT-SAFE APPLY (shared Supabase IS prod): run this SQL directly via
-- db-execute, then `prisma migrate resolve --applied 20260630120000_ingest_lane`.
-- NEVER `prisma migrate dev` here — it RESETs prod.

ALTER TABLE "IngestProposal" ADD COLUMN "lane" TEXT;

-- Backfill every existing row. Finance-shaped proposals (the Gmail finalizeFinance
-- path stamps financeType / financeIncomplete into the proposal JSON) -> financial;
-- everything else -> client_records. Idempotent via the IS NULL guard.
UPDATE "IngestProposal"
SET "lane" = CASE
  WHEN "proposal"->>'financeType' IN ('ap_bill','reimbursable','firm_paid','ar_payment')
    OR "proposal"->>'financeIncomplete' = 'true'
  THEN 'financial'
  ELSE 'client_records'
END
WHERE "lane" IS NULL;
