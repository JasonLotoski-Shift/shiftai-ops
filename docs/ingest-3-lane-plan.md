# Ingest 3-Lane Redesign: Build Plan

> **Status:** agreed, not started (2026-06-29). Build order in §8. Reviewed against the live code by a 3-lens adversarial pass (correctness, sequencing, simplicity); fixes folded in.
> **Builds on:** [ingest-records-redesign-v2.md](ingest-records-redesign-v2.md) (Phase 1 + 2 shipped: thread-collapse, Interaction-as-comms, Timeline tab, Artifact `supersedesId` versioning, nullable `Task.due`, conservative default-OFF tasks). Those four agreed decisions still bind and are inherited by Lane 1.
> **Firm Knowledge centre** (Phases 1-3, live) is Lane 3's destination. Canonical models in `prisma/schema.prisma`: MemoryBlock / KnowledgeItem / DecisionRecord / KnowledgeCategory.

## Decisions set (2026-06-29, Jason)

1. **Gate 2 (promote a meeting into the firm brain) is approvable by any partner.** Sensitivity still governs *reads*: a `managing_partner` record is filtered at retrieval and at render for non-MP sessions. Who can *approve* is any partner.
2. **Lane 2 accepts all sources:** Gmail finance-label emails, dropped files, and pasted invoices. Finance classification is widened past Gmail-only.
3. **Firm-overhead finance needs no project.** Lane 2 ties to a Project when the money is client work, ties to nothing (firm-level) for overhead like Anthropic / Vercel / Workspace, and never ties to a Deal.
4. **The `lane` column migration is approved**, applied with the drift-safe `db-execute` + `migrate-resolve` recipe (never `migrate dev`, which would RESET prod). See [prod DB drift recipe].

---

## 1. The model: lane is the destination axis

`ingestType` (`interaction | meeting | email | document`) keeps describing the *format* an item arrived in. `lane` is a new, independent axis describing where the content goes:

| Lane | Color | Destination | Tasks? | Tie |
|---|---|---|---|---|
| `client_records` | **Gold** | Client / deal / project records, comms log, tasks | Yes (default-OFF, promote) | contact / client / project / deal |
| `financial` | **Green** | Firm financials (Bill / Expense / Invoice) | No | project OR firm-level; never a deal |
| `firm_knowledge` | **Blue** | Task board + (by exception) the firm brain behind a 2nd gate | Yes, firm-level | firm-level |

The same Fireflies meeting is `client_records` for a client call and `firm_knowledge` for a team sync.

**Lane is set deterministically at intake from signals the code already computes, and is changeable at review with one click.** The model does not classify lane for the common paths (that would spend tokens and add a mis-classification failure mode where none exists today):

