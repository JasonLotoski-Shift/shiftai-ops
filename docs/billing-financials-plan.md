# Billing & Financials — v2 plan

> **Status:** Built in code (2026-06-05), pending the prod migration. Extends the
> billing/financials slice of [business-model-v2-plan.md](business-model-v2-plan.md)
> using Jason's four scoping decisions below.
>
> **Build state:** all code for Phases 0–4 + the create-project enabler is written and
> type-clean *except* for the generated Prisma client, which can't be regenerated until
> the migration runs (the 13 remaining tsc errors are all stale-client references to
> `sentAt` / `subscription` / `buyout`). **The one gated step is the prod migration**
> ([prisma/migrations/20260605120000_billing_v2_sent_at_project_type/migration.sql](../prisma/migrations/20260605120000_billing_v2_sent_at_project_type/migration.sql)):
>
> ```
> npx prisma migrate deploy   # applies the ADD COLUMN + RENAME VALUE + ADD VALUE
> npx prisma generate         # regenerates the client → tsc + build go clean
> npm run build               # verify before pushing
> ```
>
> Until Jason runs that, prod is unchanged and the new code is not deployed.

This doc came out of a "billing needs work — sitdown and think through" note. The short
version: the estimate→schedule→economics chain is ~70% of the way to "billing auto-builds
from the estimate," and two of the original note's six items were already done. The real
work is three engagement-type changes plus one quick fix.

---

## The decisions (Jason, 2026-06-05)

| Question | Decision |
|---|---|
| Does one estimate model build + subscription + buyout together? | **No — one engagement = one project = one estimate.** A later subscription is a *new* project; a buyout is a *new* project. |
| How does a subscription bill? | **Month by month** (one installment/invoice per month, rolling — not N months pre-generated). |
| How is a buy-out priced/triggered? | **24× monthly price, or a set fee.** "Won't matter much for now" — a manually entered value is fine. |
| Does the 10/15/75 firm split apply to subscription / buyout? | **Not for buyout.** Subscription split only matters if the project *started* as a monthly build — edge case, deferred. **Manual rate entry is an acceptable escape hatch everywhere.** |

The recurring theme across all four: *as long as we can enter the rates/values by hand, that's fine for now.* This keeps the build small.

---

## What's already built (verified against the code)

The deal-won path already auto-builds most of the chain:

```
Estimate (lines: hours × pay/bill rate, manually overridable)
  → totalValue = Σ non-extra (hours × billRate)          estimate-actions.ts:42-55
  → deal won: convertDeal copies estimate lines → ProjectEconomicsLine   actions.ts:150-167
            + sets project value/budgetFee                                actions.ts:141
            + AUTO-GENERATES the billing schedule (50/25/25 or monthly)   actions.ts:177-184
  → BillingInstallments raised into Invoices (draft → sent → paid)        billing-actions.ts:483-575
  → Financials rolls up via allocateLaborRevenue 10/15/75 split           economics.ts:107-140
```

Two items from the original note are **already done**:

- **"Financials under the Firm title on nav"** — it already is, first item under `FIRM` in [components/sidebar.tsx](../components/sidebar.tsx).
- **"Commission and billing settings"** — they exist per-project on the Financials tab ([components/billing/origination-editor.tsx](../components/billing/origination-editor.tsx)): commission %, contract type, schedule type, attributed partners. What's missing is a *firm-wide* defaults page (see Phase 4 below).

**Manual rate entry already works** — the estimate editor has free `$ pay` / `$ bill` inputs per line ([estimate-editor.tsx](../components/billing/estimate-editor.tsx) L271–272); rates default from the rate card but every line is overridable. So decision Q4's "manually add the rates is fine" is satisfied today, no build needed.

---

## What changes

### 1. ProjectType enum migration (the gated prod migration)

Same change already specced in [business-model-v2-plan.md](business-model-v2-plan.md), and Jason's
"one engagement = one project" answer **resolves that doc's open question** (was buyout a
ProjectType or a conversion event on a subscription?) → **buyout is its own ProjectType**, because
it's its own project.

- Current (`prisma/schema.prisma` L233–238): `discovery_report · pilot_project · monthly_project · full_build`
- Proposed: rename `monthly_project` → `subscription` in place; add `buyout`
- Result: `discovery_report · pilot_project · full_build · subscription · buyout`

`ALTER TYPE ... RENAME VALUE` + `ALTER TYPE ... ADD VALUE`. **Hits live prod Supabase — gated on Jason.** (The separate `run → operate` ProjectPhase rename is a brand-vocabulary change tied to the 3-of-3 positioning vote; not a billing dependency, track it with the v2 doc.)

