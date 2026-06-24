-- Deal: optional custom name (heading; falls back to company when null).
ALTER TABLE "Deal" ADD COLUMN "name" TEXT;

-- ContactAffiliation: a contact's company hats (employment / roles). The
-- isPrimary row mirrors the scalar Contact.company/title.
CREATE TABLE "ContactAffiliation" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactAffiliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactAffiliation_contactId_idx" ON "ContactAffiliation"("contactId");

-- AddForeignKey
ALTER TABLE "ContactAffiliation" ADD CONSTRAINT "ContactAffiliation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one primary affiliation per existing contact, from the scalar
-- company/title. Skip rows with an empty company (nothing to seed). Treat the
-- "—" / "" title placeholders as null so they don't surface as a fake role.
INSERT INTO "ContactAffiliation" ("id", "contactId", "company", "title", "isPrimary", "sortOrder", "createdAt", "updatedAt")
SELECT
    'aff_' || "id",
    "id",
    "company",
    NULLIF(NULLIF("title", ''), '—'),
    true,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Contact"
WHERE COALESCE(TRIM("company"), '') <> '';
