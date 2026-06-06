-- Business model v2 — billing & financials.
-- Hand-authored: the ProjectType change is a RENAME (not drop/recreate) so
-- existing rows follow the rename in place with no data loss.

-- 1. Invoice: back-datable "sent" date (distinct from issuedAt). Null on drafts.
ALTER TABLE "Invoice" ADD COLUMN "sentAt" TIMESTAMP(3);

-- 2. ProjectType: rename the old retainer value to the v2 'subscription'
--    (in place — any existing 'monthly-project' rows become 'subscription'),
--    and add the new 'buyout' engagement type.
ALTER TYPE "ProjectType" RENAME VALUE 'monthly-project' TO 'subscription';
ALTER TYPE "ProjectType" ADD VALUE 'buyout';
