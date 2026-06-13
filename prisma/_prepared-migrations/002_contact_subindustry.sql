-- 002_contact_subindustry.sql
-- M2: add the Tier-2 sub-industry string to Contact.
--
-- subIndustry is a controlled-vocabulary STRING (not an enum), matching the
-- existing declaration on Deal / Client / ProspectCompany. Nullable, no default.
-- Additive — no backfill needed.

ALTER TABLE "Contact" ADD COLUMN "subIndustry" TEXT;
