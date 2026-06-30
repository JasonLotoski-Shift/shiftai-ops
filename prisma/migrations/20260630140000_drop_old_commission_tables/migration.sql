-- Phase 5 (financials rebuild) — drop the four legacy commission tables.
-- Superseded by the unified CommissionLine / CommissionPayout model (migration
-- 010, 20260629120000_financials_rebuild_phase1). Every reader was migrated off
-- these tables first (the cutover commit + the Phase 5 code migration), and the
-- lone Origination row was backfilled into CommissionLine and is preserved in the
-- Phase 0 Drive snapshot.
--
-- Enums are RETAINED, both still referenced: CommissionBase by DealSourceCommission,
-- CommissionAccrualStatus by lib/billing/commission.ts. Project.originationPct is
-- RETAINED — it drives origination in the unified allocation engine.
--
-- Child-first drop order; CASCADE clears the intra-group FK constraints. No other
-- table references these four, so CASCADE touches nothing outside the group.

DROP TABLE IF EXISTS "OngoingContractCommissionAccrual" CASCADE;
DROP TABLE IF EXISTS "OngoingContractCommission" CASCADE;
DROP TABLE IF EXISTS "ProjectSourceCommission" CASCADE;
DROP TABLE IF EXISTS "Origination" CASCADE;
