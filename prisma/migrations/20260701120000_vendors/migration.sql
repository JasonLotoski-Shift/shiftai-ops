-- Managed Vendor list (Financials → Vendors). A curated payee that bills/expenses
-- can link to, with optional defaults that pre-fill the finance form. Bill.vendor /
-- Expense.vendor keep the denormalized display name; vendorId is the optional link.
--
-- PREPARED — NOT APPLIED. Run against prod via the drift-safe recipe (db execute +
-- migrate resolve), never `prisma migrate dev` (it would reset the shared DB).

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultCategory" "ExpenseCategory",
    "defaultCurrency" TEXT DEFAULT 'CAD',
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_name_key" ON "Vendor"("name");

-- CreateIndex
CREATE INDEX "Vendor_archivedAt_idx" ON "Vendor"("archivedAt");

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN "vendorId" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "vendorId" TEXT;

-- CreateIndex
CREATE INDEX "Bill_vendorId_idx" ON "Bill"("vendorId");

-- CreateIndex
CREATE INDEX "Expense_vendorId_idx" ON "Expense"("vendorId");

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
