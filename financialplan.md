# Financials & Billing Restructure — Build Plan

> **Status:** Plan approved for authoring 2026-06-01. Not yet built.
> **Owner:** Jason. **Scope:** ~5 phases / 5+ commits. Each phase ends green (`npx tsc --noEmit` + `npm run build`) and is independently shippable.
> **Source of truth:** MASTER INFO (primary) + shiftai-firm `firm-economics.md` / `comp-structure.md` (secondary). This doc reconciles the two; where they conflict, the decision is recorded below.

---

## 0. Decisions locked (2026-06-01)

| # | Decision | Choice |
|---|---|---|
| D1 | Commission semantics | **Origination model** — % of **labor revenue only** (direct costs excluded), default **10%**, **first-contract-per-client only** (rolls to firm pool after), **splittable up to 2** attributees, **internal-only** (never on the client invoice). Configurable % override per project. |
| D2 | Standard billing schedule | **Keep 50/25/25** as the default for pilots/projects. Add a **monthly-even** generator for **retainer**-type engagements only. Commission/origination is a separate internal allocation — it does **NOT** reduce the client billing schedule. Schedule = full project value. |
| D3 | Estimate feature | **New `Estimate` entity** attached to a **Deal**, **versionable**, converts into the project's `ProjectEconomicsLine`s + proposal breakdown when the deal is won. |
| D4 | Build order | **Full written plan first** (this doc), then execute phases in order. |

### Hard invariants (enforce in code — from firm-economics.md §3, §7, §11)

1. **No markup multiplier anywhere.** `price = Σ(hours × bill_rate) + direct_costs_at_cost`. Never `÷ 0.75` or `× 1.333`. The 10/15/75 split lives **inside** the bill rate already. (The retired formula still lingers in the scope skill — do **not** reintroduce it. Add a code comment guard.)
2. **Direct costs never enter the 10/15/75 split** and carry no margin — pass through at cost.
3. **Origination only on the first contract per client**; otherwise the 10% rolls into the firm pool.
4. **Tier rates are defaults; per-engagement/per-person overrides allowed** (bill and pay).
5. **The 10/15/75 internal split is internal-only** — never surfaced on a client invoice.
6. **Reconciliation invariant:** `Σ(take-home) + origination + firm reserve = client labor price`. Always balances. Use the worked examples (§Acceptance) as tests.

---

## 1. Current state (what the last overhaul already shipped)

Read end-to-end on 2026-06-01. Accurate as of commit `bd32e39`.

