# Financials Rebuild Plan

> Status: PROPOSAL, 2026-06-29. Nothing built. Blocked on three firm-money decisions from Jason (see "Decisions that gate the build"). Supersedes the scattered 3-tab Financials structure. Pairs with [financials-gl-restructure-plan](../../shiftai-ops) GL work already shipped.
>
> How this was produced: a full current-state map (data model, 42 actions, every UI surface, the deal/commission model), web research on cashflow / AR / AP / project-profitability display patterns, then a 17-agent design pass (6 gap analysts, 3 competing architectures scored by a 3-judge panel, an economics redesign with an adversarial reviewer, a preservation/migration planner, and a completeness critic).

---

## 1. Why rebuild

The Financials area today is 3 tabs (Overview, Ledger/GL, AP/AR) plus a `/financials/partners` sub-route, and the same money is shown in up to three places:

- Accounts receivable appears in 3 surfaces, with two outstanding-AR totals computed by different code paths that can disagree.
- Money-out is summed in 2 surfaces with two separate dedup implementations.
- Project revenue appears in 2 places. Commission appears in 2 places.
- The headline "Net position = AR − AP" KPI is presented as a cash position. It is not. It never touches a real bank balance.

The deeper problem: the system shows flows (invoiced, received, paid), never a position. There is no opening balance, no running balance, no cash-out forecast, no runway. A partner cannot answer the one survival question, "can we cover what is due in the next four weeks."

---

## 2. What is missing today (the catalogue)

Grouped from the gap analysis. High priority unless marked.

**Cashflow (the whole spine is absent)**
- A firm-entered opening bank balance the system carries forward.
- A running / closing balance over time (opening → in → out → closing per period).
- A cash-OUT forecast (bills due, owed payouts, scheduled commission, recurring subscriptions). Today only `bucketCashIn` exists; there is no `bucketCashOut`.
- A combined net projection (forecast in minus forecast out, period by period).
- A 13-week weekly view (today buckets are monthly only).
- A runway metric. A "can we cover what is due" coverage check with a shortfall date.
- DSO/DPO and at-risk flagging on the timeline (medium). Scenario/what-if and FX-timing (low).

**Accounts receivable**
- Auto-overdue: a sent invoice past its due date still reads "sent" with 0 days late. Nothing flips it.
- DSO. A risk-ordered collections worklist. A payment-reminder action that logs the chase.
- Partial / multiple payments against one invoice (today `markInvoicePaid` is all-or-nothing, so AR overstates the moment a deposit lands).
- A 61-90 and 90+ aging split (today everything past 60 days is one bucket). A per-client AR rollup.

**Accounts payable + expenses**
- A forward "what we owe and when" due view.
- One unified payables view merging bills, reimbursements, and subscriptions (today three separate tables). Subscription run-rate and renewal alerts.
- The `approved` bill state is currently unreachable, so there is no approve-to-pay staging. Visibility of reimbursements the firm owes its own team. Per-vendor and per-project expense rollups.

**Project profitability**
- Budget vs actual spend per project. Realization (collected vs billed) as a dollar gap and a rate. Actual margin (recomputed from real spend, not planned rates).
- Overrun / at-risk flags. Budget creatable during the pipeline and authoritative once set. Commission shown inside the economics calc. Commission payout on the installment cadence.

**Commission + origination**
- One unified commission concept inside the economics allocation. Commission paid on the installment cadence (per-stage payout rows). A single owed / paid / remaining commission ledger per payee.

