-- AP/AR + Expenses (firm financials) — Bill (AP) + Expense ledgers (2026-06-25)
--
-- ADDITIVE ONLY. Creates 6 enum types + 2 new tables + their indexes/FKs.
-- Touches NO existing table (the Prisma back-relations on Partner/Client/Project
-- are virtual; the FK columns all live on these new child tables). Safe to apply
-- to the shared, drifted prod Supabase via `prisma db execute` + `prisma migrate
-- resolve --applied 20260625120000_ap_ar_bills_expenses`.
-- DO NOT run `prisma migrate dev` (it would diff the drifted DB and propose a
-- RESET). Wrapped in a transaction so a mid-file failure leaves zero new objects.
--
-- ⚠ PREPARED, NOT YET APPLIED — run only on Jason's go-ahead.

BEGIN;

-- 1. Enum types (brand-new — plain underscored values, no @map)
CREATE TYPE "BillStatus" AS ENUM ('received', 'approved', 'paid', 'void');
CREATE TYPE "BillSource" AS ENUM ('manual', 'gmail_ingest');
CREATE TYPE "ExpenseKind" AS ENUM ('reimbursable', 'firm_paid', 'subscription');
CREATE TYPE "ExpenseStatus" AS ENUM ('draft', 'submitted', 'approved', 'reimbursed', 'paid');
CREATE TYPE "MileageUnit" AS ENUM ('km', 'receipt');
CREATE TYPE "ExpenseCategory" AS ENUM ('travel_accommodation', 'travel_flights', 'travel_meals', 'bd_events', 'bd_meals', 'bd_other', 'fuel_mileage', 'subscription_software', 'subscription_phone', 'subscription_office', 'subscription_other', 'office_supplies', 'professional_fees', 'other');

-- 2. Tables
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "number" TEXT,
    "description" TEXT,
    "amount" INTEGER NOT NULL,
    "gstBps" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "category" "ExpenseCategory",
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "status" "BillStatus" NOT NULL DEFAULT 'received',
    "source" "BillSource" NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "clientId" TEXT,
    "projectId" TEXT,
    "driveFileId" TEXT,
    "driveUrl" TEXT,
    "fileName" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "kind" "ExpenseKind" NOT NULL DEFAULT 'reimbursable',
    "category" "ExpenseCategory" NOT NULL,
    "vendor" TEXT,
    "description" TEXT,
    "amount" INTEGER NOT NULL,
    "gstBps" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "spentAt" TIMESTAMP(3) NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'submitted',
    "mileageUnit" "MileageUnit",
    "mileageKm" DECIMAL(7,1),
    "mileageRateCents" INTEGER,
    "paidById" TEXT,
    "reimbursedAt" TIMESTAMP(3),
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "renewalDate" TIMESTAMP(3),
    "clientId" TEXT,
    "projectId" TEXT,
    "needsPhoto" BOOLEAN NOT NULL DEFAULT false,
    "driveFileId" TEXT,
    "driveUrl" TEXT,
    "fileName" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- 3. Indexes
CREATE INDEX "Bill_status_dueAt_idx" ON "Bill"("status", "dueAt");
CREATE INDEX "Bill_clientId_idx" ON "Bill"("clientId");
CREATE INDEX "Expense_status_spentAt_idx" ON "Expense"("status", "spentAt");
CREATE INDEX "Expense_category_idx" ON "Expense"("category");
CREATE INDEX "Expense_paidById_idx" ON "Expense"("paidById");

-- 4. Foreign keys (all optional → SET NULL, matching Prisma's default for nullable relations)
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