- **Two ledgers exist:** `Invoice` (money in) + `ConsultantPayout` (money out), reconciled per stage.
- **Schedule:** `fiftyTwentyFiveSchedule()` — hardcoded 50/25/25 in [lib/billing/schedule.ts](lib/billing/schedule.ts#L27). `DEFAULT_BILLABLE_RATE_CENTS = 20000` ($200/hr placeholder) at [schedule.ts:14](lib/billing/schedule.ts#L14).
- **Economics:** `ProjectEconomicsLine` (hours × pay/bill per person/role) + `economicsTotals()` computing only `grossMargin = billable − cost` in [lib/billing/economics.ts](lib/billing/economics.ts#L34). **No 10/15/75 split, no origination, no direct-cost concept.**
- **Payouts:** `recomputePayoutsTx()` splits each consultant's cost across non-extra installments proportionally; preserves paid/confirmed ([lib/billing/payouts.ts](lib/billing/payouts.ts#L19)).
- **Rates:** per-consultant `Consultant.defaultPayRateCents` + the single $200 placeholder bill rate. **No tier rate card.**
- **UI:** billing renders **inline on the project page** ([app/(app)/projects/[id]/page.tsx](app/(app)/projects/%5Bid%5D/page.tsx)) via `ProjectFinancials`, `EconomicsEditor`, `ScopePricingPanel`, `TeamLedger`, `ChangeThread`. **Not a tab.**
- **Tabs pattern:** local `useState` + `<Tabs>` (see [components/client-detail-tabs.tsx](components/client-detail-tabs.tsx)). **Not URL-routed** — a problem for the "more info → Financials tab" cross-link (see Phase 3).
- **Sidebar:** `/invoices` labeled "Billing" ([components/sidebar.tsx](components/sidebar.tsx#L35)). No `/financials` route.
- **Missing entirely:** tier rate card, 10/15/75 split, origination/commission, manual-invoice flag, Estimate entity, firm-revenue dashboard, direct-cost lines, GST handling.

### Schema models touched (from prisma/schema.prisma)

- `BillingInstallment` (L421), `Consultant` (L460), `ProjectEconomicsLine` (L494), `ConsultantPayout` (L529), `Invoice` (L606), `Project` (L380), `Deal`.
- Enums: `InstallmentTrigger`, `InstallmentStatus`, `PayoutStatus`, `PayoutMethod`, `InvoiceStatus`.

---

## 2. The firm rate card (the canonical numbers we're encoding)

| Tier | Bill/hr | Pay/hr | Margin/hr | Margin % |
|---|---|---|---|---|
| Managing Partner | $450 | $337.50 | $112.50 | 25% |
| Senior Consultant | $400 | $240 | $160 | 40% |
| Intermediate Consultant | $325 | $195 | $130 | 40% |
| Junior Consultant | $250 | $150 | $100 | 40% |
| Developer | tier-matched to Jr/Int/Sr | — | — | — |

- **Developer is not a separate rate row** — it's a role slotted at an existing tier's rates. Model 4 tiers; "Developer" is a label on the line.
- All cents. MP take-home = 75% of the $450 bill rate.
- These are **defaults**; engagements can bill discounted (e.g., Yardworx MP at $300/$225 — still 75% take-home).

### The 10/15/75 split (per dollar of LABOR revenue)

- **10% → origination** — to whoever sourced the contract. **First contract per client only.** Rolls to firm pool otherwise.
- **15% → firm pool** — reserve.
- **75% → labor budget** — pays everyone's pay rate; surplus rolls to firm reserve.
- Firm capture: ~15% MP / ~30% consultant on first contract; ~25% / ~40% on retainers (origination slot rolls in).

---

## 3. Phase plan

Each phase: schema → migration → math/helpers → actions → UI → seed → pre-push gate. Build in order; D4 = full plan up front, execute sequentially.

---

### Phase 1 — Rate card + economics 10/15/75 split (foundation)

**Goal:** real tier rates replace the $200 placeholder; economics computes the full internal allocation. No UI move yet.

**Schema (`prisma/schema.prisma`)**
- New model `RateTier`:
  - `id`, `key String @unique` (`mp` | `senior` | `intermediate` | `junior`), `name String`, `billRateCents Int`, `payRateCents Int`, `sortOrder Int`, `active Boolean @default(true)`.
- `ProjectEconomicsLine`: add `rateTierId String?` + relation (records which tier seeded the line; rates stay snapshotted on the line and overridable). Keep existing `fromFirmDefault`.
- **Direct costs:** new model `ProjectDirectCost` ( `id`, `projectId`, `label String`, `amountCents Int`, `notes String?`, `sortOrder Int` ). Pass-through, excluded from the split, included in client price. *(Chose a separate model over an `isDirectCost` flag on economics lines because direct costs are amounts, not hours×rate.)*

**Math (`lib/billing/economics.ts`)**
- Add `DEFAULT_ORIGINATION_PCT = 0.10`.
- New `allocateLaborRevenue({ billableTotal, costTotal, originationPct, isFirstContract })` returning:
  - `origination` = `isFirstContract ? round(billableTotal × originationPct) : 0`
  - `firmPool` = `round(billableTotal × 0.15) + (isFirstContract ? 0 : origination-slot)`
  - `laborBudget` = `billableTotal − origination − firmPool`
  - `takeHome` = `costTotal`
  - `laborSurplus` = `laborBudget − costTotal`
  - `firmReserve` = `firmPool + laborSurplus` (+ origination slot already folded when not first contract)
  - Assert reconciliation: `takeHome + origination + firmReserve === billableTotal`.
- Keep `economicsTotals`/`reconcile`/`costByConsultant`. **Direct costs added to client price only** in a new `projectPrice({ billableTotal, directCosts })` helper. Add the "no markup multiplier" guard comment.
- Replace usages of `DEFAULT_BILLABLE_RATE_CENTS` ($200) with tier lookups; keep the constant only as a last-resort fallback (or delete after seeding tiers).

**Actions / wiring**
- `createEconomicsLine` / `updateEconomicsLine` ([billing-actions.ts](app/(app)/projects/%5Bid%5D/billing-actions.ts#L282)): default pay/bill from the chosen `rateTierId` instead of the $200 constant.
- Direct-cost CRUD actions (create/update/delete) in the same file.

**UI**
- `EconomicsEditor` ([components/billing/economics-editor.tsx](components/billing/economics-editor.tsx)): add a tier picker per line (defaults rates, still editable); add the 10/15/75 allocation summary (origination / firm pool / labor budget / take-home / firm reserve) + a reconciliation badge using the invariant.
- Direct-costs sub-section.

**Seed**
- Seed the 4 `RateTier` rows. Update placeholder consultant pay rates to align with tiers (or tag them to a tier).

**Files:** `prisma/schema.prisma`, `lib/billing/economics.ts`, `lib/types.ts`, `app/(app)/projects/[id]/billing-actions.ts`, `components/billing/economics-editor.tsx`, `prisma/seed.ts`.

---

### Phase 2 — Commission / origination

**Goal:** record who originated each contract and the internal 10% allocation (D1).

**Schema**
- `Project`: add `originationPct Decimal @db.Decimal(5,2) @default(10.00)` and `isFirstContract Boolean @default(true)` (snapshot at signing — defaulted by checking whether the client has a prior won project; editable, no retroactive renegotiation).
- New model `Origination`:
  - `id`, `projectId`, `partnerId` (sourcer), `sharePct Decimal @db.Decimal(5,2)` (split share; the 1–2 rows sum to 100), `notes String?`.
  - `@@index([projectId])`. Support 1–2 rows per project (shared origination), or zero (brand/referral → 0%, rolls to firm pool).

**Math**
- Origination payout = `isFirstContract ? laborBillable × (originationPct/100) : 0`, then divided by each `Origination.sharePct`. Feeds `allocateLaborRevenue`.
- "None" attribution (brand/website) → no `Origination` rows → 10% rolls to firm pool.

**Actions / UI**
- CRUD for `Origination` rows on the project Financials tab; validate shares sum to 100 (when present); validate logged before SOW (soft — audit warning).
- Show origination payout in the economics allocation summary and in the partner's view.

**Files:** `prisma/schema.prisma`, `lib/billing/economics.ts`, billing actions, new `components/billing/origination-editor.tsx`, `lib/types.ts`, seed.

---

### Phase 3 — Financials tab restructure (project + firm-level)

**Goal:** move billing off the project main view into a project **Financials tab**; add a top-level firm-revenue surface. (MASTER INFO: "Billable tab", "more information" link, rename to "Financials".)

**Project detail page**
- Introduce **URL-routed tabs** on the project page (e.g. `?tab=overview|financials|tasks|deliverables`). **This deviates from the existing `useState` tab pattern on purpose** — the "more info" summary link must deep-link into the Financials tab, which requires the tab in the URL.
- **Overview** keeps a compact billing **summary card**: high-level "invoice sent / not sent" per stage + project value/received, with a **"More information →"** link to `?tab=financials`.
- **Financials tab** hosts the full breakdown: `ProjectFinancials` (AR), `EconomicsEditor` (+ Phase 1 split + Phase 2 origination), `ScopePricingPanel`, `TeamLedger` (payouts), `ChangeThread`, direct costs.
- Treat the overview summary and the Financials tab as **different records/views** of the same data (MASTER INFO note). Show the project reference inside the Financials tab for context.

**Firm-level `/financials` route**
- New `app/(app)/financials/page.tsx`. Rename sidebar "Billing" → **"Financials"**; fold the existing `/invoices` dashboard into it (or keep `/invoices` as the raw invoice register and link from Financials — decide at build time; leaning fold).
- Sections: **Firm revenue overview** (total invoiced, paid, AR, firm reserve captured), **Revenue tracking tables** (by project, by client, by tier), **Payables (AP) rollup**. All billing broken down by project.

**Files:** `app/(app)/projects/[id]/page.tsx`, new `components/project-detail-tabs.tsx`, new `components/billing/billing-summary-card.tsx`, `components/sidebar.tsx`, new `app/(app)/financials/page.tsx` (+ view components), possibly move/rename `app/(app)/invoices/`.

**Blast radius:** project page is large and server-rendered; moving sections into a client tab wrapper must preserve `force-dynamic` and keep server-fetched data passed as typed props (don't turn the page into a client component — extract the tab shell as a child per CLAUDE.md "Don't"). URL-param tabs need `searchParams` handling on the server page.

---

### Phase 4 — Manual invoices + schedule + GST

**Goal:** support invoices sent outside the tool (Shane Nolan), retainer schedules, and GST-ready invoices.

**Schema**
- `Invoice`: add `isManual Boolean @default(false)`. Optionally `gstRateBps Int @default(0)` (or a firm-level setting) + store `subtotal`, `gst`, `total` so invoices recompute when GST flips 0%→5%.
- `Project`: add `scheduleType` enum (`fifty_twenty_five` | `monthly_even` | `custom`) default `fifty_twenty_five`.

**Math (`lib/billing/schedule.ts`)**
- Keep `fiftyTwentyFiveSchedule` as default.
- Add `monthlyEvenSchedule(value, startDate, endDate)` — value evenly across the months in the window, remainder to the last month. For retainers.
- `applyStandardScheduleTx` ([lib/billing/apply.ts](lib/billing/apply.ts#L36)) branches on `scheduleType`.

**Actions / UI**
- `markInvoiceManual(projectId, { installmentId?, amount, issuedAt, ... })` — creates an `Invoice` with `isManual = true`, `status = sent`, **no Artifact generation**, links the installment, recomputes payouts. UI: "Mark as manually sent" button alongside "Generate invoice."
- GST line on the invoice render/artifact (default $0.00, configurable). Note invoice numbering stays `SAI-YYYY-NNN` (firm doc shows client-prefix `YW-2026-001` as an option — flag as optional later enhancement).

**Files:** `prisma/schema.prisma`, `lib/billing/schedule.ts`, `lib/billing/apply.ts`, billing actions, `components/billing-schedule-editor.tsx`, invoice render/artifact code, seed.

---

### Phase 5 — Estimate entity (pre-proposal scoping)

**Goal:** estimate a contract value before proposal; default to tier rates; break down by team time; convert to project economics on win (D3).

**Schema**
- New `Estimate`:
  - `id`, `dealId`, `version Int @default(1)`, `status EstimateStatus @default(draft)`, `totalValue Int` (computed from lines, overridable), `notes String?`, `createdAt`, `updatedAt`.
- New `EstimateLine`:
  - `id`, `estimateId`, `role String`, `rateTierId String?`, `hours Decimal @db.Decimal(7,2)`, `payRateCents Int`, `billRateCents Int`, `isExtra Boolean`, `sortOrder Int`.
- New enum `EstimateStatus` (`draft` | `sent` | `accepted` | `superseded`).
- `Deal`: back-relation `estimates Estimate[]`.

**Math / conversion**
- Reuse `economicsTotals` + `allocateLaborRevenue` on estimate lines (same math as project economics) so the estimate previews margin/split.
- On deal **won** → convert the accepted `Estimate`'s lines into `ProjectEconomicsLine`s on the new project; set `Project.budgetFee` from `totalValue`. Versioning: editing a sent estimate creates a new `version` and supersedes the old.
- Proposal generation reads the accepted estimate to break down team time/hours/firm numbers.

**UI**
- **Estimate tab/section** on the Deal page (or within Financials). Line editor mirroring `EconomicsEditor`; defaults rates from tiers, overridable. Versions list. "Convert to project economics" on win.

**Files:** `prisma/schema.prisma`, `lib/types.ts`, new `app/(app)/pipeline/[id]/estimate-actions.ts` (or co-located), new `components/billing/estimate-editor.tsx`, deal page wiring, conversion hook in the deal→project convert flow ([components/convert-deal-modal.tsx](components/convert-deal-modal.tsx)), seed.

---

## 4. Cross-cutting

- **Engagement notes / credit terms** (firm doc §8 — e.g. Yardworx Stage-1+2 fee credits toward a future build): add `Project.commercialNotes String?` (or reuse an existing notes field) so staged/credit terms are stored. Low effort — fold into Phase 3 or 4.
- **Pricing ladder reference** (Pilot / Full Project / Retainer with hour ranges) — informational; can seed as guidance copy on the Estimate tab. Not a hard model.
- **Scope-overrun handling** (change order vs firm-absorb vs consultant-absorb) — already partly modeled via `isExtra`. Document the three cases in the economics editor help text.

---

## 5. Migration & sequencing

Each phase = one `npx prisma migrate dev --name <phase>` locally (Direct URL), `lib/types.ts` update, UI, seed refresh, then push (Vercel hits the same Supabase and sees the new columns). Per CLAUDE.md recipe "Add a new field to a model."

1. `phase1-rate-card-economics-split`
2. `phase2-origination`
3. `phase3-financials-tab` (mostly UI/routing; minimal schema — `commercialNotes` if folded here)
4. `phase4-manual-invoices-schedule-gst`
5. `phase5-estimates`

---

## 6. Acceptance tests (encode as unit tests for `economics.ts`)

From firm-economics.md §10 worked examples — these must reconcile exactly.

**A. 240-hr pilot, 60% MP / 30% Jr / 10% Dev, first contract**
- MP 144 × $450 = $64,800; Jr 72 × $250 = $18,000; Dev 24 × $250 = $6,000 → **labor billable $88,800** + direct costs $1,200 → **client price $90,000**.
- Of $88,800: origination $8,880 · firm pool $13,320 · labor budget $66,600. Labor budget pays $63,000; surplus $3,600. **Firm reserve ≈ $16,920.**

**B. Yardworx pilot (discounted MP rate), first contract**
- Jr (Jack) 39 × $250 bill / $150 pay = $9,750 / $5,850. MP (Jason) 15 × $300 bill / $225 pay = $4,500 / $3,375. **Total billed $14,250.**
- 10/15/75 on $14,250: origination (Jason) $1,425 · firm pool $2,137.50 · labor budget $10,687.50 → take-home $9,225 + surplus $1,462.50.
- Lands: **Jack $5,850 · Jason $4,800 ($3,375 + $1,425 origination) · firm $3,600.**

**Invariant test:** `takeHome + origination + firmReserve === clientLaborPrice` for both. Direct costs excluded from the split.

---

## 7. Pre-push gate (every phase) — from CLAUDE.md

1. `npx tsc --noEmit` clean.
2. `npm run build` clean.
3. **What's new:** add a dated, plain-English entry to [lib/data/updates.ts](lib/data/updates.ts) for anything a partner would notice (new tab, commission field, manual-invoice button, estimates).
4. **How it works:** update the How-it-works page if a flow changed or was added.
5. Re-seed local if fixtures changed (`npx tsx prisma/seed.ts`).

---

## 8. Open items to confirm before/while building

- **Phase 3:** fold `/invoices` into `/financials`, or keep both? (Leaning fold; confirm at build time.)
- **GST (Phase 4):** firm-level setting vs per-invoice field? Default 0% either way.
- **Invoice numbering:** keep `SAI-YYYY-NNN` or move to client-prefix (`YW-2026-001`)? Currently keeping `SAI-`.
- **`isFirstContract` default:** auto-derive from "client has a prior won project?" at project creation, then editable. Confirm the auto-derive is wanted vs. always manual.
- **Direct costs model vs flag:** plan uses a separate `ProjectDirectCost` model — confirm acceptable.

---

*End of plan. Reopen this file (`financialplan.md` at repo root) to resume. Next action when ready: start Phase 1 (rate card + economics split).*
