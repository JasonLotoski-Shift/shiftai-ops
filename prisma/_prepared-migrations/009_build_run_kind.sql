-- 009 — proposal-deck rides the prototype-builder run tables (PREPARED, NOT APPLIED).
-- Needs Jason's approval before it runs — the local .env DATABASE_URL points at the
-- one shared Supabase that also backs production.
--
-- Depends on 007 (PrototypeRun / PrototypeIteration). Purely additive: one column
-- with a default, no drops, no backfill. Every existing row reads 'prototype', so
-- the prototype build path is byte-identical after this applies; the deck build
-- (worker kind="deck") writes 'deck' rows. The matching edit is already in
-- prisma/schema.prisma (model PrototypeRun, field `kind`) and the Prisma client has
-- been regenerated against it.
--
-- Apply with the rest of the prototype set:
--   npx prisma migrate dev --name add_prototype_run_iteration   (007 + 008 + 009 in one)
-- or paste this file into the Supabase SQL editor after 007/008.

-- AlterTable
ALTER TABLE "PrototypeRun" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'prototype';
