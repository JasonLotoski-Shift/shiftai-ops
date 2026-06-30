-- 010 — Financials rebuild, Phase 1 (additive schema). PREPARED, NOT APPLIED.
--
-- Needs Jason's explicit approval before it runs — the local .env DATABASE_URL
-- points at the one shared Supabase that also backs production (CLAUDE.md gotcha
-- #1). DO NOT run `prisma migrate dev` (it diffs the drifted prod DB and proposes
-- a RESET). Apply via `prisma db execute` + `prisma migrate resolve`.
--
-- ADDITIVE ONLY. Creates 3 enum types + 6 new tables (CommissionLine,
-- CommissionPayout, FxRate, OpeningBalance, BankReconciliation, InvoicePayment) +
-- their indexes / FKs / CHECKs, and adds 2 NULLABLE columns to existing tables
-- (Deal.budgetFee, Invoice.driveUrl). Zero existing read breaks: the new columns
-- are nullable, every other change is a new object, and the four old commission
-- tables (Origination, DealSourceCommission, ProjectSourceCommission,
-- OngoingContractCommission[+Accrual]) stay AUTHORITATIVE through Phase 4. Nothing
-- here is wired into the calc yet (Phase 2 reads OLD data; Phase 3 backfills;
-- Phase 4 cuts over). Wrapped in a transaction so a mid-file failure leaves zero
-- new objects.
--
-- STAGING NOTE (why this file differs from 001–009): this migration adds columns
-- to HOT existing tables (Deal, Invoice). The matching schema.prisma / lib/types.ts
-- edits are therefore STAGED in the companion file
-- 010_financials_rebuild_phase1.schema.md, NOT applied to the live schema, and the
-- Prisma client is NOT regenerated this session. Regenerating the client ahead of
-- this DDL would make every bare Invoice/Deal read emit SELECTs for columns the
-- un-migrated prod DB lacks (Postgres 42703) and break those reads everywhere.
-- At apply-time, do all three together: (1) run this SQL via db execute, (2) paste
-- the companion edits into schema.prisma + lib/types.ts, (3) `prisma generate`,
-- (4) `prisma migrate resolve`.

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- 1. Enum types (brand-new commission-v2 enums → plain underscored values, NO
--    @map, per the AP/AR convention: no legacy data to map). CommissionPayout
--    reuses the existing PayoutStatus / PayoutMethod types (already in the DB).
-- ──────────────────────────────────────────────────────────────────────
CREATE TYPE "CommissionKind" AS ENUM ('origination', 'source');
CREATE TYPE "CommissionBasis" AS ENUM ('labor_revenue', 'build_value');
CREATE TYPE "CommissionStream" AS ENUM ('build', 'recurring');

-- ──────────────────────────────────────────────────────────────────────
-- 2. New tables
-- ──────────────────────────────────────────────────────────────────────

-- CommissionLine — the ONE unified commission concept (replaces Origination +
-- DealSourceCommission + ProjectSourceCommission + OngoingContractCommission).
-- Canonical home is the project; dealId carries a pre-convert line. payee is a
-- partner XOR an external referrer. `basis` is stored explicitly (labor_revenue
-- for origination, build_value for source). recurringPct is null unless a
-- ServiceContract exists (this is how build-vs-recurring is inferred; the
-- CommissionBase enum is dropped). backfillSource* is provenance for the parity gate.
CREATE TABLE "CommissionLine" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "dealId" TEXT,
    "kind" "CommissionKind" NOT NULL,
    "partnerId" TEXT,
    "externalName" TEXT,
    "buildPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "recurringPct" DECIMAL(5,2),
    "coveredMonths" INTEGER,
    "basis" "CommissionBasis" NOT NULL,
    "onSchedule" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "backfillSourceId" TEXT,
    "backfillSourceTable" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommissionLine_pkey" PRIMARY KEY ("id")
);

-- CommissionPayout — mirrors ConsultantPayout: one row per commission line per
-- stage (build stream → BillingInstallment) or per covered month (recurring
-- stream → periodIndex/periodStart). settledByBillId + invoiceWaivedReason are
-- the SAME reconciliation primitive ConsultantPayout uses, so an external
-- referrer's payment clears the missing-doc flag via the waiver path.
CREATE TABLE "CommissionPayout" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'owed',
    "method" "PayoutMethod",
    "paidAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "clientPaidFirst" BOOLEAN,
    "notes" TEXT,
    "commissionLineId" TEXT NOT NULL,
    "stream" "CommissionStream" NOT NULL,
    "installmentId" TEXT,
    "periodIndex" INTEGER,
    "periodStart" TIMESTAMP(3),
    "settledByBillId" TEXT,
    "invoiceWaivedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id")
);

-- FxRate — dated FX rates, replacing the hard-coded USD 1.37 in lib/finance.ts.
-- `rate` is CAD per 1 unit of `currency`, true as of `asOf`. History is kept; the
-- in-force rate for a currency is the most recent asOf. (lib keeps reading the
-- constant until Phase 2 wires this.)
CREATE TABLE "FxRate" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "rate" DECIMAL(10,4) NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- OpeningBalance — the firm-entered bank-balance anchor the cash strip carries
-- forward (v1 = ONE firm balance). Append-only anchors; the live one is the most
-- recent active row.
CREATE TABLE "OpeningBalance" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "enteredBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OpeningBalance_pkey" PRIMARY KEY ("id")
);