### 2. Subscription billing — month by month (the one real gap)

The v2 plan's "subscription = `monthly_even`, no new billing model needed" is **incomplete**.
Verified: `monthlyEvenSchedule` *requires* a fixed `targetEndDate` and emits a bounded set
("Month i of N") — `lib/billing/schedule.ts:42-69`, and `Project.targetEndDate` is non-nullable.
That's a fixed-term retainer, not an open-ended month-by-month subscription.

Per Jason's "month by month":

- **MVP (no new code):** a subscription project bills one month at a time using the existing
  manual installment path — `createInstallment` ([billing-actions.ts](../app/(app)/projects/[id]/billing-actions.ts) L55–98, `trigger: manual`) + raise invoice. A partner adds next month's line when they bill it. Matches "manually add is fine."
- **Later (Phase 5 agent):** a scheduled monthly generator that opens the next installment +
  draft invoice automatically. This is a natural fit for the autonomous-agent layer, not a
  blocker now. **Log it so it isn't silently dropped.**

Open sub-decision for later: does a subscription carry an estimate at all, or just a flat
monthly price entered on the project? For MVP, a flat monthly value on the project is enough.

### 3. Buyout — single lump sum, exempt from the split

- Project with `projectType = buyout`; value entered by hand (24× monthly or a set fee — no
  formula in the tool, matching the v2 doc's "the tool just needs the type, not a pricing rule").
- Billed as **one installment** (today: one manual `createInstallment` + invoice — works now;
  a dedicated single-stage schedule shape is a nicety, not required).

### 4. Firm 10/15/75 split — buyout carve-out

`allocateLaborRevenue` ([economics.ts](../lib/billing/economics.ts) L107–140) takes no
`projectType` and is called uniformly (`projects/[id]/page.tsx:202`, `financials/page.tsx:43`).
To exempt buyout, pass `projectType` and skip the split (or branch before the call).

**Likely cheaper than it looks:** the split runs on `laborBillable = Σ(hours × billRate)` of
`ProjectEconomicsLine`s. A buyout project that has no hours-by-tier lines → `laborBillable = 0`
→ the split is already a no-op. **Build-time check:** confirm the firm Financials rollup still
counts buyout *cash-in* (its installment/invoice) correctly and doesn't drop or double-count it,
since that revenue lives on the installment, not on economics lines. Subscription split is
deferred (edge case only when it started as a monthly build).

### 5. Quick win — back-datable sent/paid dates (independent of everything above)

From the note's first bullet ("manually override that an invoice was sent with date selection").
Verified: Invoice has `issuedAt` / `dueAt` / `paidAt` but **no `sentAt`**, and `markInvoiceSent`
writes no date at all (`invoices/[id]/actions.ts:25-62`). `markInvoicePaid` stamps `new Date()`,
so a payment logged Friday for a cheque that cleared Tuesday records Friday.

- Add `sentAt DateTime?` to Invoice (small migration — still hits prod Supabase, needs the nod).
- `markInvoiceSent` / send modal: optional date picker, defaults to today.
- `markInvoicePaid`: accept a date instead of always `new Date()`.

Note: the manual-log path (`markInvoiceManual`) already accepts an `issuedAt` — this extends the
same idea to the in-tool sent/paid transitions.

### 6. Firm-wide Settings page (the remaining "billing settings" gap) — lower priority

Today commission/schedule settings are per-project; the firm Settings nav item is disabled
("Soon"), and rate tiers are seed-only with no edit UI. A small Settings page to manage the
rate card + per-type defaults would close the note's "billing settings?" item. Not blocking.

---

## Build sequence

| Phase | Work | Gated on |
|---|---|---|
| 0 (now) | `sentAt` + back-datable sent/paid (item 5) | small migration → Jason's nod |
| 1 | ProjectType enum migration: add `subscription` + `buyout` (item 1) | **Jason approves prod migration** |
| 2 | Buyout: projectType, manual lump-sum installment, split carve-out + rollup check (items 3, 4) | after Phase 1 |
| 3 | Subscription month-by-month MVP (manual path); log the future monthly-generator agent (item 2) | after Phase 1 |
| 4 (optional) | Firm Settings page: rate card + defaults (item 6) | none |

---

## Gated on Jason (do not execute)

- The **ProjectType prod migration** (Phase 1) — and the small `sentAt` migration (Phase 0).
- The `run → operate` brand rename rides with the **3-of-3 positioning vote**, not billing.
