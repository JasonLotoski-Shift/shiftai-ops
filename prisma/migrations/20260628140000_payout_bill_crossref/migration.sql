-- Payout ↔ bill cross-reference (Financials GL restructure, Phase 2 — 2026-06-28)
--
-- ADDITIVE ONLY. Two nullable columns on "ConsultantPayout" + one guarded FK to
-- "Bill" + one index. Touches no existing data and no other table. Applied to the
-- live, drifted shared Supabase via the drift-safe recipe:
--   npx prisma db execute --file prisma/migrations/20260628140000_payout_bill_crossref/migration.sql
--   npx prisma migrate resolve --applied 20260628140000_payout_bill_crossref
-- NOTE: omit `--schema` on `db execute` — Prisma 7 loads the datasource from
-- prisma.config.ts and rejects the flag. DO NOT run `prisma migrate dev` — it
-- would diff the drifted DB (e.g. the PrototypeRun.kind drift) and propose a
-- destructive RESET of prod. Requires 20260625120000_ap_ar_bills_expenses first
-- (the FK references "Bill").
--
-- ✅ APPLIED + migrate-resolve'd on the shared Supabase (2026-06-28). Do not re-run.

-- settledByBillId: the vendor invoice (Bill) that justifies this payout. Nullable
-- and NOT unique — a lump invoice can settle several payout rows.
ALTER TABLE "ConsultantPayout" ADD COLUMN IF NOT EXISTS "settledByBillId" TEXT;

-- invoiceWaivedReason: a managing partner's reason this payout legitimately needs
-- no invoice (an informal e-transfer). Null = not waived; any text = waived.
ALTER TABLE "ConsultantPayout" ADD COLUMN IF NOT EXISTS "invoiceWaivedReason" TEXT;

-- FK: ConsultantPayout.settledByBillId -> Bill.id. SET NULL on delete so removing
-- a bill un-links its payouts (never deletes them). Guarded so a re-run is a no-op.
DO $$ BEGIN
  ALTER TABLE "ConsultantPayout" ADD CONSTRAINT "ConsultantPayout_settledByBillId_fkey"
    FOREIGN KEY ("settledByBillId") REFERENCES "Bill"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ConsultantPayout_settledByBillId_idx" ON "ConsultantPayout"("settledByBillId");
