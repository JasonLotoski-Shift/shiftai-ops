-- Ongoing Service Contracts + deal-source commission (2026-06-22)
--
-- ADDITIVE ONLY. Creates 3 enum types + 5 new tables + their indexes/FKs/CHECKs.
-- Touches NO existing table (the Prisma back-relations are virtual; the FK
-- columns all live on these new child tables). Safe to apply to the shared,
-- drifted prod Supabase via `prisma db execute` + `prisma migrate resolve`.
-- DO NOT run `prisma migrate dev` (it would diff the drifted DB and propose a
-- RESET). Wrapped in a transaction so a mid-file failure leaves zero new objects.

BEGIN;

-- 1. Enum types (hyphenated DB values per the @map convention)
CREATE TYPE "CommissionBase" AS ENUM ('deal-value', 'total-6mo', 'total-12mo');
CREATE TYPE "ServiceContractStatus" AS ENUM ('pending-start', 'active', 'ended', 'cancelled');
CREATE TYPE "CommissionAccrualStatus" AS ENUM ('projected', 'accrued', 'paid');

-- 2. Tables
CREATE TABLE "DealSourceCommission" (
    "id" TEXT NOT NULL,
    "pct" DECIMAL(5,2) NOT NULL,
    "base" "CommissionBase" NOT NULL DEFAULT 'deal-value',
    "externalName" TEXT,
    "notes" TEXT,
    "dealId" TEXT NOT NULL,
    "partnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DealSourceCommission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceContract" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ServiceContractStatus" NOT NULL DEFAULT 'pending-start',
    "monthlyFee" INTEGER NOT NULL,
    "termMonths" INTEGER NOT NULL DEFAULT 12,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "projectId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "partnerLeadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceContract_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectSourceCommission" (
    "id" TEXT NOT NULL,
    "pct" DECIMAL(5,2) NOT NULL,
    "base" "CommissionBase" NOT NULL DEFAULT 'deal-value',
    "buildAmount" INTEGER NOT NULL,
    "externalName" TEXT,
    "notes" TEXT,
    "sourceDealCommissionId" TEXT,
    "projectId" TEXT NOT NULL,
    "partnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectSourceCommission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OngoingContractCommission" (
    "id" TEXT NOT NULL,
    "pct" DECIMAL(5,2) NOT NULL,
    "base" "CommissionBase" NOT NULL,
    "coveredMonths" INTEGER NOT NULL,
    "projectedAmount" INTEGER NOT NULL,
    "externalName" TEXT,
    "contractId" TEXT NOT NULL,
    "projectCommissionId" TEXT,
    "partnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OngoingContractCommission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OngoingContractCommissionAccrual" (
    "id" TEXT NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "CommissionAccrualStatus" NOT NULL DEFAULT 'projected',
    "paidAt" TIMESTAMP(3),
    "commissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OngoingContractCommissionAccrual_pkey" PRIMARY KEY ("id")
);

-- 3. Indexes + uniques
CREATE INDEX "DealSourceCommission_dealId_idx" ON "DealSourceCommission"("dealId");
CREATE UNIQUE INDEX "ServiceContract_projectId_key" ON "ServiceContract"("projectId");
CREATE INDEX "ServiceContract_clientId_idx" ON "ServiceContract"("clientId");
CREATE INDEX "ServiceContract_status_idx" ON "ServiceContract"("status");
CREATE INDEX "ProjectSourceCommission_projectId_idx" ON "ProjectSourceCommission"("projectId");
CREATE INDEX "ProjectSourceCommission_partnerId_idx" ON "ProjectSourceCommission"("partnerId");
CREATE UNIQUE INDEX "OngoingContractCommission_projectCommissionId_key" ON "OngoingContractCommission"("projectCommissionId");
CREATE INDEX "OngoingContractCommission_contractId_idx" ON "OngoingContractCommission"("contractId");
CREATE UNIQUE INDEX "OngoingContractCommissionAccrual_commissionId_periodIndex_key" ON "OngoingContractCommissionAccrual"("commissionId", "periodIndex");
CREATE INDEX "OngoingContractCommissionAccrual_periodStart_idx" ON "OngoingContractCommissionAccrual"("periodStart");

-- 4. Foreign keys (Cascade for owner FKs, SET NULL for optional partner FKs,
--    RESTRICT for the client/partner-lead the contract must not orphan)
ALTER TABLE "DealSourceCommission" ADD CONSTRAINT "DealSourceCommission_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealSourceCommission" ADD CONSTRAINT "DealSourceCommission_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_partnerLeadId_fkey" FOREIGN KEY ("partnerLeadId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectSourceCommission" ADD CONSTRAINT "ProjectSourceCommission_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectSourceCommission" ADD CONSTRAINT "ProjectSourceCommission_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OngoingContractCommission" ADD CONSTRAINT "OngoingContractCommission_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OngoingContractCommission" ADD CONSTRAINT "OngoingContractCommission_projectCommissionId_fkey" FOREIGN KEY ("projectCommissionId") REFERENCES "ProjectSourceCommission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OngoingContractCommission" ADD CONSTRAINT "OngoingContractCommission_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OngoingContractCommissionAccrual" ADD CONSTRAINT "OngoingContractCommissionAccrual_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "OngoingContractCommission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. CHECK constraints (Prisma will NOT author or re-diff these — keep this file
--    as the canonical record; the server actions enforce the same rules):
ALTER TABLE "DealSourceCommission" ADD CONSTRAINT "DealSourceCommission_payee_xor" CHECK ( ("partnerId" IS NOT NULL) <> ("externalName" IS NOT NULL) );
ALTER TABLE "DealSourceCommission" ADD CONSTRAINT "DealSourceCommission_pct_range" CHECK ( "pct" >= 1 AND "pct" <= 10 );
ALTER TABLE "ProjectSourceCommission" ADD CONSTRAINT "ProjectSourceCommission_payee_xor" CHECK ( ("partnerId" IS NOT NULL) <> ("externalName" IS NOT NULL) );
ALTER TABLE "ProjectSourceCommission" ADD CONSTRAINT "ProjectSourceCommission_pct_range" CHECK ( "pct" >= 1 AND "pct" <= 10 );

COMMIT;
