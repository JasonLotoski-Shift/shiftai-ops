-- 001_industry_add_values.sql
-- M1: extend the Industry enum with nine new sub-verticals.
--
-- The existing values (automotive, motorsport, engineering, construction, other)
-- stay untouched; "other" remains the catch-all. New values use plain
-- single-word / snake_case identifiers — NO @map — so Prisma returns exactly
-- what's stored and lib/types.ts mirrors them verbatim.
--
-- SAFETY NOTE (Postgres 15 / Supabase): `ALTER TYPE ... ADD VALUE` is allowed
-- inside a transaction as long as the new value is NOT USED (read/written) in
-- the SAME transaction. We only ADD the labels here — no row inserts/updates
-- reference them — so running all nine in one transaction is safe.
-- IF NOT EXISTS makes each statement idempotent (safe to re-run).

ALTER TYPE "Industry" ADD VALUE IF NOT EXISTS 'architecture';
ALTER TYPE "Industry" ADD VALUE IF NOT EXISTS 'real_estate';
ALTER TYPE "Industry" ADD VALUE IF NOT EXISTS 'manufacturing';
ALTER TYPE "Industry" ADD VALUE IF NOT EXISTS 'heavy_equipment';
ALTER TYPE "Industry" ADD VALUE IF NOT EXISTS 'distribution';
ALTER TYPE "Industry" ADD VALUE IF NOT EXISTS 'logistics';
ALTER TYPE "Industry" ADD VALUE IF NOT EXISTS 'professional_services';
ALTER TYPE "Industry" ADD VALUE IF NOT EXISTS 'healthcare';
ALTER TYPE "Industry" ADD VALUE IF NOT EXISTS 'beverage';
