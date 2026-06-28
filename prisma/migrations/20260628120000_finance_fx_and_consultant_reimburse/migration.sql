-- Finance FX + consultant reimbursement payee.
-- Additive and idempotent (IF NOT EXISTS / guarded FK) so it is safe to apply to
-- the live shared Supabase via `prisma db execute` + `prisma migrate resolve`
-- (the drift-safe recipe — NOT `migrate dev`, which would reset prod).

-- Foreign-currency source on AP bills (amount/total stay CAD; these record the
-- original figure + the rate used to convert).
ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "origAmount" INTEGER;
ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "origCurrency" TEXT;
ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "fxRate" DECIMAL(10,4);

-- Same FX source on expenses, plus the consultant (non-partner) payer.
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "origAmount" INTEGER;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "origCurrency" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "fxRate" DECIMAL(10,4);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "paidByConsultantId" TEXT;

-- FK: Expense.paidByConsultantId -> Consultant.id (optional; Prisma default
-- SetNull/Cascade). Guarded so a re-run does not error.
DO $$ BEGIN
  ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidByConsultantId_fkey"
    FOREIGN KEY ("paidByConsultantId") REFERENCES "Consultant"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Expense_paidByConsultantId_idx" ON "Expense"("paidByConsultantId");
