# 010 — companion schema edits (STAGED, apply WITH the SQL)

> ✅ **APPLIED 2026-06-29.** The blocks below are now LIVE in `prisma/schema.prisma`
> and `lib/types.ts`, the client is regenerated, and the SQL ran against the shared
> Supabase (recorded as `20260629120000_financials_rebuild_phase1`). Kept as the
> record of what landed.

These are the `prisma/schema.prisma` and `lib/types.ts` edits that match
`010_financials_rebuild_phase1.sql`. They are **staged here, not yet in the live
files**, on purpose: `010` adds nullable columns to the hot `Deal` and `Invoice`
tables, and regenerating the Prisma client ahead of the un-applied DDL would make
every bare `Deal` / `Invoice` read emit SELECTs for columns the prod DB lacks
(Postgres `42703`) and break those reads everywhere. So nothing in Phase 1 touches
the live schema or the client until apply.

**Apply order (all in one landing, with Jason's approval):**

1. `npx prisma db execute --file prisma/_prepared-migrations/010_financials_rebuild_phase1.sql --schema prisma/schema.prisma`
2. Paste the blocks below into `prisma/schema.prisma` and `lib/types.ts`.
3. `npx prisma generate`
4. `npx prisma migrate resolve --applied 010_financials_rebuild_phase1`
5. `npx tsc --noEmit && npm run build` to confirm clean, then deploy.

> Do NOT run `prisma migrate dev` (it diffs the drifted prod DB and proposes a
> RESET). The two partial unique indexes and all CHECK constraints in the SQL are
> intentionally Prisma-invisible (same drift-tolerant pattern as the 2026-06-22
> commission migration); `migrate resolve` records 010 as applied without re-diffing.

---

## `prisma/schema.prisma`

### New enums (add near the other commission enums, ~line 325)

```prisma
// Financials rebuild (010) — unified commission v2. Plain underscored values,
// NO @map (brand-new, no legacy data to map).
enum CommissionKind {
  origination
  source
}

enum CommissionBasis {
  labor_revenue
  build_value
}

enum CommissionStream {
  build
  recurring
}
```

### New models (add after the commission tables, ~line 2440)

```prisma
// The ONE unified commission line (rebuild Ask 2 / §9.5) — replaces Origination +
// DealSourceCommission + ProjectSourceCommission + OngoingContractCommission once
// Phase 4 cuts over. Canonical home is the project; dealId carries a pre-convert
// line. recurringPct is null unless a ServiceContract exists (how build-vs-recurring
// is inferred; the CommissionBase enum is dropped). CHECKs (payee XOR, scope ≥1,
// origination-has-no-recurringPct, pct range) live in 010 SQL.
model CommissionLine {
  id            String          @id @default(cuid())
  kind          CommissionKind
  basis         CommissionBasis
  buildPct      Decimal         @default(0) @db.Decimal(5, 2)
  recurringPct  Decimal?        @db.Decimal(5, 2)
  coveredMonths Int?
  onSchedule    Boolean         @default(true)
  sortOrder     Int             @default(0)
  externalName  String?
  notes         String?

  // Provenance for the Phase 4 parity gate (which old row seeded this line).
  backfillSourceId    String?
  backfillSourceTable String?

  project   Project? @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectId String?
  deal      Deal?    @relation(fields: [dealId], references: [id], onDelete: Cascade)
  dealId    String?
  partner   Partner? @relation("PartnerCommissionLine", fields: [partnerId], references: [id], onDelete: SetNull)
  partnerId String?

  payouts CommissionPayout[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([projectId])
  @@index([dealId])
  @@index([partnerId])
}

// Mirrors ConsultantPayout (rebuild Ask 3 / §9.5): one row per line per stage
// (build → installment) or per covered month (recurring → periodIndex/periodStart).
// settledByBill + invoiceWaivedReason are the same reconciliation primitive
// ConsultantPayout uses. The two stream uniques are partial → SQL-only in 010;
// the stream/target XOR is a CHECK in 010 SQL.
model CommissionPayout {
  id              String        @id @default(cuid())
  amount          Int
  status          PayoutStatus  @default(owed)
  method          PayoutMethod?
  paidAt          DateTime?
  confirmedAt     DateTime?
  clientPaidFirst Boolean?
  notes           String?

  stream        CommissionStream
  installment   BillingInstallment? @relation(fields: [installmentId], references: [id])
  installmentId String?
  periodIndex   Int?
  periodStart   DateTime?

  commissionLine   CommissionLine @relation(fields: [commissionLineId], references: [id], onDelete: Cascade)
  commissionLineId String

  settledByBill       Bill?   @relation("BillSettledCommissionPayouts", fields: [settledByBillId], references: [id], onDelete: SetNull)
  settledByBillId     String?
  invoiceWaivedReason String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Uniqueness is enforced by two PARTIAL unique indexes in 010 SQL
  // (commissionLineId, installmentId) WHERE stream='build' and
  // (commissionLineId, periodIndex) WHERE stream='recurring' — Prisma can't author them.
  @@index([commissionLineId])
  @@index([settledByBillId])
  @@index([installmentId])
}

// Dated FX rates (rebuild §2 / §9 fx) — replaces the hard-coded USD 1.37 in
// lib/finance.ts. rate = CAD per 1 unit of `currency`, true as of `asOf`.
model FxRate {
  id        String   @id @default(cuid())
  currency  String
  rate      Decimal  @db.Decimal(10, 4)
  asOf      DateTime
  source    String?
  createdAt DateTime @default(now())

  @@index([currency, asOf])
}

// Firm bank-balance anchor the cash strip carries forward (v1 = one balance).
model OpeningBalance {
  id        String   @id @default(cuid())
  amount    Int
  asOf      DateTime
  label     String?
  note      String?
  active    Boolean  @default(true)
  enteredBy String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([active, asOf])
}

// Statement-vs-computed reconciliation rows (Export & integrity surface).
model BankReconciliation {
  id               String   @id @default(cuid())
  statementDate    DateTime
  statementBalance Int
  computedBalance  Int?
  delta            Int?
  note             String?
  reconciledBy     String
  createdAt        DateTime @default(now())

  @@index([statementDate])
}

// Partial / multiple receipts against one Invoice. Invoice.status/paidAt stay
// authoritative until Phase 2 derives "paid in full" from SUM(amount).
model InvoicePayment {
  id         String   @id @default(cuid())
  amount     Int
  receivedAt DateTime
  method     String?
  note       String?
  createdBy  String

  invoice   Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  invoiceId String

  createdAt DateTime @default(now())

  @@index([invoiceId])
}
```

### Back-relations + deferred columns on existing models

Add the relation field to each existing model (virtual — no DB column), plus the
two deferred scalar columns:

```prisma
// model Deal { ... }
  budgetFee      Int?               // 010 — budget overrides estimate once set
  commissionLines CommissionLine[]

// model Project { ... }
  commissionLines CommissionLine[]

// model Partner { ... }
  commissionLines CommissionLine[] @relation("PartnerCommissionLine")

// model BillingInstallment { ... }
  commissionPayouts CommissionPayout[]

// model Bill { ... }
  settledCommissionPayouts CommissionPayout[] @relation("BillSettledCommissionPayouts")

// model Invoice { ... }
  driveUrl String?                  // 010 — the stored invoice PDF (was null in every export)
  payments InvoicePayment[]
```

---

## `lib/types.ts`

Add the enum unions (only those not already present) and the model types. These
are UI-facing; nothing references them until Phase 2 builds the surfaces.

```ts
export type CommissionKind = "origination" | "source";
export type CommissionBasis = "labor_revenue" | "build_value";
export type CommissionStream = "build" | "recurring";
// PayoutStatus / PayoutMethod already exist for ConsultantPayout — reuse them; add
// only if missing:  "owed" | "paid" | "confirmed"  /  "etransfer" | "wire" | "cheque" | "other"

export type CommissionLine = {
  id: string;
  kind: CommissionKind;
  basis: CommissionBasis;
  buildPct: number;          // percent
  recurringPct?: number | null;
  coveredMonths?: number | null;
  onSchedule: boolean;
  sortOrder: number;
  projectId?: string | null;
  dealId?: string | null;
  partnerId?: string | null;
  externalName?: string | null;
  backfillSourceId?: string | null;
  backfillSourceTable?: string | null;
  notes?: string | null;
};

export type CommissionPayout = {
  id: string;
  amount: number;            // whole CAD
  status: "owed" | "paid" | "confirmed";
  method?: "etransfer" | "wire" | "cheque" | "other" | null;
  stream: CommissionStream;
  commissionLineId: string;
  installmentId?: string | null;
  periodIndex?: number | null;
  periodStart?: string | null; // ISO
  settledByBillId?: string | null;
  invoiceWaivedReason?: string | null;
  paidAt?: string | null;
  confirmedAt?: string | null;
  clientPaidFirst?: boolean | null;
};

export type FxRate = { id: string; currency: string; rate: number; asOf: string; source?: string | null };
export type OpeningBalance = { id: string; amount: number; asOf: string; label?: string | null; note?: string | null; active: boolean; enteredBy: string };
export type BankReconciliation = { id: string; statementDate: string; statementBalance: number; computedBalance?: number | null; delta?: number | null; note?: string | null; reconciledBy: string };
export type InvoicePayment = { id: string; invoiceId: string; amount: number; receivedAt: string; method?: string | null; note?: string | null; createdBy: string };
```