-- BankReconciliation — periodic statement-vs-computed checks (the Export &
-- integrity surface). computedBalance/delta are snapshotted at reconcile time.
CREATE TABLE "BankReconciliation" (
    "id" TEXT NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "statementBalance" INTEGER NOT NULL,
    "computedBalance" INTEGER,
    "delta" INTEGER,
    "note" TEXT,
    "reconciledBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);

-- InvoicePayment — partial / multiple receipts against one Invoice. Models the
-- "deposit lands but the invoice isn't fully paid" case additively: Invoice.status
-- / paidAt stay authoritative until Phase 2 derives "paid in full" from
-- SUM(InvoicePayment.amount). No Invoice scalar column is added for this.
CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

-- ──────────────────────────────────────────────────────────────────────
-- 3. New NULLABLE columns on existing tables (no backfill, no default → every
--    existing row reads NULL; old reads are unaffected).
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE "Deal" ADD COLUMN "budgetFee" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "driveUrl" TEXT;

-- ──────────────────────────────────────────────────────────────────────
-- 4. Indexes + uniques
-- ──────────────────────────────────────────────────────────────────────
CREATE INDEX "CommissionLine_projectId_idx" ON "CommissionLine"("projectId");
CREATE INDEX "CommissionLine_dealId_idx" ON "CommissionLine"("dealId");
CREATE INDEX "CommissionLine_partnerId_idx" ON "CommissionLine"("partnerId");

CREATE INDEX "CommissionPayout_commissionLineId_idx" ON "CommissionPayout"("commissionLineId");
CREATE INDEX "CommissionPayout_settledByBillId_idx" ON "CommissionPayout"("settledByBillId");
CREATE INDEX "CommissionPayout_installmentId_idx" ON "CommissionPayout"("installmentId");
-- One payout per (line, installment) on the build stream; per (line, period) on
-- the recurring stream. Partial uniques — Prisma can NOT author these (kept here
-- as the canonical record; the recompute logic enforces the same invariant).
CREATE UNIQUE INDEX "CommissionPayout_build_unique" ON "CommissionPayout"("commissionLineId", "installmentId") WHERE "stream" = 'build';
CREATE UNIQUE INDEX "CommissionPayout_recurring_unique" ON "CommissionPayout"("commissionLineId", "periodIndex") WHERE "stream" = 'recurring';

CREATE INDEX "FxRate_currency_asOf_idx" ON "FxRate"("currency", "asOf");
CREATE INDEX "OpeningBalance_active_asOf_idx" ON "OpeningBalance"("active", "asOf");
CREATE INDEX "BankReconciliation_statementDate_idx" ON "BankReconciliation"("statementDate");
CREATE INDEX "InvoicePayment_invoiceId_idx" ON "InvoicePayment"("invoiceId");

-- ──────────────────────────────────────────────────────────────────────
-- 5. Foreign keys (Cascade for owner FKs, SET NULL for optional partner FK,
--    RESTRICT for installment to match ConsultantPayout and protect a build
--    payout's NOT-NULL installment under the stream CHECK below).
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_commissionLineId_fkey" FOREIGN KEY ("commissionLineId") REFERENCES "CommissionLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "BillingInstallment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_settledByBillId_fkey" FOREIGN KEY ("settledByBillId") REFERENCES "Bill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────────────
-- 6. CHECK constraints (Prisma will NOT author or re-diff these — this file is
--    the canonical record; the server actions enforce the same rules).
-- ──────────────────────────────────────────────────────────────────────
-- CommissionLine: payee is a partner XOR an external referrer.
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_payee_xor" CHECK ( ("partnerId" IS NOT NULL) <> ("externalName" IS NOT NULL) );
-- CommissionLine: a line is scoped to a project OR a deal (at least one).
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_scope_present" CHECK ( "projectId" IS NOT NULL OR "dealId" IS NOT NULL );
-- CommissionLine: percent sanity.
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_buildPct_range" CHECK ( "buildPct" >= 0 AND "buildPct" <= 100 );
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_recurringPct_range" CHECK ( "recurringPct" IS NULL OR ("recurringPct" >= 0 AND "recurringPct" <= 100) );
-- CommissionLine: origination lines carry NO recurringPct (§9.7 #4 — origination
-- stays a pure labour-pie slice, never a recurring stream).
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_origination_no_recurring" CHECK ( "kind" <> 'origination' OR "recurringPct" IS NULL );

-- CommissionPayout: stream determines the target — a build payout maps to an
-- installment (no period), a recurring payout maps to a period (no installment).
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_stream_target" CHECK (
  ("stream" = 'build' AND "installmentId" IS NOT NULL AND "periodIndex" IS NULL AND "periodStart" IS NULL)
  OR
  ("stream" = 'recurring' AND "periodIndex" IS NOT NULL AND "installmentId" IS NULL)
);

COMMIT;

-- ── Post-apply (NOT part of this transaction) ─────────────────────────────────
-- After this file applies cleanly, register it with Prisma's ledger WITHOUT
-- re-running it (the DB drift means `migrate dev` is off-limits):
--   npx prisma migrate resolve --applied 010_financials_rebuild_phase1
-- (Use the migration folder name once this is copied under prisma/migrations/, or
--  resolve against the baseline per the team's db-execute workflow.)