- Gmail finance-label emails: `fromFinance` is already a boolean at [gmail-poll](../app/api/cron/gmail-poll/route.ts#L377) → `financial`.
- Fireflies title-matched + all-internal: `emails.every(isInternalEmail)` is already a boolean at [fireflies.ts](../lib/fireflies.ts#L205) → `firm_knowledge`.
- Everything else → `client_records` (the default).
- The only case needing a human or model nudge is a dropped/pasted file with no label: the composer shows a lane chip (gold / green / blue) defaulting to the inferred value, and the partner can switch it.

**One `IngestProposal` pipeline, one approve discipline, one audit trail.** Lane routes the review card and conditions the per-entry skill's output. It does not fork the pipeline.

---

## 2. Lane 1: Client records (GOLD)

**Reuse, mostly built.** This is the v2 `UnifiedProposalCard` path: record field-changes with before→after diffs, interactions, milestones, deliverables, deal stage signal, people + links, tasks default-OFF for the partner to promote ([unified-proposal-card.tsx](../components/ingest/unified-proposal-card.tsx)). The four v2 decisions (one card per Gmail thread, DB-canonical comms with a derived Drive log, explicit-replace versioning, conservative tasks) live here unchanged.

**The one upgrade: dedup by generalized meaning.** Today's matcher ([dedup.ts](../lib/ingest/dedup.ts#L25-L57)) strips a leading verb and articles, then does exact string equality on the remainder, so "Pilot SOW" and "Pilot scope of work" stay separate, and the fuzzy layer only shows an advisory badge that never prevents the duplicate.

Fix, with no embeddings and no second model call: **feed a bounded candidate list of the scoped existing open tasks into the same extraction call and let the model return merge / reassign / new decisions.** Today the model only sees open tasks for *project* targets ([context.ts](../lib/ingest/context.ts#L131-L171)); it is blind to client, deal, and firm-level tasks, so it proposes duplicates the string-matcher then drops or misses.

Keep the prompt bounded: print only the top-N most title-similar open tasks for the scope using the existing `findSimilarOpenTasks` helper ([dedup.ts](../lib/ingest/dedup.ts#L106)), capped at ~20 (matching the `take: 20` convention already in [context.ts](../lib/ingest/context.ts#L139)). The model judges meaning against a real, small candidate set; the normalized-string check in [dedup.ts](../lib/ingest/dedup.ts#L67-L88) stays the deterministic backstop. Scope precedence stays `project > client > firm`.

---

## 3. Lane 2: Firm financials (GREEN)

**Reuse the actions; they already do the work.** [actions.ts](../app/(app)/ingest/actions.ts#L564-L884): `createBillFromProposal` (Add AP), `createExpenseFromProposal` (Reimburse a person / Log firm-paid), `reconcileInvoiceFromProposal` (mark an issued invoice paid). CAD conversion, duplicate-blocking on vendor+number, Drive attachment copy, contractor-payout linking, audit + activity. Finance already creates zero tasks ([ingest-view.tsx](../components/ingest-view.tsx#L882-L884)).

**Four changes:**

1. **Inline PDF preview.** For Gmail finance, the invoice PDF is already filed to Drive at poll time and its ref sits on `proposal.attachment` ({driveUrl, driveFileId, fileName}, [gmail-poll](../app/api/cron/gmail-poll/route.ts#L505-L511)). Render it in a viewport in the green card. Link-only emails (no attachment) keep the "open it to get the details" fallback.

2. **Tie to a project or firm-level; never a deal.** Drop `matchedDealId` for this lane. Add a Project picker (absent today; finance inherits whatever the poll matched). A finance proposal with no project is a valid firm-overhead state (decision 3): it files as a firm-level Bill/Expense with `projectId` null. `Bill.projectId` and `Expense.projectId` are already optional.

3. **Reimburse payer = the full roster.** The payer dropdown lists consultants only today ([ingest-view.tsx](../components/ingest-view.tsx#L652-L655)); list partners + consultants (the people-merge follow-up). Encoding already supports both (`p:<id>` / `c:<id>`).

4. **Accept finance from dropped and pasted sources (decision 2), with a real attachment pipeline.** This is the part the first draft underestimated. The quick text-paste modal rejects binaries ([ingest-view.tsx](../components/ingest-view.tsx#L251-L271)), and the composer's upload helper files to the client/deal Drive folder and bails when there is no folder ([ingest-uploads.ts](../lib/ingest-uploads.ts#L71-L74)), which is exactly the firm-overhead case. So:
   - A dropped/pasted invoice enters through the **composer** (it already base64-uploads binaries), with the lane chip set to green.
   - For `lane === "financial"`, the server **files the attachment bytes to Drive AP-Unpaid at ingest time** via `fileBillDoc` ([firm-finance-drive.ts](../lib/firm-finance-drive.ts#L77-L85)), the same destination the poll uses, and writes the {driveUrl, driveFileId, fileName} ref into `proposal.attachment`. This bypasses the client/deal-folder helper, so firm-overhead finance (no client, no project) files correctly.
   - On approval, `createBillFromProposal` / `createExpenseFromProposal` read `proposal.attachment` exactly as they do for the Gmail path. No new column: the ref lives in the existing `proposal` JSON.

---

## 4. Lane 3: Team meetings + firm brain (BLUE)

The new lane. Three separable jobs.

### 4a. Stop discarding team meetings
The Fireflies gate skips any meeting where every attendee is on a firm domain, reason `internal-only` ([fireflies.ts](../lib/fireflies.ts#L199-L206)). That filter kills exactly the meetings Lane 3 wants. Change: an all-internal, **title-matched** meeting routes to Lane 3 (sets `lane = "firm_knowledge"`) instead of being skipped. Keep the "Shift" title gate so casual internal 1:1s stay out. `?force=1` still bypasses everything. The webhook, the poll, and the force path all delegate to one function ([fireflies.ts](../lib/fireflies.ts), `ingestFirefliesMeeting`), so the change lands in one place and idempotency on the meeting id is unchanged.

### 4b. Store the meeting at arm's length (already enforced structurally)
Log the transcript as today: an **Interaction** (the comms body) plus the transcript filed to Drive as a **firm-scoped Artifact** (no client folder, so it uses `DRIVE_SHARED_DRIVE_FOLDER_ID`). Neither is read by the AI context layer; only approved `MemoryBlock`s and approved `KnowledgeItem`/`DecisionRecord`s load into skills ([knowledge-context.ts](../lib/knowledge-context.ts)). So "stored, browseable, kept out of the firm-wide brain" is the default with no new field.

**Action items go to the firm task board** (clientId null, projectId null, category `firm`), default-OFF for the partner to promote, deduped against the firm board with the same bounded top-N candidate context as Lane 1 (scope = firm-level tasks, capped). Firm-level scope and unassigned owners already work with no schema change.

### 4c. Feed the firm brain only by exception, behind two gates
The Lane-3 extraction emits one `knowledgeCandidate` per meeting, `isImportant: false` by default. It flips true only when the meeting clears the §9 rubric. Most team meetings produce zero candidates. That restraint is the guard against recording pointless things.

- **Gate 1, in /ingest (blue card):** the partner approves the meeting record + action items. If a candidate exists and the partner keeps it, approving creates a **draft** record, stored and still invisible to every skill:
  - `kind: "decision"` → a draft `DecisionRecord` with `sourceInteractionId` set to the meeting Interaction (that FK exists on `DecisionRecord` and is currently never written), `generatedFromSkill: "ingest-meeting"`.
  - `kind: "learning"` → a draft `KnowledgeItem` with `source: "transcript"` and `generatedFromSkill: "ingest-meeting"`. **`KnowledgeItem` has no `sourceInteractionId` column**, so the link to the meeting is carried by `generatedFromSkill` + `source`, not an FK. Write the meeting-derived body into `summary` and `extractedText` (the columns that feed the generated `fts` tsvector), so the item is retrievable after approval without a re-parse.
- **Gate 2, in /firm-knowledge:** reuse the surfaces that already render drafts. The decision log already lists every `DecisionRecord` including drafts, shows a "Draft" badge, and renders the inline approve button ([decisions/page.tsx](../app/(app)/firm-knowledge/decisions/page.tsx#L63-L104)); the KnowledgeItem detail page and the browser already expose approve. Add a **"Needs review" filter** (`reviewStatus = "draft"` AND `generatedFromSkill = "ingest-meeting"`) to the decision log and the firm-knowledge browser, plus a small count badge on the firm-knowledge home. Gate 2 is the existing approve button on an already-listed draft. **Any partner may approve** (decision 1). Approve flips `reviewStatus` to `approved` via the existing `approveDecisionRecord` / `approveKnowledgeItem` ([firm-knowledge/actions.ts](../app/(app)/firm-knowledge/actions.ts#L172-L209)).

The discriminator is `generatedFromSkill = "ingest-meeting"`. Manual decisions and uploaded docs land with `generatedFromSkill` null, so a bare `reviewStatus = draft` would wrongly sweep them in; the filter keys on `generatedFromSkill`, which Gate 1 must stamp on both record types.

**Two deliberate constraints:** meetings propose `DecisionRecord`s and `KnowledgeItem`s only, never `MemoryBlock`s (the 4-key recent-memory tier stays hand-curated so it does not churn). Firm-economics or strategy candidates are tagged `sensitivity: managing_partner` so they are filtered from non-MP reads even after approval.

### 4d. The brain needs a reader, later
`fetchHistoricalKnowledge` ([knowledge-context.ts](../lib/knowledge-context.ts#L115-L206)) is built and has no production caller. Wiring a reader in the same phase that first produces drafts would run retrieval against an empty corpus (most meetings produce zero candidates, and each candidate clears two gates before it is readable). So **ship Lane 3 capture first; wire a skill to `fetchHistoricalKnowledge` as a later step** once approved volume justifies tuning. Until then the decision log is the human read-path, so the gate earns its keep immediately.

---

## 5. Data model changes

**One required migration: a single nullable column.**
```sql
ALTER TABLE "IngestProposal" ADD COLUMN "lane" TEXT;
```
- App-level union `IngestLane = "client_records" | "financial" | "firm_knowledge"`, matching the existing `ingestType String?` convention (app-validated, no DB enum type). Nullable so legacy pending rows stay valid.
- Add the `lane` field to `prisma/schema.prisma` in the same change so `migrate-resolve` marks it applied and `tsc` / `build` stay clean.
- **Backfill is required, not optional** (see §6): every visible create path sets `lane`, and existing pending rows get one (finance-shaped → `financial`, else `client_records`).
- The migration mechanics are the safe case: a nullable add with no default, unrelated to the known `PrototypeRun.kind` drift. Apply via `db-execute` + `migrate-resolve`.

**No other schema change is required.** Finance attachment refs live in the `proposal` JSON (`proposal.attachment`). The `knowledgeCandidate` lives in `proposal` JSON until Gate 1 promotes it to a draft record. Meeting-derived `DecisionRecord`s use the existing `sourceInteractionId`; meeting-derived `KnowledgeItem`s use existing `source` + `generatedFromSkill` (no FK). Firm-level `Task` scope and optional `Bill/Expense.projectId` already exist.

---

## 6. Lane is set at every create path

There are several `ingestProposal.create` sites. A pure `switch(lane)` with no fallback renders no card for any row with `lane = null`, and the page query returns those rows ([page.tsx](../app/(app)/ingest/page.tsx#L42-L61)). So Phase 1 does both:

1. **Set `lane` at every /ingest-visible creator:** Gmail poll, composer (`extractUnified`), legacy paste (`extractAndQueue`), project drop (`drop-actions`), and Fireflies. Use the deterministic signals from §1.
2. **Keep a defensive default in the router:** an unknown or null lane renders the gold `client_records` card, so no row is ever blank.

---

## 7. Skills: augment the three that exist, do not merge them

Today three separately tuned, separately token-capped skills are wired to their entry points: `ingest-email` (Gmail poll, ~2000 tokens), `ingest-meeting` (Fireflies + paste, ~3000), `ingest` (composer, ~8000). Merging them into one lane-conditioned mega-skill would bloat the high-frequency email path with two lanes' worth of instructions it never needs. So keep them and add only what each lane requires:

- **`ingest-meeting`:** add the Lane-3 `knowledgeCandidate` block (the §9 rubric) and the firm-board task-dedup context. This is genuinely new output; the skill emits none today.
- **The task-extracting skills (`ingest`, `ingest-meeting`):** add the bounded scoped-open-task candidate list (§2) so dedup is meaning-level.
- **`ingest-email`:** unchanged except that finance classification is the lane signal, which already exists.

---

## 8. Build order

Each phase ships independently behind the drift-safe recipe. The order keeps live finance intake working throughout.

1. **Spine.** Add the `lane` column + Prisma field; set `lane` at every create path (§6) + required backfill; three color tokens; replace the dispatch cascade with a `lane` switch (with the null→gold fallback). Gold routes to `UnifiedProposalCard`. **`financial` keeps routing to the existing `ProposalCard`** so finance behavior is preserved while the green card is still pending. `firm_knowledge` defaults to the gold card until Phase 4. Behavior-preserving.
2. **Lane 1 (gold).** Meaning-level dedup: bounded top-N scoped task candidates into the extraction call.
3. **Lane 2 (green).** Build the green card: inline PDF preview, Project picker + no-deal rule + firm-overhead allowed, roster payer. Move the finance actions onto it and retire the legacy `ProposalCard` finance branch. Add the dropped/pasted finance attachment pipeline (§3.4).
4. **Lane 3 (blue).** Route title-matched all-internal meetings to Lane 3 instead of skip; arm's-length Interaction + firm Artifact; firm-board dedup; `knowledgeCandidate` + draft record at Gate 1 (stamp `generatedFromSkill`); the "Needs review" filter + count badge on the existing firm-knowledge surfaces as Gate 2.
5. **Later.** Wire one skill to `fetchHistoricalKnowledge` once approved firm-knowledge volume justifies it.

Before each push: `npx tsc --noEmit` + `npm run build` clean; add a [lib/data/updates.ts](../lib/data/updates.ts) entry; update the How-it-works manual; managing-partner gating check on any firm-money surface.

---

## 9. Lane 3 importance rubric (the "is this VERY important?" bar)

`knowledgeCandidate.isImportant` flips **true** only when a meeting produces one of:
- **A firm-level decision** future work should not contradict (pricing, positioning, a buyer/partner call, a hire, a tooling/stack choice).
- **A changed way of working** (a new process, a standard, a rule the firm now follows).
- **A strategic call** (a market, a vertical, a model-versus-build choice, a go/no-go).
- **A durable lesson** worth reusing across engagements (a repeatable insight, a named anti-pattern).

It stays **false** for routine status, client-specific facts (those are Lane 1 records), to-do lists (those are action items), brainstorms with no decision, and anything already captured elsewhere.

`kind` picks the target: a decision reached → `DecisionRecord` (context / options / decision / consequences). A way-of-working or lesson → `KnowledgeItem` (`source: "transcript"`, summary + body). Default false means most meetings reach Gate 2 with nothing, which is correct.

---

## 10. Future / not in v1

- Embeddings / pgvector for retrieval and dedup stay deferred behind a golden-eval gate.
- Multi-invoice emails capture only the first attachment today; multi-attachment capture is a later add.
- Auto-refreshing the Tier-1 `recent_decisions` MemoryBlock from approved meeting decisions stays manual (it avoids reintroducing an auto-write).
- Brain retrieval (§4d, §8 step 5) is decoupled from Lane 3 capture and ships when volume justifies it.