**Data integrity**
- A point-in-time financial snapshot before the rebuild. A persisted `Invoice.driveUrl` (today every invoice's Drive URL in the export is null). A bank-balance anchor and reconciliation. A firm-wide AuditLog export. A dated FX rate instead of the hard-coded USD 1.37 constant. A GST/tax column in the accountant export.

All 42 current actions were checked. Every one has a home in the new shape (the completeness critic verified zero are dropped).

---

## 3. The new shape: cash-first ledger, one home, four working screens

Recommended architecture: **Ledger-Lens with a persistent cash strip.** It won all three judges on lowest build and migration cost because it reuses what already exists. `lib/finance-ledger.ts` is already the one deduped spine (the payout↔bill dedup via `settledByBillId`, `isMissingDoc`, `ledgerTotals`), and it already declares a `commission` ledger type that is never wired. The whole area becomes one table seen through saved views, which kills the duplication by construction: a screen never invents a total, it asks the spine.

### 3.1 Cash-position strip (persistent header on every Financials screen)
Five always-visible numbers. MP-only.
- **Cash on hand** (firm-entered opening balance carried forward by deduped ledger actuals, with as-of date and a stale flag).
- **Coming in 30d** / **Going out 30d** (deduped expected in and out over the window).
- **Projected close 30d** (cash on hand + in − out; red shortfall flag and the date cover runs out).
- **Runway** (months of cover at the current average net monthly outflow).

Replaces the misleading "Net position = AR − AP" KPI with a true position. Clicking the shortfall flag opens the AP pay queue filtered to what breaches cover.

### 3.2 Money (home): the ledger seen through saved views
The single Financials landing surface. A view switcher over the one ledger. Replaces all 3 tabs and the partners sub-route. MP-only.
- **Default Cashflow lens:** period rows (week | month toggle, 13-week / 12-month horizon) with Opening | In | Out | Net | Closing, closing seeding the next opening, negative weeks flagged red, chart above. Committed-only is the default; committed-plus-weighted-pipeline is an explicit opt-in.
- **Due-in-window worklist:** every obligation landing in the horizon (invoice expected, bill due, payout owed, commission slice, subscription renewal), sorted by date.
- **Saved views:** Cash in, Cash out (deduped), AR aging (5 buckets, per-client rollup, top owers, auto-overdue at read time), AP aging (5 buckets, bills + unpaid expenses + subscription renewals merged, reimbursements-owed as a first-class line, undated bills flagged), Needs-a-doc (waiver reason shown), Per-partner (replaces the sub-route).
- **Actions:** all AR / AP / payout / accrual / export actions (1-10, 35-42 today) live here.

### 3.3 Project P&L (per-project profitability)
One project's plan reconciled against actuals pulled from the ledger filtered to `projectId`. Removes the revenue-by-project duplication. Rendered on the project page's financials tab (which now renders THIS, not a parallel computation). MP-only.
- **KPIs:** budget vs actual cost (with over/under flag), true margin (value − actual cost − commission) shown beside planned margin as a labeled pair, realization rate, firm-keeps-after-commission, take-home planned vs actually paid.
- **Lists:** billing schedule with per-stage money-out preview (labour payout + commission payout going out when that stage is collected), economics lines, project-tagged actuals ledger, direct costs, at-risk flags.
- **Actions:** the billing/invoice actions (11-19).

### 3.4 Economics setup (plan one engagement: budget + lines + unified commission + schedule)
The single editor that replaces the three cards you called duplicates: the EconomicsEditor, the OriginationEditor "Commission & billing settings" card, and the deal-source / project-source commission editors. Available during pipeline stages and after convert. MP-only.
- Economics lines editor, direct costs editor, **one unified commission editor**, payment schedule editor with a "split commission across the schedule" toggle.
- **Actions:** economics lines (20-22), direct costs (23-25), the commission actions (26-34) re-presented as one editor, plus new set-budget-during-pipeline and add-commission-to-schedule.

### 3.5 Export & integrity (the trust + diligence surface)
A thin surface for getting data out and proving it is trustworthy. Owns the opening-balance reconciliation, the FX rate, the firm-wide audit export, and the pre-rebuild snapshot. MP-only. This is where step (d), save current financials before rebuilding, becomes a real run-and-verify action.

**Removed:** the Overview tab, the Ledger/GL tab, the AP/AR tab, the `/financials/partners` sub-route, the standalone 12-month cash-in calendar, the "Net position" KPI, the three separate commission cards, the duplicate revenue-by-project computation. All become views/KPIs on the four screens above.

---

## 4. The three deal-economics asks

### Ask 1: budget creatable during pipeline, overrides the estimate
- ADD `Deal.budgetFee` (Int?, nullable). A new MP action `setDealBudget` writes it. The deal page gains a Budget field beside `valueEstimate`.
- One resolver `authoritativeBuildValue()`: pre-convert `Deal.budgetFee ?? acceptedEstimate.totalValue ?? Deal.valueEstimate ?? 0`; post-convert `Project.budgetFee`. Budget overrides estimate once set, estimate is the fallback, exactly as you said.
- At convert, `Project.budgetFee = Deal.budgetFee ?? acceptedEstimate.totalValue ?? Deal.valueEstimate ?? 0`. Every commission line with `basis=build_value` computes against the authoritative value, closing today's gap where deal-source used `valueEstimate` and project-source used `budgetFee`.

### Ask 2: commission shown inside the economics calc, remove the duplicate field
- ONE concept, `CommissionLine`, added inside the economics card. It replaces the four current surfaces (DealSourceCommission, ProjectSourceCommission, Origination, the billing-settings card). Fields express the genuinely-distinct dimensions on one row: `payee` (Partner XOR external), `kind` (source vs origination), `basis` (labor_revenue vs build_value), `buildPct` + optional `recurringPct` + `coveredMonths`.
- It enters the calc: `allocateLaborRevenue()` gains a `commissionLines` argument so the project economics card shows Labour billable, Take-home, Commission (itemized by payee), Firm reserve in one place.
- This removes the duplicate SURFACE and re-presents the underlying actions (26-34) as one editor. Zero capability dropped.

### Ask 3: commission payout on the payment schedule
- ADD model `CommissionPayout`, modelled exactly on the proven `ConsultantPayout` pattern: `amount`, `status` (owed|paid|confirmed), `method`, `commissionLineId`, `installmentId` (build stream, one row per non-extra installment), `settledByBillId?` + `invoiceWaivedReason` for reconciliation.
- A `recomputeCommissionPayoutsTx` mirrors `recomputePayoutsTx`: split the build slice across non-extra installments proportional to stage amount, remainder to the last stage, only `owed` rows recompute, paid/confirmed preserved. The earner is paid 50/25/25 as the firm collects each stage.

---

## 5. The critical caveat (adversarial review: NOT safe to build as-is)

The schedule-payout machinery and the additive schema are sound. The deal-killer: the redesign as first drafted frames a real change to firm economics as math-preservation. Three things are true in the current code and must be decided before any economics code is written.

1. **Source commission is never netted from firm reserve today** (documented firm decision at `schema.prisma:2329-2330`). Origination and source commission are independent additive partner earnings using different denominators (origination on `laborBillable`, source on `budgetFee`). Folding them into one model and netting source out of firm reserve can drive firm reserve negative whenever `budgetFee > laborBillable` (which happens any time there are direct costs) and breaks the protected invariant test in `economics.check.ts` (which asserts `takeHome + origination + firmReserve == laborBillable`, with no commission term and no floor guard).

2. **Origination is report-only today, never paid as cash.** Ask 3 ("commission earner paid on the schedule") would turn the 10% sales pool into a real scheduled cash OUTFLOW that does not exist today. That is a firm-money decision, not a refactor.

3. **External referrers have no payable primitive.** Giving them `CommissionPayout` rows makes them payees the firm owes real cash, but there is no Bill/vendor entity, so `settledByBillId` + `isMissingDoc` would flag every external commission payment as missing-doc forever. Needs a waiver path or a synthetic vendor.

Plus a blast-radius fact: `Project.originationPct` has ~13 non-financials consumers (dashboard, project page, dashboard-views, firm-economics-summary, lib/types). It must stay as a deprecated column for one release, not be dropped in the same wave.

### Resolution: Jason's decisions (2026-06-29)
Jason chose the fuller-economics path on all three gating calls.
- **D2 = net from firm reserve.** Commission now reduces the firm's keep. Firm reserve means "what the firm keeps after commission." This requires: a new allocation that subtracts every commission slice (origination + source + external) from firm reserve; a `firmReserve < 0` clamp; and a rewritten invariant in `economics.check.ts` (the old `takeHome + origination + firmReserve == laborBillable` no longer holds once source commission, based on build value, is netted). Worked examples for a normal project, a project with direct costs (the negative-risk case), a buyout, and a subscription must be specified and tested before cutover.
- **D1 = origination becomes a scheduled cash payout.** Origination-kind commission lines now generate `CommissionPayout` rows on the installment schedule, paid as the firm collects. This is a new firm cash outflow that did not exist before. It needs: the per-partner "total earned" rollup reconciled so origination is counted once (as a payout, never also as an additive earning); and a payable path for external referrers (a waiver path or a synthetic vendor) so their commission payments do not flag missing-doc forever.
- **Sequencing = both together.** Display and commission rebuild ship as one coordinated effort. The migration safety phases (snapshot, additive, parity, destructive-last) still apply; the UI cutover happens once for both.

Ask 2 (unify the editor) and Ask 1 (budget overrides estimate) are met as designed. Budget stays authoritative once set; a later accepted estimate never re-overrides (deterministic resolver).

---

## 6. Decisions that gate the build

- **D1. Origination payout: DECIDED, scheduled cash payout.** Origination is paid on the installment schedule like source commission. Requires the external-referrer payable path and the per-partner double-count fix (Section 5).
- **D2. Commission vs firm reserve: DECIDED, net from firm reserve.** Commission reduces the firm's keep. Requires the new invariant, a `firmReserve < 0` clamp, and worked examples (Section 5).
- **D3. Buyout source-commission rule: DECIDED, no commission on buyout.** Buyout is pure firm capture. No source or origination commission is paid on it. Commission generation skips `projectType=buyout`.
- Defaulted unless Jason objects: budget stays authoritative once set; keep a total-commission warn ceiling when removing the 2-payee cap; drop the `CommissionBase` enum and infer build-vs-recurring from whether the engagement has a ServiceContract; opening balance is one firm bank balance in v1; auto-overdue derives at read time; the cashflow default lens is 13-week weekly with 12-month monthly as a toggle.

---

## 7. Preserve first, then rebuild (the migration plan)

Snapshot-first, additive-first, parity-gated, destructive-last. Never `prisma migrate dev` (drift exists, it would reset prod). All schema changes via db-execute + migrate-resolve.

- **Phase 0 (snapshot, no schema).** Build and run `run-full-snapshot`: a new MP-gated action that reads every money table RAW via Prisma (before any dedup), emits one full-fidelity JSON + per-table CSVs + a frozen computed block (per-project allocation output, firm-wide ledgerTotals, the in-force FX rate with as-of date), files both to a dated Drive folder, and writes a `FinancialSnapshot` / Artifact row plus an AuditLog. Output a table → row-count + dollar-total summary for Jason to verify. Nothing proceeds until confirmed.
- **Phase 1 (additive schema, no behavior change).** Add `Deal.budgetFee`, `Invoice.driveUrl` + invoice partial-payment fields, an opening-balance/reconciliation table, a dated FX-rate table, and the `CommissionLine` + `CommissionPayout` models. All nullable/new, zero existing reads break, the four old commission tables stay authoritative.
- **Phase 2 (new views read OLD data).** Ship the cash strip + Money home + Project P&L reading the existing ledger spine and existing commission tables. The rebuild is observable against real current figures with zero risk to the source of truth.
- **Phase 3 (backfill, dual-source).** Backfill into CommissionLine/CommissionPayout (Origination → origination-kind line; ProjectSourceCommission + linked OngoingContractCommission → one source-kind line with build+recurring; accruals → recurring-stream payouts preserving paid state and paidAt). Calc still reads OLD tables; compare new vs old per project behind a flag.
- **Phase 4 (parity gate + cutover).** Assert per-project and firm-wide that total commission $, total paid commission, and firmReserve from the new calc equal the frozen pre-migration values within rounding. Only then switch the calc to read the new models. Old tables stay as a safety net.
- **Phase 5 (destructive, separate, owner-approved).** After one stable release, drop the four old commission tables + Origination + `Project.originationPct`. Snapshot retained indefinitely.

**Highest data-loss risks:** the `OngoingContractCommissionAccrual` paid-state (its `effectiveAccrualStatus` is a lazy flip, so a started-but-unpaid period reads "accrued" while the column says "projected"; backfill must read the effective status, not the raw column); the origination pool that summed to under 100 (its remainder rolled to firm pool, so parity must be checked on firmReserve dollars, not row counts); unconverted deals carrying DealSourceCommission (must convert before the table is dropped); and the reflex `prisma migrate dev` that would reset prod.

**Acceptance tests as build gates:** (1) `sum(ledger cashOut) == payoutsPaid + billsExpensesPaid + commissionPaid` after wiring the commission normalizer into `finance-ledger.ts`; (2) per-project parity of firmReserve, total commission $, and total paid commission; (3) auto-overdue derivation matches manual aging.

---

## 8. Open questions for Jason

- Opening balance: one firm bank balance entered manually (v1), or one per account (CAD operating + USD)?
- Auto-overdue: derive at read time (cheap, lower risk) or via the nightly cron (authoritative for the accountant export)?
- 13-week weekly as the default lens (Float/Pulse pattern) with 12-month monthly as a toggle, confirm.
- Drop the `CommissionBase` enum (deal_value / total_6mo / total_12mo) and infer build-vs-recurring from whether the engagement has a ServiceContract, confirm no row depends on a 6mo/12mo base the contract term would not reproduce.

---

## 9. Economics math (proven 2026-06-29)

Verified by a designer plus three adversarial verifiers across positive, boundary, buyout, subscription, and negative-reserve cases. All four worked examples and the invariant hold. Verdict: safe to build, with the corrections below mandatory.

### 9.1 The new allocation
`allocateLaborRevenue({ laborBillable, takeHome, directCosts, originationPct, isFirstContract, commissionLines, authoritativeBuildValue, isBuyout })`:
1. **Buyout short-circuit:** if `isBuyout`, return `firmReserve = authoritativeBuildValue`, all of takeHome / origination / commission = 0, ignore commission lines (D3). No CommissionLine or CommissionPayout rows.
2. **Origination from the labour pie** (base = laborBillable): `originationFromLabour = isFirstContract ? round(laborBillable * originationPct) : 0`. On a non-first contract the slot stays inside firm reserve.
3. **Firm reserve before source:** `firmReserveBeforeSource = laborBillable - takeHome - originationFromLabour`. This equals the old `firmPool + laborSurplus`.
4. **Source commission netted from reserve** (base = authoritativeBuildValue, the hazard): for each source line in `sortOrder` order, `buildSlice = round(buildPct/100 * buildValue)`; `sourceCommissionTotal = sum(buildSlice)`.
5. **Clamp:** `rawFirmReserve = firmReserveBeforeSource - sourceCommissionTotal`; `firmReserve = max(0, raw)`; `firmReserveDeficit = max(0, -raw)`.

Origination and source never share a base: origination is a slice of labour, source is funded from reserve against the build value. That separation is what makes the math clean.

### 9.2 The invariant (two-part, conditional)
- **Always (exact labour-pie):** `takeHome + originationFromLabour + firmReserveBeforeSource == laborBillable`.
- **When deficit == 0:** `takeHome + originationFromLabour + sourceCommissionTotal + firmReserve == laborBillable`.
- **When deficit > 0:** `takeHome + originationFromLabour + sourceCommissionTotal == laborBillable + firmReserveDeficit`.
- **Buyout:** `firmReserve == authoritativeBuildValue`, all commission 0.

`economics.check.ts` asserts the labour-pie identity always, then branches on `deficit == 0` for the matching full form, plus the buyout assertion. It must never assert a single unconditional full identity.

### 9.3 The clamp decision (firm-reserve floor)
Clamp displayed firm reserve at zero and surface `firmReserveDeficit` as a loud red flag on the Project P&L and the economics editor ("this engagement pays out X more commission than it earns"). The commission payouts are still generated at full promised value (the firm honours the contract); the warning fires before signing. The clamp blocks nothing, mirroring how `reconcile()` is warn-only today. Rejected alternatives: allowing negative reserve (renders as a real money number that pollutes rollups) and capping commission at available reserve (silently underpays a contracted commission and breaks the parity gate).

### 9.4 Worked examples (all verified)
- **(a) Normal first-contract, no direct costs:** laborBillable 88800, takeHome 63000, build 88800; origination 10%, source 5%. → originationFromLabour 8880, firmReserveBeforeSource 16920, source 4440, firmReserve 12480, deficit 0.
- **(b) First-contract WITH direct costs (the negative case):** laborBillable 14250, takeHome 9225, directCosts 35750 so build 50000; origination 10%, source 10%. → origination 1425, before 3600, source `round(0.10*50000)=5000`, raw `3600-5000=-1400`, firmReserve clamped 0, deficit 1400. The source base is the build value (50000, including direct costs), not the 14250 labour pie, so the commission exceeds the reserve. Red flag fires; payouts still generated at 1425 + 5000.
- **(c) Buyout:** value 100000 → firmReserve 100000, zero commission, zero rows.
- **(d) Subscription:** laborBillable 40000, takeHome 26000, build 40000, monthlyFee 8000, term 12; origination 10%, source 5% build + 5% recurring. → build side firmReserve 8000; recurring side 12 payout rows of 400 (sum 4800), funded from MRR, keyed to periodIndex, never netted against build reserve, no double-count. Matches the old two-table split exactly.

### 9.5 The unified models
- **`CommissionLine`** (replaces Origination + DealSourceCommission + ProjectSourceCommission + OngoingContractCommission): `projectId` (canonical home; nullable `dealId` for pre-convert), `kind` (origination|source), payee `partnerId?` XOR `externalName?` (CHECK), `buildPct`, `recurringPct?` (null unless a ServiceContract exists; this is how build-vs-recurring is inferred, the `CommissionBase` enum is dropped), `coveredMonths?`, `basis` (labor_revenue|build_value, stored explicitly), `onSchedule` (default true; origination now pays on schedule per D1), `sortOrder`, `backfillSourceId`/`backfillSourceTable` (provenance for the parity gate), audit fields.
- **`CommissionPayout`** (mirrors `ConsultantPayout`): `amount`, `status` (owed|paid|confirmed), `method?`, `paidAt?`, `confirmedAt?`, `clientPaidFirst`, `commissionLineId`, `stream` (build|recurring), `installmentId?` (build) / `periodIndex?` + `periodStart?` (recurring), `settledByBillId?`, `invoiceWaivedReason`. `@@unique` per (installment XOR period, commissionLine).
- **`Deal.budgetFee` (Int?)** plus one resolver `authoritativeBuildValue(deal|project)`: pre-convert `Deal.budgetFee ?? acceptedEstimate.totalValue ?? Deal.valueEstimate ?? 0`; post-convert `Project.budgetFee`. Budget authoritative once set; a later accepted estimate never re-overrides.

### 9.6 Recompute + reconciliation
- `recomputeCommissionPayoutsTx` (build stream) and `recomputeRecurringCommissionPayoutsTx` (recurring stream) both mirror the proven `recomputePayoutsTx`: split across non-extra installments (build) or per covered month (recurring), remainder to the last slot, only `owed` rows recompute, paid/confirmed preserved. Both run in the same transaction as the consultant payout recompute after any economics/schedule/commission edit. Recurring replaces `accrualSchedule` + the lazy `effectiveAccrualStatus` flip; owed/paid now lives on the payout row.
- **Per-partner rollup:** origination is read ONCE from origination-kind payout rows, never re-derived from the allocation. `partnerOriginationEarnings` leaves the rollup path (it stays only as a generation seed). Each partner card: take-home, origination, source, each owed/paid/remaining, Total earned summed from the one ledger.
- **External referrers:** payable via the existing waiver primitive (a `CommissionPayout` marked paid needs `settledByBillId` OR `invoiceWaivedReason`), so external payments stop flagging missing-doc. No synthetic vendor in v1.

### 9.7 Mandatory corrections (from the verifiers)
1. **Pin `Math.round` (half away from zero)** everywhere the calc, the editor preview, and the recompute run; add a half-cent fixture to `economics.check.ts` so JS and any verifier agree to the dollar.
2. **Conditional invariant assertion** as in 9.2 (branch on `deficit == 0`); never the unconditional full identity.
3. **Warn ceiling keys off the deficit condition** (`sourceCommissionTotal > firmReserveBeforeSource`), not a percent-of-laborBillable rule, so direct-cost-heavy deals are caught.
4. **Reject `recurringPct` on an origination-kind line** (CHECK + action validation), so origination stays a pure labour-pie slice.
5. **Floor/redistribute the recurring per-month remainder** so no single month row can render negative (also hardens the existing `accrualSchedule`).
6. **Backfill (five fixes, do not ship the backfill or parity gate without these):**
   - Origination: seed per-partner `buildPct = Project.originationPct * Origination.sharePct/100` (NOT raw `originationPct`), one line per Origination row, none when `isFirstContract` is false. The under-100 pool remainder gets no line and stays in firm reserve.
   - Source: copy `ProjectSourceCommission.buildAmount` as the backfilled line's frozen build slice so the gate is exact and the contracted dollar is honoured; only NEW lines use `authoritativeBuildValue`.
   - Parity gate: tolerance-aware (±1 dollar per line); compare `firmReserveBeforeSource` (new) against the frozen OLD `firmReserve`, and `sourceCommissionTotal` against the frozen `buildAmount` sums.
   - Gate on the per-line intended TOTAL, not the sum of generated payout rows, so schedule-less projects pass.
   - Recurring backfill via `effectiveAccrualStatus` (projected + accrued → owed, paid → paid, preserve `paidAt`). Exclude buyout projects from parity sums and subtract any stray old buyout commission dollars from the firm-wide total.
