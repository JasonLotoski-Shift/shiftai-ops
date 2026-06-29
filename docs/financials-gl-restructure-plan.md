# Financials GL Restructure — plan

> **Status:** Phase 1 BUILT (2026-06-28), tsc + build clean, NOT pushed. Phase 2
> (the cross-reference migration) still needs Jason's go-ahead. This doc is the
> design of record. Came out of the "the Jack Nyrose
> invoice YW-S1-001 is sitting in the ingest, and we need to cross-reference
> contractor payments against their invoices" note, expanded into a full
> restructure of the Financials tab.
>
> Design went through a three-architect pass (ledger-first / entity-first /
> compliance-first), a synthesis, and an adversarial review. The review caught two
> real defects in the first draft (count the bill vs the payout; a `@unique` link
> that can't model a lump invoice), both corrected below.
>
> Extends [billing-financials-plan.md](billing-financials-plan.md) and the AP/AR
> slice shipped 2026-06-25. Read alongside the prod-migration recipe in
> [business-model-v2-plan.md](business-model-v2-plan.md).

---

## The decisions (Jason, 2026-06-28)

| Question | Decision |
|---|---|
| How far / when? | **Plan doc only.** Write the architecture, build nothing yet. |
| Who sees the new GL / per-entity / compliance surfaces? | **Managing partners only.** Matches the AP/AR tab and partner economics. |
| A payout we made with no invoice on file? | **Stays flagged until an invoice is attached OR a managing partner marks it "no invoice required" with a reason.** |

Carried forward as the recommended default (open to override at build time):

| Decision | Default | Why |
|---|---|---|
| Which side of a linked contractor pair is the money-out figure? | **The payout (the cash that moved).** The bill is the supporting document. | `Bill.total` carries GST once the firm registers; the e-transfer amount is the real cash. Counting the bill would over-state cash-out by the GST on every contractor invoice. |
| Where does the cross-reference link live? | **`ConsultantPayout.settledByBillId` (nullable, NOT unique).** | One lump invoice (YW-S1-001) can cover several project stages, which are several payout rows. Many payouts point at one bill. A unique forward link on `Bill` physically can't represent that. |

---

## The problem

Four money streams, and they do not reconcile in one place:

| Stream | Model | Lives in | Gap |
|---|---|---|---|
| Money in | `Invoice` | AP/AR tab | fine |
| Vendor bills out | `Bill` | AP/AR tab | `vendor` is free text, not tied to a person |
| Expenses out | `Expense` | AP/AR tab | only stream with a missing-doc flag (`needsPhoto`) |
| **Contractor payouts out** | `ConsultantPayout` | **project page only** ([team-ledger.tsx](../components/billing/team-ledger.tsx)) | invisible in Financials, no document, no link to any invoice |

So for Jack Nyrose:

- "We paid Jack via e-transfer" is a `ConsultantPayout` on the Yardworks project (status `paid`, method `etransfer`). It never appears in the Financials tab.
- His invoice **YW-S1-001** is sitting in the ingest. When filed it becomes a `Bill` with `vendor = "Jack Nyrose"` (free text), unlinked to his `Consultant` row and unlinked to the payout.
- The same dollars exist as two records with nothing connecting them, and one of them is unreachable from Financials.

### The correctness trap

The same contractor dollars appear twice: once as the payout (cash out), once as the bill (the invoice). A naive unified ledger that lists both as "money out" reads **$10,000 out for a $5,000 payment**. The cross-reference link is therefore required for two reasons at once: the audit trail Jason asked for, and a correct money-out total. Any design that ignores the link double-counts.

---

## The design

One spine, four surfaces. Everything reads from one pure normalizer.

### 1. The ledger normalizer (the GL spine)

A new pure module `lib/finance-ledger.ts` (no Prisma or Drive imports, same client-safe contract as [lib/finance.ts](../lib/finance.ts)). It flattens all five streams into one row shape:

```ts
type LedgerEntry = {
  id: string;                 // prefixed: inv-… bill-… exp-… payout-… comm-…
  sourceType: "invoice" | "bill" | "expense" | "payout" | "commission";
  direction: "in" | "out";
  party: { kind: "client" | "consultant" | "vendor" | "partner" | "external"; id: string | null; name: string };
  projectId: string | null; projectName: string | null;
  number: string | null;
  category: ExpenseCategory | null; categoryLabel: string | null;
  description: string | null;
  amountCad: number;          // whole CAD; subtotal (amount), NOT total — see totals semantics
  origCurrency: string | null; origAmount: number | null;
  status: string;             // source-native status, kept raw
  cashMoved: boolean;         // paid | reimbursed | confirmed | invoice-paid → true
  date: string;               // ISO; issuedAt / spentAt / paidAt / createdAt fallback
  paidDate: string | null;
  hasDocument: boolean;       // see compliance rules
  driveUrl: string | null;
  linkedEntryId: string | null;   // the paired payout/bill GL id (Phase 2)
  countsAsCashOut: boolean;       // dedup output: false on the document side of a linked pair
  entityKey: string;              // grouping key: `${party.kind}:${party.id ?? slug(name)}`
};
```

Exports: `toLedgerEntries(raw)` (pure mapper over already-fetched rows, keeps Prisma in the RSC), `dedupeCashOut(entries)`, `ledgerTotals(entries)`, `filterLedger(entries, q)`, `groupLedger(entries, by)`.

A thin server module `app/(app)/financials/ledger-data.ts` does the one Prisma fetch wave (mirrors the existing `Promise.all` in [page.tsx](../app/(app)/financials/page.tsx)) and calls `toLedgerEntries`. It is the single DB read for the GL.

The on-screen GL is a new MP-only "Ledger" sub-tab in [financials-tabs.tsx](../components/billing/financials-tabs.tsx) beside Overview and AP/AR. Columns: Date, Type, Direction, Party (links to the entity rollup), Project, Number, Category, Amount (CAD with original-currency sub-line), Status, Doc (paperclip or red "missing"), open-in-Drive. A sticky filter bar drives `filterLedger` (type, direction, party, project, status, date range, "missing document only"); a group-by control (None / Project / Entity / Month) drives `groupLedger` with subtotal rows. All filtering and grouping is client-side over the prefetched array, the way the AP/AR tab already ships its rows.

`exportLedgerCsv` in [finance-actions.ts](../app/(app)/financials/finance-actions.ts) is refactored to consume `toLedgerEntries`, so the CSV finally includes `ConsultantPayout`s and is byte-for-byte the same set as the on-screen GL. **This single change fixes "payouts not in Financials" and could ship standalone with zero migration.**

### 2. The cross-reference (payment ↔ invoice)

One nullable column: `ConsultantPayout.settledByBillId String?` with a relation to `Bill` (`onDelete: SetNull`). It points a payment we made at the bill that justifies it. Not unique, so many payouts can settle against one lump invoice. The reverse (`Bill.settledPayouts ConsultantPayout[]`) is a back-relation, no column.

How YW-S1-001 gets linked:

1. In the ingest review card, `createBillFromProposal` ([ingest/actions.ts](../app/(app)/ingest/actions.ts)) gains an optional `{ settledPayoutIds }`. When the proposal is matched to a project that has outstanding/paid payouts for a consultant whose name matches the bill vendor, the card offers "Link to Jack's payout(s) on Yardworks." Selecting them sets `settledByBillId` on each payout in one transaction. (Gating note below.)
2. For payouts created before the invoice arrives, an "Attach invoice" control on the Team Ledger and the entity rollup lets an MP link an existing unattached bill (or upload one). A new MP-gated server action `linkPayoutToBill(payoutId, billId)` writes the FK plus an `AuditLog` row in one transaction (canonical persistence recipe).

### 3. Per-entity rollup

"View Jack" shows every invoice, payout, and fronted expense for him.

- **v1 (no new routes):** the GL's group-by-Entity mode. `groupLedger(entries, "entity")` collapses rows under each party with subtotals, so clicking into Jack's group is the GL scoped to `entityKey = consultant:<jack>`. This satisfies the "view Jack" ask with zero new routes.
- **Follow-on (recommended after v1):** a dedicated `app/(app)/financials/entity/[kind]/[id]/page.tsx` (RSC, MP-gated) with header KPIs, the reused GL table pre-filtered to one `entityKey`, and a linked-pairs panel. `[kind]` is `consultant | client | partner | vendor | external`; free-text vendors are addressed by a name slug.

Money out on an entity page is **broken out by channel** (pay via payout, reimbursement via `Expense.paidByConsultantId`, vendor invoice via bill), never one blended "paid out" number. A reimbursement is money we owe someone back for fronting a cost; folding it into "paid Jack" would imply we paid him more than we did.

### 4. Missing-document flags + the dismiss policy

Every row gets a derived `hasDocument`, one rule per source, computed in `toLedgerEntries`:

| Source | `hasDocument` is true when |
|---|---|
| Invoice (AR) | status is not `draft` (a sent/paid invoice is self-documenting; a draft flags "not issued") |
| Bill (AP) | `driveUrl` is set (the vendor PDF/image is filed) |
| Expense | `!needsPhoto` (reuse the existing flag; CRA-computed mileage auto-satisfies) |
| ConsultantPayout | a linked bill exists AND that bill has a `driveUrl`, **OR** `invoiceWaivedReason` is set |
| Commission | always true (internal accrual, no external doc expected) |

Surfacing: a red "missing" tag inline on the GL row, a "missing document only" filter, and a pinned **Exceptions** card (count + dollar exposure) grouped by entity with inline actions (upload for bills/expenses, attach-invoice for payouts). Flags are computed, never stored, so they self-heal the moment a doc is filed or a link is made.

**Dismiss with a reason (Jason's decision):** a paid payout that legitimately will never have an invoice (an informal e-transfer) can be cleared by a managing partner. This needs persistence, so it adds one nullable column: `ConsultantPayout.invoiceWaivedReason String?` (null means not waived; any text means waived, and the text is the reason). A second action `waivePayoutInvoice(payoutId, reason)` (MP-gated, writes the column + an `AuditLog`) sets it. The waiver reason renders on the row so the exception is cleared with an audit trail, not silently hidden.

---

## Totals semantics (the anti-double-count contract)

Two explicit measures, computed only in `ledgerTotals`. No view sums `amountCad` inline.

- **Cash out** = sum of `out` entries where `cashMoved` is true AND `countsAsCashOut` is true. Excludes `void` and `draft`.
- **Committed out** = sum of `out` entries that are owed / received / approved (excludes void, draft, and already-counted cash).
- **Money in / received** = the AR side, unchanged from today.

`dedupeCashOut` sets `countsAsCashOut = false` on the **bill** side of a linked payout↔bill pair (the payout is the cash; the bill is the document), and only when a confirmed link exists. A lone payout with no bill keeps `countsAsCashOut = true` (it is still cash that left). A lone bill with no payout keeps `countsAsCashOut = true`. Amount-match check uses `Bill.amount` (subtotal), never `Bill.total`, so GST does not fire false variance alarms once the firm registers.

Worked example, Jack: payout $5,000 (paid) + Bill YW-S1-001 $5,000 (received), linked.
- Both rows render (audit).
- `countsAsCashOut` is false on the bill, true on the payout.
- Cash out counts $5,000 once. Correct.
- If only the payout exists: $5,000 once. If only the bill exists: $5,000 once. No under-count.

---

## The reconciliation that must not be skipped

The existing AP/AR tab keeps its own inline sums ([financials-tabs.tsx:114-138](../components/billing/financials-tabs.tsx#L114-L138): `totals.ap = outstandingBills.reduce(...)`, plus the Aging buckets). If the new GL ships beside it untouched, the codebase has two summing paths and the GL's deduped cash-out total will disagree with the AP tab's gross AP total on every linked pair. That contradicts the whole point ("one table, correct totals").

Required, pick one:

- **(a)** Refactor `ApArView` to consume the same `LedgerEntry[]` / `ledgerTotals`, so all firm-money totals share one summing path. Preferred.
- **(b)** Keep them separate but scope and label them as different measures and never present them as the same number: AP tab = "outstanding bills only"; GL = "all cash movement, deduped." Acceptable if (a) is too large for the first cut.

---

## Phasing

### Phase 1 — GL spine + entity rollup + compliance flags. No migration. Ships immediately.

- Build `lib/finance-ledger.ts`, `ledger-data.ts`, the Ledger sub-tab, group-by-entity, the Exceptions card, all over **existing columns only**.
- Refactor `exportLedgerCsv` onto the normalizer (payouts now included).
- Reconcile the AP/AR totals per the section above.
- `dedupeCashOut` runs in **heuristic** mode (the link column does not exist yet): an exact-CAD, same-project, 60-day match between a bill and a payout is surfaced as a yellow "possible duplicate, link to confirm" chip. It does **not** auto-dedupe, because we never silently drop money on a guess.
- **Do not present one blended money-out number in Phase 1.** Show Payouts-out and Bills/Expenses-out as separate figures (group-by keeps them in separate groups). A single "money out = $10,000" total for Jack's $5,000 payment would be a real, shipped, 2x-inflated number that a managing partner reads at face value. The blended, correct total arrives in Phase 2 with the link.
- All new reads inside the existing `P2021 / 42P01` try/catch so a pre-migration deploy degrades to today's behaviour.

### Phase 2 — exact cross-reference. Migration-gated (Jason applies).

- Schema: add `ConsultantPayout.settledByBillId String?` (+ relation, + `@@index`) and `ConsultantPayout.invoiceWaivedReason String?`. Both additive and nullable.
- Prepare the SQL for the **db-execute + migrate-resolve** recipe (never `prisma migrate dev`, the `PrototypeRun.kind` drift makes it want to RESET prod). Jason applies it manually.
- After apply: extend `createBillFromProposal` with the link, add `linkPayoutToBill` / `waivePayoutInvoice`, wire "Attach invoice" on the Team Ledger and the Exceptions card, flip `dedupeCashOut` from heuristic to exact, and present the single correct cash-out total. Backfill YW-S1-001 → Jack's payout from the UI (data-only, optional).
- `ledger-data.ts` starts selecting the new columns **only here** (see migration safety).

### Phase 3 — polish. No migration.

Dedicated per-entity routes, free-text-vendor "promote to consultant," saved filter presets, month roll-forward, server-side pagination if the client array outgrows a comfortable payload, GST/total consistency pass on registration.

---

## Migration safety

The page-level try/catch ([page.tsx:241-248](../app/(app)/financials/page.tsx#L241-L248)) catches `P2021 / 42P01` (table does not exist). It does **not** catch `42703 / P2022` (column does not exist). So in Phase 1, `ledger-data.ts` must select **only existing columns**. Selecting `settledByBillId` or `invoiceWaivedReason` before the migration would throw an uncaught undefined-column error and 500 the page. Add those selects strictly in Phase 2 after the migration runs (or broaden the catch to include `42703 / P2022` if any Phase 1 read could touch them).

---

## MP-gating (firm-money invariant)

The GL exposes contractor pay, vendor spend, and margins in one place. Every new route, tab, and mutation is managing-partners-only.

- Page renders: `currentIsManagingPartner()` guard + redirect, matching [financials/partners/page.tsx](../app/(app)/financials/partners/page.tsx).
- Mutations: `requireManagingPartner()` on `linkPayoutToBill`, `waivePayoutInvoice`, and any unlink.
- Ingest exception: `createBillFromProposal` stays ungated (filing a bill is data entry), but the **payout-suggestion picker** in the ingest card renders only when `currentIsManagingPartner()` is true. A non-MP partner can still file the bill; only an MP sees the payout amounts and sets the link.
- Team Ledger: confirm the new linked-bill UI renders only inside the existing `managingPartner` conditional on the project page (the financials tab render is already gated; the pre-existing payout mutations in [payout-actions.ts](../app/(app)/projects/[id]/payout-actions.ts) are auth-only, flagged separately below).

---

## The Jack YW-S1-001 walkthrough (end to end, post-Phase-2)

1. YW-S1-001 sits in the ingest. The card detects a vendor bill and matches the Yardworks project.
2. The MP reviewer clicks "Add to AP," and the card offers "Link to Jack Nyrose's payout(s) on Yardworks" (his paid e-transfer).
3. `createBillFromProposal` files the `Bill` (`vendor = "Jack Nyrose"`, `number = "YW-S1-001"`, `driveUrl` from the attached PDF) and sets `settledByBillId` on the payout(s) in one transaction.
4. In the GL: both rows show, linked by a chip. Cash-out counts $5,000 once. The payout's red "no invoice" flag clears (the linked bill has a doc).
5. In Jack's entity rollup: the payout sits beside the invoice that justifies it, under "Payouts," separate from any reimbursement or vendor bill.
6. If a future payout to Jack will never get an invoice, an MP clicks "no invoice required," types a reason, and the flag clears with an audit row.

---

## Interim (before any build)

Jack's invoice can be filed today via the existing "Add to AP" button in the ingest review, which creates a `Bill`. It will not be linked to his payout or appear under his name until Phase 2, but it stops sitting unprocessed.

---

## Files touched (for when a phase is greenlit)

| File | Phase | Change |
|---|---|---|
| [lib/finance-ledger.ts](../lib/finance-ledger.ts) | 1 | NEW pure normalizer + totals + filter/group + compliance rules |
| [app/(app)/financials/ledger-data.ts](../app/(app)/financials/ledger-data.ts) | 1 | NEW single fetch wave → `toLedgerEntries` |
| [components/billing/ledger-table.tsx](../components/billing/ledger-table.tsx) | 1 | NEW GL table (filter bar, group-by, totals footer, Exceptions) |
| [components/billing/financials-tabs.tsx](../components/billing/financials-tabs.tsx) | 1 | Add MP-only Ledger tab; reconcile AP/AR totals onto the normalizer |
| [app/(app)/financials/page.tsx](../app/(app)/financials/page.tsx) | 1 | Call `ledger-data`, pass entries through |
| [app/(app)/financials/finance-actions.ts](../app/(app)/financials/finance-actions.ts) | 1 / 2 | Refactor `exportLedgerCsv` (1); add `linkPayoutToBill` / `waivePayoutInvoice` (2) |
| [app/(app)/ingest/actions.ts](../app/(app)/ingest/actions.ts) | 2 | `createBillFromProposal` accepts + sets the payout link (MP-gated picker) |
| [components/billing/team-ledger.tsx](../components/billing/team-ledger.tsx) | 2 | Per-payout invoice status + "Attach invoice" + entity links |
| [prisma/schema.prisma](../prisma/schema.prisma) | 2 | `ConsultantPayout.settledByBillId` + `invoiceWaivedReason` + index (additive, nullable) |
| [lib/types.ts](../lib/types.ts) | 2 | Mirror the new nullable fields |
| `app/(app)/financials/entity/[kind]/[id]/page.tsx` | 3 | NEW dedicated entity drill-down |

---

## Open items / deferred

- **External commission recipients** (`DealSourceCommission` / `ProjectSourceCommission` with an `externalName`, no Partner or Consultant row) need an `external` entity kind so the per-entity rollup is complete. Folded into the `party.kind` union above.
- **Free-text vendor merging:** grouping bills by vendor-name slug can merge two similar names or split one spelled two ways. The "promote to consultant" action (Phase 3) is the cleanup path.
- **Client array size:** Phase 1 ships the full ledger to the client. The AP/AR tab already caps expenses at 100; add a sane cap and flag server-side pagination for Phase 3.
- **Pre-existing un-gated payout mutations:** `markPayoutPaid` / `updatePayout` / `markPayoutConfirmed` in [payout-actions.ts](../app/(app)/projects/[id]/payout-actions.ts) are auth-only, not MP-gated. Out of scope here, but it weakens the "firm money is MP-gated" invariant. Flag to Jason as a separate fix.
- **GST:** today `gstBps = 0` everywhere, so subtotal equals total and the math is clean. On registration, confirm the normalizer consistently uses the subtotal for cash math and the total only for AR/AP accrual views.
