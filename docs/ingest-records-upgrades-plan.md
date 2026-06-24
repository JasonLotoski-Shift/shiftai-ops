# Ingest & Records Upgrades - Implementation Plan

> **⛔ SUPERSEDED / SHIPPED (2026-06-22).** Everything this doc planned has landed: the records/relationship model + ContactLink (migration `20260610061421_records_relationship_model`), OpsEvent telemetry (`20260609064102_add_ops_event`), attachment reading (#3), the cross-reference button (#4), and the v2 unified composer skill. The only un-finished carry-over is migrating the Gmail/Fireflies **polls** from the v1 `ExtractedProposal` shape to v2 `UnifiedProposal` — that work moves to the live plan. **Do not build from this doc; it is a record of completed work.** Live plan for the next round (email-thread collapse, task quality, entity matching, email/document archive): [ingest-records-redesign-v2.md](ingest-records-redesign-v2.md).

> **Status (2026-06-09).** #4 (cross-reference) and #3 (attachments / files + images) are **built + shipped to main**. #1 (beef-up records) and #2 (contacts / relationships) are **planned, not built** — and have been **re-scoped with Jason** into the unified model in the next section, which **supersedes the field proposals in Appendix Plans 3 & 4**. Both need a prod migration (Jason's approval). `OpsEvent` is already migrated, so a new migration is a clean diff (the "bundling" worry in the appendices is now moot).
> **Invariants:** see CLAUDE.md — local `prisma migrate` hits PROD Supabase (approval required); propose-never-auto-write; every mutation writes an AuditLog via writeAudit.

---

# AGREED RECORDS & RELATIONSHIP MODEL (#1 + #2, re-scoped with Jason 2026-06-09)

> Current source of truth for #1 + #2. **Supersedes** the field lists in Appendix Plans 3 & 4. ★ = high-value; unmarked = optional (cut freely). Open redlines listed at the end — not yet final.

## Mental model
- **Contact** = a person. Standalone record, personal info + full comms log. Can have NO company, work at one, or **introduce us to many**.
- **Client** = a signed company. Company info (much of it findable online) + many contacts + many projects + billing.
- **Deal** = a prospect ("project-light"): a contact + a free-text company + the company info we gather. **No Client record yet.** On convert → creates Client + Project.
- **Project** = deliverables / scope of work; belongs to a Client.

Contacts and companies stay **separate** records, linked **many-to-many**:

```
CONTACT ──< Contact↔Company link >── DEAL or CLIENT
        relationship + role + isPrimary
```

## The link table — `ContactLink` (Contact ↔ Deal/Client)
Many-to-many. The company side is **polymorphic**: exactly one of `dealId` / `clientId` is set (precedent: the Task/Milestone scope FKs). On **Convert**, a deal's links flip `dealId → clientId` so people + committee + intro path carry into the new client.

| Field | Notes |
|---|---|
| contactId | the person |
| dealId / clientId | the company side (exactly one set) |
| **relationship** | how they connect to the company — enum below |
| **role** | their pull in the decision — enum below (mainly for "works there") |
| isPrimary | the main contact on this company |
| roleLabel | free text — their title or how they connect ("VP Ops", "met at SEMA") |
| notes, addedBy | context + provenance ("AGENT · CLAUDE" or partner) |

`@@unique([contactId, dealId])` / `@@unique([contactId, clientId])` — one link per person per company.

- **`RelationshipType`** (nature of the link): `works_there` · `introduced_us` · `advisor` · `other`
- **`StakeholderRole`** (buying influence — Jason: these matter): `decision_maker` · `champion` · `influencer` · `budget_holder` · `technical` · `gatekeeper` · `blocker` · `other`

This gives: a company's **people** (works-there) + **who introduced us**; and a connector contact's **referral value** (every company they've introduced, in one place). Both enums are brand-new → plain underscored values, **no `@map`**.

## Record fields (keep + add)

### Contact — the person
**Keep:** name, title, company (free-text employer), email, phone, industry, source, sourceCategory, notes, lastTouchAt, domain (now surfaced) + relationship intelligence (persona, communicationStyle, keyFacts, background, hobbies, networkAffiliations, enrichedAt) + the interaction log.
**Add:** ★ linkedinUrl · ★ website (surface the hidden domain) · ★ location/city (+ timezone) · mobilePhone · preferredChannel (email/call/text/LinkedIn) · relationshipStrength (cold/warm/strong) · importantDates/birthday.
*(roles/relationships live on the link, not on Contact)*

### Client — the company
**Keep:** company, industry, revenue, website, companySize, headquarters, founded, ownership, description, brandColors, logoMonogram, companyKeyFacts, enrichedAt, billing (contractValue/terms/dates), driveFolderUrl, workspacePath, primaryContact, billingContact, projects, invoices.
**Add — presence & firmographics:** ★ linkedinUrl · ★ instagramUrl (+ facebook/youtube/x?) · ★ revenueEstimate (number) · ★ employeeCount (number) · ★ subIndustry/niche · locations / # of sites.
**Add — Shift-specific (feeds what we'd build):** ★ currentSystems / tech stack · ★ painPoints / opportunities · keyServices · competitors.
**Add — engagement:** healthScore/statusNote · renewalDate · engagementModel (subscription / buy-out).
*(contacts + introducer come via the link table)*

### Deal — the prospect (project-light)
**Keep:** company (free text), contact, stage, valueEstimate, industry, closeTargetDate, lastTouchAt, stageEnteredAt, coldOutreachAt, outreachRepliedAt, notes.
**Add — company profile (gathered now; copies to Client on convert):** ★ website · linkedinUrl · instagramUrl · domain · ★ revenueEstimate · employeeCount · companySize · headquarters · ownership · founded · description · subIndustry · ★ currentSystems · ★ painPoints · companyKeyFacts · enrichedAt.
**Add — sales intelligence:** ★ introducedBy (contact → becomes an "introduced us" link on convert) · ★ buying committee (Contact↔Deal links with roles) · probability/confidence % · nextStep · competitor · budget? · lostReason/lostAt · dealName (optional, distinct from company).

### Project — deliverables / SOW
**Keep:** name, phase/projectType, status, startDate, targetEndDate, budgetFee, description, milestones, tasks, artifacts, economics, invoices, installments, payouts, originations.
**Add:** ★ clientLead (client-side contact for the project) · ★ objectives / successMetrics · systemsBuilt/tech · risks/blockers · statusNote/health. On convert: seed `description` from the deal's gathered notes.

## Convert flow (Deal → Client + Project)
1. Create **Client** — copy the deal's company profile + socials + revenue/firmographics.
2. Create **Project** — seed scope/value from the deal.
3. **Re-point links** — the deal's contact links flip `dealId → clientId`; the deal's contact becomes works-there + primary; `introducedBy` becomes an "introduced us" link.

## Migration impact
One additive migration: Deal profile + sales fields; Client socials + firmographics + Shift fields; Contact reach fields; the `ContactLink` table + `RelationshipType` + `StakeholderRole` enums; project scope fields. All nullable / new tables → **no backfill**. Needs Jason's approval (prod Supabase). Mirror in `lib/types.ts`. Bigger than the original #1/#2, still safe + one pass.

## Open redlines (Jason to finalize)
- Final **role set** (trim/rename the 8?), and whether `relationship` needs `former` / `vendor` values.
- Which **socials** beyond LinkedIn + Instagram (Facebook / YouTube / X?).
- **dealName** separate from company — yes/no.
- **clientLead** on projects — keep (★) or drop.
- Which **optional** Contact/Client fields to cut (relationshipStrength, importantDates, preferredChannel, competitors…).

---

# INGEST SKILL + PIPELINE IMPACT (how all this actually gets populated)

The new fields + links only matter if ingest can fill them. The unified ingest (the `skills/ingest` skill + `lib/ingest/*` + `approveUnified`) grows to match — still propose-never-auto-write.

## 1. Wider field allowlists
The skill's "allowed field changes by kind" and the `lib/ingest/apply.ts` allowlists expand:
- **Contact:** + linkedinUrl, website/domain, location, preferredChannel, relationshipStrength.
- **Client:** + linkedinUrl, instagramUrl, revenueEstimate, employeeCount, subIndustry, currentSystems (list), painPoints (list), keyServices, competitors.
- **Deal:** **now overwritable** — today a deal has NO field changes (only a stage signal); it gains the whole company-profile + sales-intel set (website, currentSystems, painPoints, nextStep, competitor, budget-as-stated…). **Biggest behavioral change:** a deal becomes enrichable from a call/email like a client is.
- **Project:** + objectives, successMetrics, systemsBuilt, risks, statusNote.

Three carve-outs keep the allowlists honest:
- **Stage stays signal-only.** Deal `stage` is still never a `fieldChange` — `stageSignal` remains the only stage mechanism (partner moves the stage, never the model).
- **Never ingest-proposable (partner judgment):** probability/confidence %, relationshipStrength, healthScore, engagementModel, lostReason/lostAt. These are opinions the partner forms, not facts a source states — they get manual UI only.
- **Stated-only firmographics:** revenueEstimate, employeeCount, socials, founded, ownership are primarily **web-enrich** territory. Ingest proposes them only when the source literally states them ("we're about 120 people" → employeeCount), never from inference.

## 2. New proposal sections (the #2 capability, now with relationship + role)
`UnifiedProposal` gains two optional arrays (optional ⇒ existing pending proposals still parse):
- **proposedContacts** — people named in the source not yet on file: `{ name, email, title?, company?, suggestedRelationship, suggestedRole }`.
- **contactLinks** — `{ contactRef, target: deal|client, relationship, role, isPrimary }` — the buying committee + intro paths.

`parse.ts`, the review card, and `approveUnified` thread these through: create the contact via the existing dedupe path → write `ContactLink` rows via a new `lib/contact-links.ts` helper → audit. (This replaces the heavier `ClientStakeholder`/`ProjectStakeholder` design in Appendix Plan 4.)

## 3. New skill inference rules (the prompt)
- **Relationship:** infer `works_there` when a person's email domain matches the company; `introduced_us` when the source credits a referral/intro ("Bob connected us", "referred by", "introduced us to"). Suggestion only.
- **Role:** infer from titles / how they're described — owner/CEO/principal → `decision_maker`; "our champion/advocate" → `champion`; "she'll be the one using it / the operator" → `technical`; CFO / "controls the budget" → `budget_holder`; EA / "go through" → `gatekeeper`. Only when stated; else leave role unset. Partner confirms every one.
- **Intro paths:** when someone is credited with the introduction, propose them as a contact (if new) **and** an `introduced_us` link.
- ★ **Shift signal extraction (highest value):** pull **currentSystems** (tools/software they mention running) and **painPoints** (problems/frustrations) into the client/deal fields — e.g. "we run everything in spreadsheets, dispatch is a nightmare" → currentSystems: ["spreadsheets"], painPoints: ["dispatch is manual/slow"]. Add explicit instruction + worked examples to the skill — this is the signal that tells Shift what to build.

## 4. Guardrails preserved
- **No invented data** — only emails/URLs/facts present in the source (web-enrich is the separate, citation-backed action; ingest is source-only).
- **Soft claims stay soft** — floated budget/timeline → keyPoints, never a committed field.
- Relationship/role/profile changes are **suggestions**; the partner approves each (overwrites show before → after).
- **Firm/internal addresses** excluded from client stakeholder proposals (can be added manually as a `team_member`).
- **email is never overwritten** (it's the match key).

## 5. Context builder must show the model
`lib/ingest/context.ts` prints, for the targets: current contacts/links (so the skill doesn't re-propose an existing link), the current values of the new overwritable fields (for diff stamping), and — for email ingests — the participant list with names + known/unknown flags.

## 6. v1 auto-ingest paths (gmail-poll `ingest-email`, fireflies `ingest-meeting`)
These still emit the v1 ExtractedProposal (no records/links). To capture committee + intro paths + Shift signals from auto-ingested email/meetings, **migrate the polls onto the v2 unified shape** — recommended as a follow-on once the v2 composer path proves the model. (Decision: do the v2 composer first, then the polls.)

## 7. Enrich-web skills widen in lockstep (separate from ingest, same fields)
Ingest is source-only; the citation-backed fill for the new firmographics is the existing web-enrich flow. Its field sets must grow to match or the model never proposes the new fields:
- **`skills/enrich-company-web/SKILL.md`** + the client/deal `*_ENRICH_*_FIELDS` sets in the apply actions: add linkedinUrl, instagramUrl (+ whichever socials survive the redline), revenueEstimate, employeeCount, subIndustry, locations, currentSystems, painPoints, keyServices, competitors. Same skill serves Deal enrich (Q11's "reuse" call stands — the deal action passes its own current-values block).
- **`skills/enrich-contact-web/SKILL.md`** + contact `ENRICH_SCALAR_FIELDS`: add linkedinUrl, website/domain, location (Q11 already flagged `domain`; this widens it).
- Both keep the proven propose → review → set-if-empty/append-only apply — no rule changes, just wider allowlists + label maps (`ENRICH_FIELD_LABELS`).

## 8. Convert is now part of the ingest story
Buying-committee links gathered at deal stage only pay off if Convert carries them: `convertDeal` re-points `ContactLink.dealId → clientId`, upserting on the `@@unique([contactId, clientId])` so a contact already linked to the client merges instead of erroring; `introducedBy` becomes an `introduced_us` link; the deal's primary contact becomes `works_there` + `isPrimary`; the gathered profile fields copy onto the new Client; Project seeds `description` (and `clientLead` = the deal's primary contact, if that field survives the redline). All inside the existing convert transaction + one audit row.

---

Confirmed the load-bearing facts:
- `company` is free text on `Contact:377`, `Deal:438`, `Client:474` — 750 occurrences across 118 files. The Company-entity refactor blast radius is real (#2 cited ~595; it's larger now).
- The shared ingest entry points (`detectTargets:99`, `extractUnified:253`, `approveUnified:413`) all live in one file — `composer-actions.ts` — confirming #3 and #4 collide there.
- `Contact.domain:385` and `Client` company-profile block (`:490-500`) exist; `Deal` has neither — confirming #1's gap.
- The in-flight `OpsEvent` migration is genuinely un-migrated.

I have everything I need to reconcile. Writing the master plan now.

---

# MASTER PLAN — Four shiftai-ops upgrades, consolidated

> **⚠️ Partially superseded (2026-06-09) — read with the section above.** Since this was written: **#4 and #3 shipped** (Qs 4–10, 15 settled by what shipped); **OpsEvent/M0 is migrated** (the bundling worry in §3 is moot); **Q1–Q3 are answered** (M0 done; lightweight model confirmed — still no Company entity); **M1/M2's contents and Qs 12–14 are superseded** by the agreed model — one `ContactLink` table (relationship + role, Deal-or-Client) replaces `ClientStakeholder`/`ProjectStakeholder`, and the field additions span Contact/Client/Deal/Project, not just Deal. **Q11 (reuse `enrich-company-web`, widen `enrich-contact-web`) is still live.** The build mechanics in §2 and the appendix plans (file lists, apply patterns, blast radius) remain the reference for *how* to build.

**Plan-only. No files edited, nothing migrated.** This reconciles four independently-written plans into one build order, makes the one cross-cutting model decision both #1 and #2 hinge on, sequences every migration (including the in-flight OpsEvent one), and gives you a single decision checklist.

The four workstreams:
- **#4 — Cross-reference records & tasks** (ingest review button) — *no schema change*
- **#3 — Read PDF/Word/Excel/MD/HTML + email attachments** (ingest) — *no schema change*
- **#1 — Beef up thin deal/contact records** (web-enrich + website) — *schema change on `Deal`*
- **#2 — Capture email stakeholders + multiple contacts per company/project** — *schema change: new join tables*

---

## 1. The cross-cutting company / stakeholder model — ONE decision

**#1 and #2 both hinge on the same question: how is "company" modelled?** Today it's free text — `Contact.company` (`schema.prisma:377`), `Deal.company` (`:438`), `Client.company` (`:474`) — referenced **750 times across 118 files** (verified). #1 wants to attach a company *profile* (size/HQ/website/founded) to a Deal. #2 wants to attach *multiple people* to a company/project.

### Decision: lightweight join tables + profile-on-record. Do NOT build a first-class `Company` entity.

Both plans independently recommend this, and the blast radius confirms it's the right call:

- A real `Company`/`Organization` model forces `companyId` FKs onto Contact/Deal/Client, a **data backfill that de-duplicates 750 free-text company strings** into canonical rows, and a rewrite of every read that touches `company` — `detectTargets` name-matching (`composer-actions.ts:144-184`), the Client company-profile block, all enrich actions, every seed fixture, the `lib/types.ts` mirror, and the pipeline/contacts/clients list pages. That is a multi-day refactor with live-prod-data risk, and it is **out of scope** for "enrich a deal" and "capture cc'd people."
- The lightweight path ships both features without touching the 750-reference surface at all.

**How the two workstreams depend on this one decision:**

| | What it builds on the shared model |
|---|---|
| **#1 (enrich)** | Adds a company-**profile field set to `Deal`** that mirrors `Client`'s existing block (`schema.prisma:490-500`) one-for-one. "A company" = the profile fields on the record + the contact's free-text `company`. On Convert, those fields copy forward to the new `Client`. #1 keeps enriching **free-text profile fields**, never a Company row. |
| **#2 (stakeholders)** | Adds **`ClientStakeholder` (+ `ProjectStakeholder`) join tables** linking `Contact`↔`Client`/`Project`. "A company's people" = the set of stakeholders linked to a Client. `company` stays free text. |

**The shared rule both must follow:** a "company" is **(profile fields on the record) + (stakeholders linked to the Client)** — never a new entity. If you ever decide you want a first-class `Company` later, that's a separate, larger migration *both* workstreams would share — flagged in the decision checklist, not built here. (Specifics: #1's `Deal` field list is in **Plan 3 → Schema changes**; #2's join-table DDL is in **Plan 4 → Schema changes**.)

---

## 2. Shared ingest infrastructure — #3 and #4 collide in one file

Both ingest workstreams touch the **same composer/poll/lib surface**. The hot file is `app/(app)/ingest/composer-actions.ts`, which holds all three entry points (verified): `detectTargets:99`, `extractUnified:253`, `approveUnified:413`.

**Shared touch-points (who edits what):**

| File / symbol | #3 (attachments) | #4 (cross-reference) |
|---|---|---|
| `composer-actions.ts` → `extractUnified` | adds `files?` param; loops `extractFile()`; relaxes the ≥40-char guard; adds `maxDuration=300` | — (reads the stored proposal, doesn't change extract) |
| `composer-actions.ts` → `approveUnified` | unchanged | unchanged (only pre-unchecks items; backstop dedup stays) |
| `composer-actions.ts` → `detectTargets` | — | **extracts the pure body into `resolveTargetsFromText`**, `detectTargets` delegates (signature unchanged) — adds new action `crossReferenceUnified` |
| `components/ingest/unified-proposal-card.tsx` | (no direct change) | adds the button + overlap badges + suggested-match chips |
| `components/ingest/ingest-composer.tsx` | base64-reads binaries; widens `accept`; passes `files` | — |
| `lib/gmail.ts` → `ParsedEmail` | adds `attachments[]` + `fetchAttachment()` | (#2 also adds `participants[]` here — see below) |
| `app/api/cron/gmail-poll/route.ts` | fetch + parse attachments into intake | — |
| `lib/ai.ts` → `GenerateInput` | adds `documents?` (PDF blocks) | — |

**Ordering that avoids merge churn:**

1. **#4 goes first** (it's no-migration and self-contained). Its only shared-file edit is the `detectTargets` → `resolveTargetsFromText` extraction inside `composer-actions.ts`, plus a new exported action. It does **not** touch `extractUnified`'s signature.
2. **#3 goes second.** It changes `extractUnified`'s *signature* (`files?`) and the composer. By landing after #4, #3 rebases onto a `composer-actions.ts` whose `detectTargets` is already refactored — no conflict, because #3 and #4 edit different functions in that file.
3. **`lib/gmail.ts` is touched by both #3 (`attachments`) and #2 (`participants`).** Both are *additive fields on `ParsedEmail`* — combine them in one edit when #2's Gmail step lands so `getEmail()` is walked once. Note this so whoever does #2's Gmail-name capture and #3's attachment capture coordinates that single file (or sequences #3 before #2's poll changes).

**Net:** #4 → #3 keeps the ingest file conflict-free. (#3 specifics: **Plan 2 → Step-by-step**. #4 specifics: **Plan 1 → Step-by-step**.)

---

## 3. Migration sequence — one coordinated order, with the in-flight OpsEvent change

**The hard constraint:** local `prisma migrate dev` hits the **same Supabase as prod**. Every migration below needs **Jason's explicit approval before it runs.** And critically:

> **The working tree already contains un-migrated schema:** `OpsEvent` model + `OpsKind`/`OpsStatus` enums (`schema.prisma:1568-1607`) + `MessageKind.ops_alert` (`:170`), plus untracked `lib/ops.ts`. Verified: the latest migration on disk is `20260606080019_gmail_ingest` — **no migration references OpsEvent.** This is the "System status" telemetry feature, **unrelated to these four asks.**

**Consequence both #1 and #2 flagged:** the *next* `prisma migrate dev` anyone runs — for #1's Deal fields or #2's join tables — will generate **one migration containing the OpsEvent telemetry too**, because Prisma diffs the whole schema against the last migration. You cannot run a #1 or #2 migration without either bundling OpsEvent or dealing with it first.

### Recommended migration order

| # | Migration | Contains | Gate | Notes |
|---|---|---|---|---|
| **M0** | `add_ops_event_telemetry` | OpsEvent model + OpsKind/OpsStatus enums + `MessageKind.ops_alert` | **Jason approves** | **Land the in-flight telemetry on its own first.** It's clearly furthest along (`lib/ops.ts` written, already imported by the cron + `lib/ai.ts`, system-status UI exists). Owned by the System-status feature, not these four. Running it solo *decouples* it so #1/#2 don't drag unfinished telemetry — or ship it knowingly with one of them. **This is the linchpin decision.** |
| **M1** | `add_deal_company_profile` (#1) | 9 nullable fields on `Deal`: `website, domain, companySize, headquarters, founded, ownership, description, companyKeyFacts, enrichedAt` | **Jason approves** | Additive/nullable → no backfill, safe. Stacks cleanly on M0. Brand-new fields, no enums → `@map` gotcha N/A. |
| **M2** | `add_stakeholder_join` (#2) | `StakeholderRole` enum + `ClientStakeholder` + `ProjectStakeholder` + 3 back-relations | **Jason approves** | Additive (two new tables, no existing-column change) → no backfill. `StakeholderRole` is brand-new → **plain underscored values, NO `@map`** (matches the Import-Contacts enum precedent, `schema.prisma:265-321`). |

**#3 and #4 add ZERO migrations** — confirmed by both plans and by the schema read. They ship as pure code (re-resolved matches reuse the existing `IngestProposal.matched*` columns; extracted attachment text is transient and rides the existing proposal/Drive path).

**If M0 is NOT landed solo** (you'd rather not ship telemetry yet): then M1 or M2 *must* bundle it, OR a Deal-only / stakeholder-only migration SQL file is hand-authored to exclude the OpsEvent DDL. Recommended is **M0 solo first** — cleanest, and unblocks both schema workstreams. (This is Open decision #1.)

**One approval moment, batched:** because M1 and M2 are both additive and independent, after M0 you can approve them as **one combined migration** (`add_deal_profile_and_stakeholders`) if #1 and #2 are built together — fewer prod-touch events. Flagged as Open decision #2.

---

## 4. Final recommended build sequence (all four)

**Principle: front-load the no-migration wins (zero prod risk, ship immediately), then group the two schema changes behind one approval gate.**

```
PHASE A — No-migration ingest wins (ship first, zero DB risk)
  A1. #4 Cross-reference button      ← self-contained; refactors detectTargets only
  A2. #3 Attachment reading          ← rebases on A1's composer-actions cleanly
        └─ deps gate: mammoth, xlsx, node-html-parser (+ PDF route choice)

PHASE B — Telemetry decouple (unblocks all schema work)
  B0. M0  Land OpsEvent migration solo   ← Jason approval #1 (the linchpin)

PHASE C — Schema-backed record upgrades (behind one approval gate)
  C1. M1 + #1 Deal enrichment + website + contact-website surfacing
  C2. M2 + #2 Stakeholder join tables + ingest capture + manual UI
        └─ #2 manual surface (client/project stakeholder cards) is independently
           shippable even before the ingest-capture half
```

**Why this order:**

- **#4 first** — no schema, no deps, smallest blast radius, and it's the only one whose shared-file edit (the `detectTargets` extraction) is a precondition that *removes* a future conflict for #3. Immediate partner value (stop creating duplicate tasks).
- **#3 second** — no schema; its only gate is your sign-off on 3 npm deps + the PDF route. Lands on a composer file #4 already cleaned up.
- **OpsEvent (M0) third** — it's the migration *gating everything schema-shaped*. Get it out of the working tree and into prod on its own commit so #1/#2 migrations are clean diffs.
- **#1 fourth** — smallest schema change (9 nullable Deal columns), and it's a near-verbatim port of two proven enrich patterns (Client + Contact), so low novel logic.
- **#2 last** — largest surface (full ingest extract→propose→review→approve chain + Gmail poll + two new UI surfaces). Its **manual stakeholder card** (Plan 4 steps 1–3) is independently shippable as an M-sized slice if you want partial value sooner.

**Parallelization note:** A-phase (#4, #3) and the *manual* half of #2 touch disjoint files and could run in parallel if you had two builders. The single coordination point is `lib/gmail.ts` (#3 attachments + #2 participants) — do that file once.

---

## 5. Consolidated decisions for Jason (deduped, single checklist)

Crisp questions, grouped. Dedupe note: all four plans independently asked the OpsEvent-bundling question — that's **#1 here**. Both #1 and #2 asked the company-model-fork question — that's **#3 here**.

### Migrations (prod-touching — must answer before any `migrate dev`)
1. **OpsEvent telemetry — land it solo first?** The un-migrated `OpsEvent`/`OpsStatus`/`ops_alert` change in the working tree will bundle into the next migration. **Recommended: migrate it on its own commit (M0) before any Deal/stakeholder migration**, so those stay clean diffs. Approve M0 solo? (If no, it ships bundled with #1 or #2.)
2. **Deal fields (M1) + stakeholder tables (M2) — approve, and combine into one migration?** Both are additive/nullable, no backfill. OK to run them? And if #1+#2 are built together, fold them into **one** `add_deal_profile_and_stakeholders` migration (one prod-touch instead of two)?

### The model fork (decides #1 and #2's foundation)
3. **Confirm lightweight model over a first-class `Company` entity?** #1 enriches **profile fields on Deal/Client**; #2 adds **stakeholder join tables**; `company` stays free text (750 refs untouched). Both workstreams build on this. Agreed — or do you want a real `Company` model (separate, larger, shared migration)?

### New npm dependencies (all #3; all pure-JS / serverless-safe)
4. **Approve `mammoth` (.docx), `xlsx` (Excel), `node-html-parser` (HTML)?** No native bindings, bundle cleanly into a Lambda.
5. **PDF route — native document block to Claude (recommended, no new dep, best on scanned PDFs, adds per-ingest tokens) vs. server-side scrape with `unpdf` (uniform plain text, but a wasm/worker asset to bundle + weak on scanned PDFs)?** Recommendation: **native block.**
6. **HTML — use `node-html-parser`, or reuse the existing zero-dep regex strip already in `lib/gmail.ts:167`?**
7. **Attachment caps OK?** ~25 MB/file, ~50k extracted chars, Gmail ≤5 attachments / ~15 MB per message, truncation marked.

### Behaviour / scope calls (no prod risk)
8. **#4 — v2 cards only?** Button appears on `UnifiedProposalCard` (v2) only; legacy v1 cards keep silent-at-approval dedup. (v1-too ~doubles UI work for shapes you're moving off.) **Recommended: v2-only.**
9. **#4 — auto-persist a re-resolved match when exactly one client matches, else require a click?** **Recommended: yes, single-client auto-persist; ambiguous = chips only.**
10. **#4 — overlap-flagged tasks/milestones default to unchecked (skip)?** **Recommended: yes** (partner re-checks to force-create).
11. **#1 — reuse the existing `enrich-company-web` skill for deals, or fork a deal-specific one?** **Recommended: reuse.** And confirm the `enrich-contact-web` SKILL.md should add `domain` as an allowed field (else the model won't propose a contact website).
12. **#2 — ship both `ClientStakeholder` + `ProjectStakeholder` now (one migration), or Client-only first?** **Recommended: both now.**
13. **#2 — firm/internal addresses as stakeholders?** **Recommended: excluded from auto-proposals, manually linkable as `team_member`.**
14. **#2 — is the `StakeholderRole` set right** (champion / decision_maker / economic_buyer / technical / influencer / blocker / team_member / other), or simpler?
15. **#3 — is the legacy `PasteModal` in `ingest-view.tsx` still live?** If retired, only its rejection copy changes; if live, it gets the same base64 upload path as the composer.

---

## 6. Phase / milestone breakdown (partner-trackable)

| Phase | Milestone | Workstream | Migration | Approval needed | Effort |
|---|---|---|---|---|---|
| **A** | **Ingest cross-reference** — button on review cards re-resolves the record and flags tasks/milestones that already exist before approval | #4 | none | Behaviour Qs 8–10 | **M** |
| **A** | **Ingest reads attachments** — composer + Gmail poll read PDF/Word/Excel/MD/HTML content, not just the body | #3 | none | Dep Qs 4–7, 15 | **M** |
| **B** | **Telemetry landed** — OpsEvent "System status" schema migrated to prod on its own commit | (in-flight, not ours) | **M0** | **Q1** | **S** (migration only) |
| **C** | **Richer deals** — deals carry a company profile + website; enrich-from-web (review-before-keep); contact website surfaced; copies forward on Convert | #1 | **M1** | **Q1–Q3, Q11** | **M** |
| **C** | **Stakeholders — manual** *(shippable alone)* — add/edit/remove multiple stakeholders with roles on client + project detail | #2 (steps 1–3) | **M2** | **Q1–Q3, Q12–Q14** | **M** |
| **C** | **Stakeholders — ingest capture** — cc'd/to people surface as proposed contacts + stakeholder links through the propose-never-auto-write gate | #2 (steps 4–11) | (rides M2) | same as above | **L** total |

**Persistence invariants preserved across all phases** (called out because every plan must honour them):
- **Propose-never-auto-write** — #3's extraction and #2's Gmail capture write **only a pending `IngestProposal`**; nothing becomes a Contact/stakeholder/artifact until a partner approves through the recipe.
- **Every mutation writes one `AuditLog` via `writeAudit`** — #4's cross-reference (diagnostic + optional match-persist), #1's `apply*`, #2's link writes all audit. Deliverables → `Artifact`; outreach → `Interaction`.
- **Prisma singleton** (`lib/prisma.ts`) everywhere; `force-dynamic` on the `(app)` layout untouched.
- **`tsc --noEmit` + `npm run build` clean** before every push; `lib/data/updates.ts` + How-it-works updated for anything partner-visible (#1, #2, #3, #4 all qualify).

**Effort totals:** #4 **M** · #3 **M** · #1 **M** · #2 **L** (its manual-only slice is **M**). Whole programme ≈ **one L plus three Ms**, front-loaded so the two no-migration Ms ship first.

---

### Where the detail lives (nothing lost)
- **#4** concrete file list + step order + the `detectTargets`→`resolveTargetsFromText` extraction + `CrossReferenceResult` type → **Plan 1**.
- **#3** `extract-file.ts` dispatch table + `lib/ai.ts` `documents?` change + Gmail `fetchAttachment` + caps/fallbacks → **Plan 2**.
- **#1** the 9 `Deal` fields + `DEAL_COMPANY_ENRICH_*` field sets + `deal-enrich-panel.tsx` + Convert carry-forward + contact-`domain` surfacing → **Plan 3**.
- **#2** `StakeholderRole` + the two join models + `lib/stakeholders.ts` + the full ingest type/parse/context/approve chain + the two stakeholder UI cards → **Plan 4**.

---

# Appendix - Per-workstream design plans

## Appendix Plan 1: #4 - Cross-reference records & tasks

I have everything I need. The in-flight schema change (OpsEvent + OpsKind/OpsStatus enums + MessageKind.ops_alert) is confirmed present in `prisma/schema.prisma` and un-migrated. The IngestProposal model confirms `matched*` are loose `String?` fields (no FK), and the v2 plan keeps `ingestType` nullable for legacy.

My design needs no schema change — I can persist re-resolved matches into the existing `matched*` columns and return overlap data ephemerally. Let me write the plan.

## Goal (1-2 lines)
Add a "Cross-reference records & tasks" button to each pending **v2** ingest review card that, on click, runs one server action which (a) re-resolves the client/deal/project/contact this item belongs to when it arrived unmatched, and (b) flags each proposed task/milestone that already exists as an open item in that scope — surfaced on the card *before* approval so a partner confirms the match and skips/merges duplicates instead of creating them.

## Current state confirmed (what you verified by READING files; cite file:line)
- **v2 card is the right surface.** `components/ingest/unified-proposal-card.tsx` renders one `UnifiedProposal` (schemaVersion 2); the dispatcher in `components/ingest-view.tsx:100-143` routes `p.schemaVersion === 2 && p.data` to it, else to legacy `ProjectProposalCard`/`ProposalCard`. The v2 card already owns per-record/per-task `keep` state (`unified-proposal-card.tsx:179-193`) and builds the approval payload from checked items (`buildSelections`, `:218-266`).
- **Entity matching already exists and is reusable.** `detectTargets()` in `app/(app)/ingest/composer-actions.ts:99-195` returns `{ targets: {kind,id,label}[]; ambiguous }` from `content` + optional `emailBlock` + `title`; clients lead, ambiguity = >1 client or >1 email contact. `matchEntity()` (`app/(app)/ingest/actions.ts:48-74`) is the v1 email-only matcher. Both read live Prisma.
- **Dedup helpers already exist but only fire silently at approval.** `findDuplicateOpenTask` / `findDuplicateOpenMilestone` in `lib/ingest/dedup.ts:43-92` match by `normalizeTitle` within a scope (project → client → firm) against open tasks (`done:false`) / live milestones (`archivedAt:null`, `status != complete`). They're called inside the `approveUnified` transaction (`composer-actions.ts:554, 664`) and the v1 `approveProposal` (`actions.ts:330`) — the skip is reported only post-hoc in the audit/activity (`composer-actions.ts:478-479, 726-732`). Nothing shows the partner the overlap *before* they approve.
- **Proposed tasks/milestones carry scope, not the dedup result.** `TaskProposal` (`lib/ingest/types.ts:58-68`) has `clientId`/`projectId`/`milestoneId`/`reassignTaskId`; `ProposedMilestone` (`:33-37`) has only `title`/`dueDate`/`status` (no scope of its own — it inherits the record's project at apply time, `composer-actions.ts:552-570`).
- **`matched*` are loose strings, no FK.** `IngestProposal` (schema `:1363-1390`): `matchedContactId/ClientId/DealId/ProjectId` are all `String?`; `ingestType String?` (nullable for legacy). `@@index([status])` only.
- **`detectTargets` does NOT currently persist** — it returns to the composer client at compose time; the focus is chosen there and written into `matched*` at `extractUnified` (`composer-actions.ts:382-401`). So an item that arrived from Gmail/Fireflies unmatched has `matched*` = null and there is no re-resolve path post-extraction.
- **Audit helper signature:** `writeAudit(db, { actor, action, targetType, targetId, changes })` (`lib/audit.ts:47`); `agentActor("ingest")` → `{kind:"agent", name:"ingest"}` (`:117`). Cross-reference is a read/diagnostic, but persisting a re-resolved match is a mutation → it audits.
- **In-flight un-migrated schema (coordination):** `prisma/schema.prisma` already has `model OpsEvent` (`:1581`), `enum OpsKind` (`:1568`), `enum OpsStatus` (`:1576`), and `MessageKind.ops_alert @map("ops-alert")` (`:170`) — none migrated. `lib/ops.ts` is untracked. **My workstream needs no schema change, so I run no migration and do not touch these.**

## Schema changes + migration sketch (Prisma model/field deltas + a short SQL-ish sketch; or "None")
**None.** This is deliberate and achievable:
- Re-resolved matches persist into the **existing** `IngestProposal.matched*` string columns (`schema:1377-1380`) — same columns `extractUnified` already writes. No new column.
- The task/milestone overlap result is a **diagnostic computed on demand** and returned to the client for that render — it is not durable firm state, so it needs no table. (It could be cached in the `proposal` JSON, but that risks staleness vs. live open tasks; recomputing on click is correct and cheap.)

This avoids a prod migration entirely — and specifically avoids bundling the in-flight OpsEvent/OpsKind/OpsStatus/ops_alert changes into a migration this workstream would otherwise trigger.

## New dependencies (npm packages + why + serverless/Vercel compatibility note; or "None")
**None.** Everything reuses existing server code (Prisma singleton, `detectTargets`, the two dedup helpers, `writeAudit`) and existing UI primitives (`Card`, `Badge`, `Button`, `Select`, lucide icons). No model call is needed — matching and dedup are deterministic string/Prisma work, so no AI-timeout/Vercel-function-cap concern (unlike the proposal engine).

## New files (path + one-line purpose)
- `lib/ingest/cross-reference.ts` — server-only module: `crossReferenceProposal()` reusable core (re-resolve matches + compute task/milestone overlap), plus the `CrossReferenceResult` type. Keeps the logic out of the `"use server"` actions file so it's unit-testable and importable by both the action and (future) approval-time reuse.

*(No new component file — the cross-reference UI is a small section added inside the existing `UnifiedProposalCard`, consistent with how that card already nests `RecordSection`.)*

## Modified files (each: path — what changes in one line)
- `app/(app)/ingest/composer-actions.ts` — add the exported `"use server"` action `crossReferenceUnified(proposalId)` that calls the new core, optionally persists re-resolved `matched*`, writes one audit row, returns `CrossReferenceResult`.
- `components/ingest/unified-proposal-card.tsx` — add a "Cross-reference records & tasks" button + the result panel (suggested-match chips the partner can confirm into the deal/scope selector; per-task/per-milestone "looks like existing X" badges with a skip toggle that defaults the item to unchecked).
- `lib/ingest/types.ts` — add the `CrossReferenceResult` shared type (client + server importable; no server deps) so the card can type the action's return.
- `app/(app)/ingest/page.tsx` — extend the v2 `proposal` prop passed to the card with `matchedProjectId` is already passed; add nothing structural — but confirm `transcript` is available to the action (it is, server-side via the proposal row; the card does not need it). *Likely no change; listed only if the card needs `transcript` echoed — it does not, the action loads it from Prisma.* → **No change expected.**

## Step-by-step build approach (numbered, concrete, in build order)
1. **Define the return contract** in `lib/ingest/types.ts`:
   ```ts
   export type CrossRefMatchKind = IngestTargetKind;
   export type CrossRefSuggestedMatch = { kind: CrossRefMatchKind; id: string; label: string };
   export type CrossRefTaskOverlap = {
     index: number;            // index into UnifiedProposal.tasks
     title: string;
     existingTaskId: string;   // the open task it duplicates
     existingTitle: string;
     scope: "project" | "client" | "firm";
   };
   export type CrossRefMilestoneOverlap = {
     recordIndex: number;      // index into UnifiedProposal.records
     milestoneIndex: number;   // index into that record's milestones[]
     title: string;
     existingMilestoneId: string;
     existingTitle: string;
   };
   export type CrossReferenceResult = {
     // Re-resolution
     alreadyMatched: boolean;          // proposal already had a focus FK
     ambiguous: boolean;               // >1 candidate client / contact
     suggestedMatches: CrossRefSuggestedMatch[];  // ordered, clients first
     persistedFocus: CrossRefSuggestedMatch | null; // what we wrote to matched*, if any
     // Overlap
     taskOverlaps: CrossRefTaskOverlap[];
     milestoneOverlaps: CrossRefMilestoneOverlap[];
   };
   ```
2. **Write the core** `lib/ingest/cross-reference.ts` (`crossReferenceProposal(proposalId)`):
   - Load the proposal via the **Prisma singleton** (`prisma.ingestProposal.findUnique`), guard `status === "pending"` and `isUnifiedProposal(proposal.proposal)`.
   - **Re-resolve:** call `detectTargets({ content: proposal.transcript, title: proposal.title })`. (Gmail/Fireflies bodies live in `transcript`; emails are scraped from it the same way `extractUnified` already does — `composer-actions.ts:122`.) Set `alreadyMatched = !!(matchedClientId || matchedDealId || matchedProjectId || matchedContactId)`. `suggestedMatches = result.targets`; `ambiguous = result.ambiguous`. **Refactor note:** `detectTargets` is currently a `"use server"` export that calls `auth()` itself (`composer-actions.ts:104-105`). Extract its pure matching body into a plain helper in this module (e.g. `resolveTargetsFromText`) that takes the text and runs the Prisma queries **without** `auth()`; have the existing `detectTargets` action call it (one-line delegation) so the composer path is unchanged. This keeps a single matching implementation and avoids nested-server-action auth quirks.
   - **Compute overlap (read-only, no transaction needed — but the dedup helpers take a `tx`):** the helpers are typed `Tx = Parameters<...>[0]` but only call `tx.task.findMany` / `tx.milestone.findMany`, so the **singleton satisfies the shape** — pass `prisma` directly. For each `data.tasks[i]` call `findDuplicateOpenTask(prisma, { title, clientId, projectId })`; record an overlap with the resolved `scope`. For milestones, walk `data.records[ri]` where `kind === "project"`, and for each `milestones[mi]` call `findDuplicateOpenMilestone(prisma, { title, projectId: record.recordId })`. (Milestones inherit the record's project at apply time — `composer-actions.ts:552-570` — so scope by `record.recordId`.)
   - Return `CrossReferenceResult` (do **not** mutate anything here — pure compute, so it's reusable/testable).
3. **Write the action** `crossReferenceUnified(proposalId, opts?: { persistFocusKind?: IngestTargetKind; persistFocusId?: string })` in `composer-actions.ts`:
   - `auth()` guard (mirror the other actions, `:262-264`).
   - Call `crossReferenceProposal(proposalId)`.
   - **Optional persist:** if the proposal had no focus (`!alreadyMatched`) and exactly one client was suggested (or the partner passed an explicit `persistFocusKind/Id` from the chip), update `IngestProposal.matched*` for that one kind (set the matching column, leave others) inside a `prisma.$transaction` with one `writeAudit(tx, { actor: agentActor("ingest"), action: "crossReference.ingestProposal", targetType: "IngestProposal", targetId, changes: { focus, suggestedCount, taskOverlaps: n, milestoneOverlaps: n } })`. Set `result.persistedFocus` accordingly. If nothing is persisted (ambiguous / already matched), still write **one audit row** (action `crossReference.ingestProposal`, `changes` carrying the overlap counts) so the diagnostic round-trips per the "nothing happens silently" rule — but make this audit-only, no firm-record mutation.
   - `revalidatePath("/ingest")` only if `matched*` changed.
   - Return the `CrossReferenceResult`.
4. **Wire the button into `UnifiedProposalCard`:**
   - Add state: `const [xref, setXref] = useState<CrossReferenceResult | null>(null)`, `const [xrefPending, startXref] = useTransition()`.
   - Add a button in the card body (near the Summary/deal selector block, `:334-345`): `Cross-reference records & tasks`. On click → `startXref(async () => setXref(await crossReferenceUnified(proposal.id)))`.
   - **Render suggested matches** as Track-Gold chips when `xref.suggestedMatches.length` and the card has no deal/scope chosen: clicking a chip sets the existing `dealId` state (if `kind==="deal"`) or — for client/project/contact — surfaces a confirm line "This looks like {label}" and (optionally) calls `crossReferenceUnified` again with `persistFocusKind/Id` to write `matched*`. Reuse the existing `deals` prop; the deal selector at `:337-344` is the existing affordance to "confirm which it belongs to."
   - **Render task overlaps:** in the Tasks block (`:421-489`), for each task whose index is in `xref.taskOverlaps`, show a `Badge tone="red"` "already on the board" with the `existingTitle`, and **default that task's `keep` to false** (flip `tasks[ti].keep` when `xref` lands). This is the "skip instead of duplicate" affordance — the partner can re-check to force-create, or leave it skipped to merge into the existing task. (A reassign-flagged task — `t.reassignTaskId` — is exempt: it re-owns, not creates, per `composer-actions.ts:663-668`; show "will re-own existing" instead of an overlap warning.)
   - **Render milestone overlaps:** in each `RecordSection` milestones block (`:714-761`), badge the matching milestone and default its `keep` false the same way.
   - Keep the existing approval path unchanged: because overlap-flagged items are simply pre-unchecked, `buildSelections` (`:218-266`) already drops them — and the approval-time dedup (`composer-actions.ts:554, 664`) remains as the final backstop if the partner force-checks anyway.
5. **Copy** (direct, plain): button = `Cross-reference records & tasks`; result header = `Checked against your records`; task badge = `already on the board`; suggested-match line = `Looks like {label} — set as the focus?`; empty result = `No matches found and nothing duplicates open work.` (No "locked", no jargon.)
6. **Type-check + build** (`npx tsc --noEmit` + `npm run build`) — both must be clean before any push.

## Blast radius (what could break, which call sites, shared types/signatures touched)
- **`detectTargets` refactor is the one shared-signature touch.** If I extract its body into `resolveTargetsFromText`, the existing call site is the composer (search shows `detectTargets` is consumed in `components/ingest/ingest-composer.tsx` — not in my read set but it's the only caller). I keep `detectTargets`'s exported signature **identical** (still `{content, emailBlock?, title?} → {targets, ambiguous}`) and have it delegate, so the composer is untouched. Risk is low but this is the file to re-verify.
- **`UnifiedProposalCard` props/contract:** I add internal state only; the `UnifiedProposalCardProps` (`:125-144`) and the `ingest-view.tsx` → card prop mapping (`:103-122`) are unchanged. No change to `IngestView`'s props or `page.tsx` query.
- **`approveUnified` is NOT modified** — the cross-reference only pre-unchecks items; the existing approval transaction and its dedup backstop stay exactly as-is. Zero risk to the write path.
- **`matched*` write** reuses the same columns/semantics as `extractUnified`; the only new writer is the optional-persist branch. The v1 cards (`ProposalCard`, `ProjectProposalCard`) and v1 actions (`actions.ts`) are not touched — scoping cleanly to v2 (recommended) means v1 proposals simply don't show the button.
- **dedup helper `Tx` typing:** passing the singleton `prisma` where the helper expects a `tx` works because the helper only uses `.task`/`.milestone` `findMany`, both present on the singleton — but it's a slightly looser use than the existing transaction-only call sites; confirm `tsc` is happy (the type is structural, so it should be).

## Risks / edge cases
- **Stale overlap after compute.** If the partner cross-references, then a teammate closes the duplicate task, the badge is stale. Mitigation: the approval-time dedup (`composer-actions.ts:664`) is the source of truth; cross-reference is advisory. Acceptable.
- **Re-resolve picks the wrong client.** `detectTargets` is heuristic (company-name substring, `:164-184`). When `ambiguous` or zero matches, **do not auto-persist** `matched*` — only show chips and require a click. This preserves "unassigned beats wrong" (`actions.ts` header).
- **Already-matched proposals.** If `matched*` is already set, skip auto-persist, still compute overlap (the more useful half) and set `alreadyMatched: true` so the UI shows "already attached to {label}".
- **Milestone scope when the record has no project FK.** A milestone proposed on a `recordId: null` inline-new contact can't have project scope; only run milestone dedup for `kind==="project"` records with a non-null `recordId` (matches apply-time behavior).
- **Normalization mismatch.** Overlap uses `normalizeTitle` (`dedup.ts:26`) — the same function approval uses — so the badge and the actual skip agree. Don't reimplement matching in the card.
- **Force-check after a skip.** If the partner re-checks an overlap-flagged task and approves, approval-time dedup will skip it again and report it — so they can't accidentally create the dup even by overriding the UI. Surface a small note ("approval will still skip exact duplicates") so the behavior isn't surprising.
- **No transaction for the read path.** Overlap compute is N+M `findMany` calls (one per proposed task/milestone). Proposals are small (a handful each), so this is fine; if ever large, batch into one `findMany` per scope and match in memory.

## Open decisions for Jason (anything needing his call — migrations, deps, model forks)
1. **Scope to v2 only?** Recommended: the button appears only on `UnifiedProposalCard` (v2). v1 cards (`ProposalCard`/`ProjectProposalCard`) keep their current silent-at-approval dedup. Do you want v1 covered too, or is v2-only fine? (v1-too roughly doubles the UI work for legacy shapes we're moving off.)
2. **Auto-persist the re-resolved focus, or always require a click?** Recommended: auto-write `matched*` only when exactly **one** client matches and the proposal was unmatched; otherwise show chips and require the partner to confirm. OK to auto-persist the unambiguous single-client case, or should every match be partner-confirmed before we touch `matched*`?
3. **Default overlap-flagged items to unchecked?** Recommended: yes — a "looks like existing X" task/milestone defaults to **skip** (unchecked), partner re-checks to force-create. Agree, or default them checked-with-a-warning?
4. **No migration confirmation:** this workstream needs **no** schema change and runs **no** migration — so it will **not** bundle the in-flight OpsEvent/OpsKind/OpsStatus/ops_alert changes. Confirming you're fine that cross-reference ships purely as code (action + UI), with re-resolved matches stored in the existing `matched*` columns.

## Verify plan (how we'd test it actually works)
- **Unmatched re-resolve:** seed/locate a pending Gmail or Fireflies v2 proposal with `matched*` all null whose transcript names a known client. Click cross-reference → expect a suggested-match chip for that client; confirm → expect `matched*` written (check the row / audit `crossReference.ingestProposal`) and `/ingest` revalidated.
- **Task overlap:** ensure an open task with a title matching a proposed task exists on the resolved client/project. Click → expect the proposed task badged "already on the board" and pre-unchecked; approve → confirm the task is **not** duplicated and the approval audit shows it under `tasksSkippedAsDuplicate` only if force-checked (else it simply wasn't in the payload).
- **Milestone overlap:** same for a live (non-complete) milestone on the resolved project.
- **Ambiguous:** transcript naming two clients → expect `ambiguous: true`, chips shown, **no** auto-persist of `matched*`.
- **Already matched:** a v2 proposal with `matchedClientId` set → button still computes overlap, shows "already attached," writes no new match.
- **Backstop intact:** force-check an overlap-flagged task and approve → approval-time dedup still skips it (proves cross-reference is advisory, not load-bearing for safety).
- **Regression:** run the composer end-to-end (`detectTargets` via the composer) to confirm the `resolveTargetsFromText` extraction didn't change compose-time matching. `npx tsc --noEmit` + `npm run build` clean.

## Effort (S / M / L + one-line justification)
**M** — no schema/deps and the core logic (matching + dedup) already exists and is reused; the work is one new server action, a small reusable `cross-reference.ts` (plus a careful `detectTargets` extraction), and a focused UI section inside one existing card with pre-uncheck wiring.

---

## Appendix Plan 2: #3 - Read attachments + files (PDF/Word/Excel/MD/HTML)

I have everything I need. No PDF/Word/Excel/HTML parsing libs are installed; `papaparse` exists (already used) but CSV already reads as plain text. The Anthropic SDK stable API supports native PDF document blocks. `next.config.ts` uses `outputFileTracingIncludes` (relevant if a lib ships a worker/wasm asset). `vercel.json` does NOT set per-function `maxDuration` (it's in the route files). Now I'll write the plan.

## Goal (1-2 lines)
Make ingest read the *content* of attached and uploaded PDF / Word / Excel / Markdown / HTML files — not just the email/transcript body — by lifting all file parsing to one server-side extraction module, wiring it into the browser composer upload path and the Gmail poll's attachment parts, and feeding the extracted text into the existing propose-never-auto-write extraction. No schema change.

## Current state confirmed (what you verified by READING files; cite file:line)
- **Browser composer only reads plain text, rejects binaries.** `components/ingest-view.tsx:165` and `components/ingest/ingest-composer.tsx:30` both define `TEXT_EXTS` (txt/md/markdown/vtt/srt/text/log/rtf/csv); `loadFile()` (`ingest-view.tsx:180-200`, `ingest-composer.tsx:106-126`) uses `FileReader.readAsText` and explicitly errors on a binary file with "looks like a binary file (e.g. .docx / .pdf). Export it to text/markdown" (`ingest-view.tsx:185`, `ingest-composer.tsx:111`). The `<input accept=...>` lists only text exts (`ingest-view.tsx:268`, `ingest-composer.tsx:418`). All parsing is client-side; the server actions receive already-extracted `content`/`transcript` strings.
- **The composer submit path sends only strings.** `IngestComposer.submit()` calls `extractUnified({ content, emailBlock, ... })` (`ingest-composer.tsx:175-183`); `extractUnified` (`app/(app)/ingest/composer-actions.ts:253-408`) trims `content`, requires ≥40 chars (`:271`), builds `intake = "## Content\n…\n## Email block\n…"` (`:293-295`), and calls `generate({ skill: "ingest", context, intake, maxTokens: 3500 })` (`:297`). It sends **no** document/image content blocks. Nothing about the file bytes survives to the server today.
- **Gmail body only; attachments never fetched.** `lib/gmail.ts` `getEmail()` (`:177-192`) walks the MIME tree via `extractBody()` (`:157-170`), prefers `text/plain`, falls back to stripped `text/html`, caps at 20k chars (`:190`). It never reads parts with a `filename`/`attachmentId`. `ParsedEmail` (`:137-146`) has no attachments field. The cron (`app/api/cron/gmail-poll/route.ts`) feeds `intake: "## Email body\n${email.body}"` to `generate({ skill: "ingest-email", … })` (`:188-194`) — body only.
- **Fireflies needs nothing.** `lib/fireflies.ts` `flattenTranscript()` (`:84-89`) is transcript text only; there are no files in the Fireflies payload. Confirmed out of scope.
- **The Claude helper does not currently send content blocks.** `lib/ai.ts` `buildMessageParams()` (`:110-134`) sets `messages: [{ role: "user", content: userText }]` — a **plain string**. `generate()`/`generateStream()` (`:154`, `:194`) pass that through. To send a document block the user message must become a `content[]` array.
- **Installed Anthropic SDK already supports native PDF on the stable API.** `node_modules/@anthropic-ai/sdk@0.100.1` exposes `DocumentBlockParam` (`resources/messages/messages.d.ts:551`) with `source: Base64PDFSource | PlainTextSource | ContentBlockSource | URLPDFSource`, and `Base64PDFSource` (`:100-104`) = `{ type: "base64"; media_type: "application/pdf"; data: string }`. This is on `client.messages.create` (not beta-only) — `ContentBlockParam` includes `DocumentBlockParam` (`:527`). **I have NOT confirmed the exact request-time shape against the live claude-api reference; the main session must verify at build time** (model PDF support, page/size caps). Design keeps the PDF route swappable.
- **No parsing libs installed.** `package.json` has `papaparse` (already used elsewhere) but **no** pdf/docx/xlsx/html parser. `grep` of `package-lock.json` for unpdf/pdf-parse/mammoth/xlsx/node-html-parser → none.
- **Serverless budget.** Both crons set `maxDuration = 300` in the route file (`gmail-poll/route.ts:27`); `vercel.json` sets only the cron schedules, no per-function `maxDuration`. The interactive `extractUnified` server action has **no** `maxDuration` and runs under the platform default. `next.config.ts` uses `outputFileTracingIncludes` for `skills/**/*.md` — the same mechanism is needed if a parsing lib ships a runtime asset (e.g. a wasm/worker file).
- **Persistence recipe intact / coordination point.** `extractUnified` writes **only** a pending `IngestProposal` (`composer-actions.ts:385-401`); the real writes happen in `approveUnified` on approval. The working tree has an un-migrated `OpsEvent` model + `OpsKind`/`OpsStatus` enums + `MessageKind.ops_alert` (`prisma/schema.prisma:165-171`, `:1568-1581`) plus untracked `lib/ops.ts` — already imported by the cron and `lib/ai.ts`. This workstream needs **no** migration, so it does not touch that pending change.

## Schema changes + migration sketch (Prisma model/field deltas + a short SQL-ish sketch; or "None")
**None.** Extracted attachment text is transient — it is appended to the `content`/`intake` string that feeds the existing extraction, exactly like pasted text. The resulting proposal already persists in `IngestProposal.proposal` + `.transcript` (`schema.prisma:1369-1370`), and on approval the source is filed to Drive + `Artifact` by the *existing* `approveUnified` path (`composer-actions.ts:451-465, 688-703`). Nothing new needs storing.

> Note: this avoids the live-prod-Supabase migration approval gate entirely, and avoids bundling the in-flight `OpsEvent` migration. If a future iteration wants to persist each parsed attachment as its own `Artifact`, that is a separate, optional follow-up needing its own schema discussion — flagged, not built here.

## New dependencies (npm packages + why + serverless/Vercel compatibility note; or "None")
Three text-extraction libs, all pure-JS / serverless-safe, plus one decision to resolve for PDF. (`papaparse` is already a dep, reused for any CSV path.)

| Type | Package | Why | Vercel / serverless note |
|---|---|---|---|
| **Word (.docx)** | `mammoth` | Mature docx→text/html; we call `extractRawText({ buffer })`. | Pure JS, no native bindings, no binary. Bundles cleanly into a Lambda. (.doc legacy binary is **not** supported → unsupported-type fallback.) |
| **Excel (.xlsx/.xls)** | `xlsx` (SheetJS community build) | Reads workbook from a buffer; we emit each sheet as CSV/TSV text via `utils.sheet_to_csv`. | Pure JS, no native deps. Note: install from the SheetJS source per their guidance if the npm registry build lags; the community build on npm is fine for read. |
| **HTML** | `node-html-parser` | Parse + strip to text. Lighter and faster than `jsdom` (which pulls a large tree of deps and is heavier in a Lambda). | Pure JS, tiny, serverless-friendly. (Alternative: keep the existing regex `replace(/<[^>]+>/g, " ")` already in `gmail.ts:167` for a zero-dep strip — see Open decisions.) |
| **Markdown** | none | Markdown is already readable text — passthrough (optionally strip nothing). No lib. | — |
| **PDF** | **DECISION — see below** | — | — |

**PDF — two routes compared, with a recommendation:**

- **Route 1 — native PDF document block to Claude (RECOMMENDED).** Convert the PDF bytes to base64 and pass a `DocumentBlockParam` (`{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }`) in the user message. **No new dependency** — the installed SDK already types this on `client.messages.create`. Claude does the PDF text + layout extraction itself (better on scanned/structured PDFs than a text scrape). Trade-offs: (a) requires teaching `lib/ai.ts` to accept content blocks (small, localized change — see below); (b) adds input tokens / cost per PDF and modest latency; (c) PDF page/size limits apply (the main session confirms current caps against the claude-api reference). For ingest — low volume, partner-reviewed, three partners — this is the right call: best extraction quality, zero bundling risk, swappable.
- **Route 2 — server-side text scrape with `unpdf` (or `pdf-parse`).** `unpdf` is a serverless-oriented pdf.js repackage that returns text without a filesystem/worker dependency (`pdf-parse` is older and has shipped quirky bundling, e.g. a debug path that reads a test file at import — avoid). Trade-offs: keeps everything as plain text (uniform with the other types, no AI-call change), but scraped text loses layout, fails on scanned/image PDFs, and adds a dep + a wasm/worker asset that must be traced into the Lambda via `outputFileTracingIncludes` in `next.config.ts`.

**Recommendation: Route 1 for PDF** (native document block), Route 2 libs (`mammoth`, `xlsx`, `node-html-parser`) for the binary office/HTML formats — those have no native-block equivalent, so server-side extraction is the only path. This split means: PDF → one document content block; everything else → extracted text appended to the intake string. **All four deps need Jason's install approval** (see Open decisions).

## New files (path + one-line purpose)
- `lib/ingest/extract-file.ts` — single server-side extraction module: `extractFile(input: { base64?: string; bytes?: Buffer; mimeType: string; fileName: string }) => Promise<ExtractedFile>` where `ExtractedFile = { kind: "text" | "pdf-document"; text?: string; documentBase64?: string; fileName: string; truncated: boolean; note?: string }`. Dispatches by extension/MIME to mammoth / xlsx / node-html-parser / passthrough, and routes PDF to the document-block branch (or text scrape if Route 2 is chosen). Owns per-file size caps and the unsupported-type fallback. Server-only (reads bytes, imports parsing libs) — never imported by a client component.

## Modified files (each: path — what changes in one line)
- `lib/ai.ts` — `GenerateInput` gains an optional `documents?: { base64: string; fileName: string }[]`; `buildMessageParams` builds the user `content` as `[ ...documents.map(d => documentBlock(d)), { type: "text", text: userText } ]` when documents are present, else keeps the plain string (back-compat). The document-block constructor is isolated in one helper so the PDF route is swappable.
- `app/(app)/ingest/composer-actions.ts` — `extractUnified` input gains `files?: { base64: string; mimeType: string; fileName: string }[]`; before building `intake`, loop each file through `extractFile()`, append `## Attachment: <name>\n<text>` to the content (text kind) or collect into a `documents` array (pdf kind) passed to `generate()`. Adjust the ≥40-char guard to consider extracted-attachment text so a "PDF-only, empty body" ingest still proceeds. Add `export const maxDuration = 300;` (the interactive path may now chain parse + a PDF-bearing Claude call). Persistence path unchanged.
- `components/ingest/ingest-composer.tsx` — `loadFile()` stops rejecting binaries: read the file as base64 (`FileReader.readAsDataURL` → strip the `data:…;base64,` prefix) for binary types, keep `readAsText` for the existing text exts; stash picked files in a new `files` state ({ base64, mimeType, fileName }); widen the `<input accept>` and the dnd helper copy to include `.pdf .docx .xlsx .html`; pass `files` to `extractUnified`. Show a per-file "parsing server-side" hint; keep the textarea for pasted text. (The file is parsed on the server, not in the browser.)
- `components/ingest-view.tsx` — the legacy `PasteModal` `loadFile()` (`:180`): same treatment **or** leave as-is and steer binaries to the new composer. Recommend the minimal change: widen its accept + base64 path only if `PasteModal` is still a live entry point (it appears legacy vs. the unified `IngestComposer`); otherwise update only the rejection copy. Confirm which is live before editing (blast-radius item).
- `lib/gmail.ts` — `ParsedEmail` gains `attachments: { fileName: string; mimeType: string; attachmentId: string; size: number }[]`; `getEmail()` walks the MIME tree for parts with a `filename` + `body.attachmentId` and records them (metadata only — no fetch here). Add `fetchAttachment(gmail, messageId, attachmentId) => Promise<Buffer>` (calls `gmail.users.messages.attachments.get`, base64url-decodes `data`). Keep the 20k body cap; attachments are capped separately in `extract-file.ts`.
- `app/api/cron/gmail-poll/route.ts` — after `getEmail()`, for each attachment (capped count + total bytes, supported types only) call `fetchAttachment` → `extractFile` → append `## Attachment: <name>\n<text>` to the intake (text kind) or pass via `documents` to `generate({ skill: "ingest-email", … })` (pdf kind). Already has `maxDuration = 300`. Wrap per-attachment parse in try/catch so one bad file doesn't fail the message (mirrors the existing per-message try/catch at `:187-197`).

## Step-by-step build approach (numbered, concrete, in build order)
1. **Confirm deps + PDF route with Jason** (Open decisions). Install `mammoth`, `xlsx`, `node-html-parser` (+ `unpdf` only if Route 2 chosen). `npx tsc` clean.
2. **Build `lib/ingest/extract-file.ts`** with a pure dispatch table keyed by extension then MIME: `.md/.markdown/.txt/.csv/.vtt/.srt/.log/.rtf` → text passthrough (CSV via `papaparse` only if a structured form is wanted; plain text is fine); `.docx` → `mammoth.extractRawText`; `.xlsx/.xls` → `xlsx` per-sheet `sheet_to_csv` joined with sheet headers; `.html/.htm` → `node-html-parser` text; `.pdf` → return `{ kind: "pdf-document", documentBase64 }` (Route 1) or scraped text (Route 2). Enforce **per-file cap** (e.g. 25 MB raw / ~50k extracted chars → `truncated: true`) and **unsupported type** → `{ kind: "text", text: "", note: "Unsupported file type — skipped: <name>" }`. Unit-test against one fixture per type.
3. **Teach `lib/ai.ts` to send documents.** Add `documents?` to `GenerateInput`; in `buildMessageParams`, when `documents?.length`, build the user `content` array with one document block per entry + a trailing text block; otherwise unchanged. Isolate the document-block constructor (so swapping native↔scrape later is one function). Verify `generate()` and `generateStream()` still compile and existing string callers are untouched.
4. **Wire the Gmail poll (server, lower risk first).** Extend `ParsedEmail` + `getEmail()` to enumerate attachment parts; add `fetchAttachment`. In `gmail-poll/route.ts`, fetch + `extractFile` each supported attachment under a count/byte cap, append text-kind to intake and pass pdf-kind via `documents`. Keep within the per-message try/catch; rely on existing `maxDuration = 300`.
5. **Wire the composer upload path.** In `ingest-composer.tsx`, base64-read binaries, accumulate `files` state, widen `accept` + copy, pass `files` to `extractUnified`. In `composer-actions.ts`, loop `extractFile`, merge into `intake`/`documents`, relax the ≥40 guard to count attachment text, add `maxDuration = 300`.
6. **Handle the legacy `PasteModal`** in `ingest-view.tsx` per the blast-radius decision (widen or redirect).
7. **Caps + fallbacks polish:** per-file cap, total-across-files cap, unsupported-type note surfaced into the proposal summary/UI so a skipped attachment is never silent (consistent with the firm's "nothing happens silently" rule).
8. **Verify** (see Verify plan). `npx tsc --noEmit` + `npm run build` clean before any push.

## Blast radius (what could break, which call sites, shared types/signatures touched)
- **`lib/ai.ts` `GenerateInput` / `buildMessageParams`** is the highest-leverage change — every Quick Action and agent calls `generate()`/`generateStream()` (Fireflies, Gmail, contact scan, scope, etc.). The change is **purely additive** (new optional `documents?`; string path preserved when it's absent), so existing callers are unaffected — but a mistake here ripples everywhere. Keep the no-documents branch byte-identical to today to preserve **prompt caching** (the cached system blocks are unaffected; only the user message changes).
- **`lib/gmail.ts` `ParsedEmail`** is consumed by `gmail-poll/route.ts` (participants/body). Adding a field is additive; the new `attachments` array is ignored by anything that doesn't read it.
- **`extractUnified` signature** gains optional `files?`; the composer is the only caller. The relaxed ≥40-char guard must still reject genuinely empty ingests.
- **Drive filing in `approveUnified`** files `proposal.transcript` (`composer-actions.ts:456`). If attachment text is appended into `content` (and thus `transcript`), the filed `.md` grows to include attachment text — intended, but worth noting the filed artifact changes shape.
- **Cost/latency:** PDFs via native block add input tokens per ingest and push the interactive action toward the function time limit → the `maxDuration = 300` additions matter (and imply the Vercel Pro plan already in use for crons).
- **`PasteModal` (`ingest-view.tsx`)** — must confirm it's still wired before editing; double-editing a dead path wastes effort, skipping a live one leaves a broken "export to text" message.

## Risks / edge cases
- **Live claude-api PDF shape / limits unconfirmed.** Page-count and size caps and exact `media_type` handling must be checked against the reference at build time (flagged). Mitigation: isolate the document-block constructor; if Claude rejects a too-large/too-many-pages PDF, fall back to Route 2 scrape or a "PDF too large — attach text" note.
- **Scanned / image-only PDFs** yield no text under Route 2; Route 1 (Claude) handles them far better — a point in Route 1's favour.
- **Huge spreadsheets** can explode to enormous CSV text → must cap per-file extracted chars and total, mark `truncated`.
- **Encrypted / password-protected** PDF/docx → catch the parser error, emit unsupported-type note, never throw into the ingest.
- **`.doc` (legacy binary), `.pages`, `.key`, images** → unsupported; explicit skip note.
- **Gmail attachment size** — `attachments.get` returns base64url; very large attachments can blow memory/time. Cap count (e.g. ≤5) and total bytes per message; skip the rest with a note.
- **Base64 in the browser** — `readAsDataURL` on a large file holds it in memory and inflates the server-action payload ~33%. Cap client-side file size with a clear message before upload.
- **Prompt-cache integrity** — putting documents in the user message (after the cached system prefix) is correct; do **not** add a `cache_control` document block that would change the cached prefix.
- **MIME unreliability** — Gmail/`File.type` sometimes give `application/octet-stream`; dispatch on extension first, MIME second.

## Open decisions for Jason (anything needing his call — migrations, deps, model forks; phrase each as a crisp question)
1. **Approve adding `mammoth`, `xlsx`, `node-html-parser` as dependencies?** (All pure-JS, serverless-safe; no native bindings.)
2. **PDF route: native document block to Claude (Route 1, recommended — no new dep, best on scanned/structured PDFs, adds per-ingest tokens) vs. server-side text scrape with `unpdf` (Route 2 — uniform plain text, no AI-call change, but a wasm/worker asset to bundle and weak on scanned PDFs)?**
3. **HTML stripping: add `node-html-parser`, or reuse the existing zero-dep regex strip already in `lib/gmail.ts:167`?** (Regex is cruder on nested markup but adds nothing.)
4. **Caps — OK to set per-file ≈25 MB / ~50k extracted chars, and Gmail ≤5 attachments / ~15 MB total per message, with truncation marked?** (Tune to taste.)
5. **Legacy `PasteModal` in `ingest-view.tsx` — is it still a live entry point?** If retired, I'll only fix its rejection copy; if live, I'll give it the same base64 upload path as the composer.
6. **Confirm: no need to persist each parsed attachment as its own `Artifact` for now** (extracted text just feeds extraction; the existing approval already files the combined source to Drive). If you want per-attachment artifacts later, that's a separate schema change needing the live-prod-migration approval.

## Verify plan (how we'd test it actually works)
- **Unit:** one fixture per type (`.pdf`, `.docx`, `.xlsx`, `.md`, `.html`, plus an unsupported `.doc`) through `extractFile()` → assert text extracted / pdf-document branch taken / unsupported note returned / truncation flag on an oversized fixture.
- **Composer (interactive):** `npm run dev` (port 3030), open Ingest, drop a `.docx` and a `.pdf` with a near-empty body, Extract → confirm a pending proposal whose summary/keypoints reflect the *attachment* content; confirm nothing is written until approve (propose-never-auto-write intact); approve and confirm the filed Drive `.md` + `Artifact` include the attachment text.
- **Gmail poll:** trigger `GET /api/cron/gmail-poll?secret=$CRON_SECRET` against a labeled message carrying a PDF + xlsx attachment → confirm the created `IngestProposal` reflects attachment content and is idempotent on re-run; confirm a corrupt attachment logs but doesn't fail the message.
- **Regression:** an ingest/email with **no** attachments produces byte-identical behavior to today (string user message, prompt cache still hits — check `cache_read_input_tokens` via the `logOps` `claude` row).
- **Gate:** `npx tsc --noEmit` + `npm run build` clean; PDF request shape spot-checked against the claude-api reference before merge.

## Effort (S / M / L + one-line justification)
**M** — one new module plus a small, well-isolated additive change to `lib/ai.ts` and two wiring sites (composer + Gmail poll); no schema/migration, but PDF-route confirmation, four parser integrations with caps/fallbacks, and the broad-but-additive `generate()` touch put it above S.

---

## Appendix Plan 3: #1 - Beef up thin client/contact/deal records

Confirmed the gaps:
- `Contact.domain` exists in schema but is **never surfaced** on the contact detail page and **not editable** in any contact form (no UI for it).
- `deal-edit-modal.tsx` has **no website/domain field**.
- `normalizeDomain()` in `lib/apollo.ts` is the canonical helper to reuse.

I have all patterns. I'll now design the plan. Let me resolve the company-facts fork: the Deal links to ONE Contact (`contactId`), and the Contact already carries `company` + `domain` fields. Workstream #2 is the company/stakeholder model. The least-redundant path is to write company facts onto the linked Contact (option a) for the website/domain gap, but a deal's *company profile* (size/HQ/founded/etc.) has no home on Contact — so I need to weigh adding a minimal field set to Deal vs. deferring. Let me write the plan now.

## Goal (1-2 lines)
Close the "thin deal record" gap by extending the firm's proven propose-then-apply web-enrich pattern to Deals, and surface the already-stored `Contact.domain` (website) on both the contact and deal detail pages. Deal company facts live on the linked Contact + a minimal company-profile field set added to Deal, mirroring the Client company-profile store one-for-one.

## Current state confirmed (what you verified by READING files; cite file:line)
- **Deals are the gap.** `Deal` model (`prisma/schema.prisma:436-466`) has `company, stage, valueEstimate, industry, closeTargetDate, lastTouchAt, stageEnteredAt, coldOutreachAt, outreachRepliedAt, notes` — **no website, no domain, no company-profile fields, no `enrichedAt`**. No enrich action exists in `app/(app)/pipeline/[id]/actions.ts` (it has `convertDeal`, `updateDeal`, `markDealReplied`, `generateProposal`/`saveProposal`, `generateDealDoc`/`saveDealDoc`, and the `structureDealNotes` append-only contact-facts lift at `pipeline/actions.ts:246-350`).
- **A Deal links to exactly one Contact** via `contactId` (`schema.prisma:454-455`); `deal-context.ts:11-32` already loads `contact { id,name,title,company,email,source }`. The contact's company IS the deal's company. There is no Company/Organization model in the schema — company profile fields live **only on `Client`** (`schema.prisma:490-500`: `companySize, headquarters, founded, website, ownership, description, brandColors, logoMonogram, companyKeyFacts, enrichedAt`).
- **Contact already has `domain` (`schema.prisma:384-386`)** — "normalized bare domain… powers the 'already in pipeline' dedup… NOT unique" — but it is **never surfaced** on the contact page (`contacts/[id]/page.tsx` shows company/industry/source/email/phone but no domain/website; grep for `.domain` in `app/(app)/contacts` = no matches) and **not editable** in any contact form.
- **The exact pattern to mirror exists twice:**
  - Contact: `generateEnrichment`/`generateWebEnrichment`/`applyEnrichment` (`contacts/[id]/actions.ts:519-806`) — split `ENRICH_LIST_FIELDS`/`ENRICH_SCALAR_FIELDS`, `parseEnrichmentJSON`, append-only list merge + set-if-empty scalars, `enrichedAt` stamp, `agentActor("enrich-contact")`, `writeAudit` + `writeActivity`.
  - Client company: `generateCompanyEnrichment`/`applyCompanyEnrichment` (`clients/[id]/actions.ts:541-693`) — `COMPANY_ENRICH_LIST_FIELDS = ["companyKeyFacts","brandColors"]`, `COMPANY_ENRICH_SCALAR_FIELDS = ["companySize","headquarters","founded","website","ownership","description"]`, web search via `enrich-company-web` skill, identical merge semantics.
- **UI to mirror:** Client company-profile + enrich card in `client-detail-tabs.tsx:160-389` (`CompanyProfile`), the contact "Thin record" nudge banner at `contacts/[id]/page.tsx:94-108` (gated on `enriched = Boolean(persona || keyFacts.length || background)`), and the deal-actions panel `ActionsPanel` at `deal-actions.tsx:100-231`.
- **Plumbing confirmed:** `generate({ webSearch: true, maxTokens: 2000 })` exists (`lib/ai.ts:154`, `WEB_SEARCH_TOOL` 107); `normalizeDomain()` is the canonical bare-domain normalizer (`lib/apollo.ts:36-44`); `writeAudit`/`writeActivity`/`agentActor` in `lib/audit`; the enrich-company-web skill already exists (referenced at `clients/[id]/actions.ts:580`).
- **Coordination confirmed:** `prisma/schema.prisma` has un-migrated `OpsEvent` model + `OpsKind`/`OpsStatus` enums (`schema.prisma:1568-1607`) + `MessageKind.ops_alert` (`schema.prisma:170`). Latest migration on disk is `20260606080019_gmail_ingest`; **no migration references `OpsEvent`** (grep = none). Working tree is also dirtier than the start snapshot (untracked `lib/ops.ts`, `components/settings/system-status.tsx`; modified `messages/actions.ts`, `messages-view.tsx`, `settings/page.tsx`). Any `prisma migrate dev` I run **bundles all of this telemetry work** into one migration.

## Schema changes + migration sketch (Prisma model/field deltas + a short SQL-ish sketch; or "None")

**Yes — schema changes required. NEEDS JASON'S APPROVAL before any `migrate` runs (same Supabase as prod), AND it must be coordinated with the un-migrated OpsEvent telemetry work already in the schema (see Open decisions).**

Two-part change on `Deal`. **Recommended path = the least-redundant fork resolution: add a small company-profile field set to `Deal` that 1:1 mirrors `Client`'s, plus a `website` + `domain` on `Deal` for the gap.** Rationale below in Open decisions; this is the path that needs no new model and survives whatever workstream #2 does.

```prisma
model Deal {
  // ... existing fields ...

  // Company profile — mirrors Client's profile block exactly, append-only,
  // never silently overwritten. Lets a deal carry the prospect-company facts
  // (the contact's employer) before it ever becomes a Client. On Convert these
  // copy forward to the new Client row (see convertDeal change below).
  website         String?
  domain          String?   // normalized bare host (normalizeDomain); mirrors Contact.domain. NOT unique.
  companySize     String?
  headquarters    String?
  founded         String?
  ownership       String?
  description     String?
  companyKeyFacts String[]
  enrichedAt      DateTime?
}
```

SQL-ish sketch (what `migrate dev` would emit for the Deal part only):
```sql
ALTER TABLE "Deal"
  ADD COLUMN "website"         TEXT,
  ADD COLUMN "domain"          TEXT,
  ADD COLUMN "companySize"     TEXT,
  ADD COLUMN "headquarters"    TEXT,
  ADD COLUMN "founded"         TEXT,
  ADD COLUMN "ownership"       TEXT,
  ADD COLUMN "description"     TEXT,
  ADD COLUMN "companyKeyFacts" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "enrichedAt"      TIMESTAMP(3);
```
All nullable / array-defaulted → **no backfill, safe additive migration**. No new enums (so the `@map` gotcha doesn't apply here; `brandColors`/`logoMonogram` intentionally omitted from Deal — brand styling is a Client-stage concern, keep the deal set lean).

**Migration coordination (critical):** because the working tree's `schema.prisma` already contains the OpsEvent/OpsKind/OpsStatus/`ops_alert` additions with no migration, running `npx prisma migrate dev --name add_deal_company_profile` will generate ONE migration containing **both** the Deal columns **and** the OpsEvent table + enum value. Options in Open decisions — do not run blind.

`lib/types.ts` also mirrors the schema (per CLAUDE.md "Keep them in sync") — add the same Deal fields there.

## New dependencies (npm packages + why + serverless/Vercel compatibility note; or "None")
**None.** Web search uses Anthropic's native `web_search_20250305` server-side tool already wired in `lib/ai.ts` (no package). `normalizeDomain` already exists. All UI primitives (`Card`, `Button`, `Label`, `Globe` icon) are in use.

## New files (path + one-line purpose)
- `components/deal-enrich-panel.tsx` — client component: the deal "Company profile + Enrich from web" card (mirrors `CompanyProfile` in `client-detail-tabs.tsx`); renders the profile facts, the propose→review→apply enrich flow, and the thin-record nudge. Mounted on the deal detail page.

(No new skill file: reuse the existing `enrich-company-web` skill — its contract is company-profile additions, which is exactly what a Deal needs. If Jason wants deal-specific framing, a `enrich-deal-company-web` skill could be added later, but reuse is the least-redundant call.)

## Modified files (each: path — what changes in one line)
- `prisma/schema.prisma` — add the 9 company-profile fields to `Deal` (migration-gated; see coordination note).
- `lib/types.ts` — mirror the new `Deal` fields on the UI-facing Deal type.
- `app/(app)/pipeline/[id]/actions.ts` — add `generateDealCompanyEnrichment()` (web search, propose-only) + `applyDealCompanyEnrichment()` (append-only merge + `enrichedAt` + audit/activity under `agentActor("enrich-company-web")`), plus add `website`/`domain` handling (with `normalizeDomain`) to the existing `updateDeal`.
- `components/deal-edit-modal.tsx` — add a **Website** input to the edit form; on save, pass `website` through `updateDeal` (domain auto-derived server-side).
- `app/(app)/pipeline/[id]/page.tsx` — render company profile (website link + facts) in the left column, mount `<DealEnrichPanel>`, and show a thin-record nudge when the deal has no profile; show website on the Primary-contact card too.
- `app/(app)/pipeline/actions.ts` — in `createDeal`, seed `Deal.domain`/`website` from the linked `Contact.domain` if present (so a new deal isn't born blank); `structureDealNotes` is untouched.
- `app/(app)/pipeline/[id]/actions.ts` (`convertDeal`) — copy the deal's company-profile fields forward onto the new `Client` row so enrichment done at deal stage isn't lost on signing.
- `app/(app)/contacts/[id]/page.tsx` — surface the existing `Contact.domain` as a website link on the contact record (read-only display; closes the "website missing/surfaced" gap on contacts).
- `app/(app)/contacts/[id]/actions.ts` — add `"domain"` to the contact `enrich-contact-web` scalar field set so web-enrich can populate the website (currently it can't touch domain), with `normalizeDomain` applied in the merge.
- `components/client-detail-tabs.tsx` — **no change needed** (already complete); listed only to note it's the reference, not a target.

## Step-by-step build approach (numbered, concrete, in build order)
1. **(GATE) Get Jason's approval on the migration** + decide the OpsEvent-bundling question (Open decisions Q1/Q2). Do not touch the DB until then.
2. **Schema + types.** Add the 9 fields to `Deal` in `schema.prisma`; mirror in `lib/types.ts`. Run `npx prisma migrate dev --name add_deal_company_profile` **only after approval** (this also writes the bundled OpsEvent table — confirm that's intended, or split first per Q2). `prisma generate` runs via postinstall; `DealModel` picks up the fields.
3. **Server actions — enrich.** In `pipeline/[id]/actions.ts`, port the Client company-enrich code near-verbatim:
   - `DEAL_COMPANY_ENRICH_LIST_FIELDS = ["companyKeyFacts"]`, `DEAL_COMPANY_ENRICH_SCALAR_FIELDS = ["website","companySize","headquarters","founded","ownership","description"]` (drop `brandColors` — not on Deal).
   - Reuse the exact `parseCompanyEnrichmentJSON` shape (copy or extract a shared `lib/company-enrich.ts` parser — see Risks). `generateDealCompanyEnrichment(dealId)` loads the deal's profile fields + the linked contact's company/title/industry for disambiguation, calls `generate({ skill: "enrich-company-web", webSearch: true, maxTokens: 2000 })`, returns `{ additions, conflicts }`.
   - `applyDealCompanyEnrichment(dealId, additions)`: identical merge to `applyCompanyEnrichment` (set-if-empty scalars, dedup'd list append) **plus**: if a `website` addition is applied, also set `domain = normalizeDomain(website)` when `domain` is empty. Stamp `enrichedAt`; `writeAudit`(`update.deal.enrich`) + `writeActivity`(type `ai`, link `/pipeline/<id>`) under `agentActor("enrich-company-web")`. One `$transaction`.
4. **Server action — manual website edit.** Extend `updateDeal`'s input with `website?: string | null`; trim, validate length, and when it changes set `data.website` + `data.domain = normalizeDomain(website) || null`; add both to the `changes` diff. (Keeps the manual path and the AI path consistent.)
5. **Edit modal.** Add a "Website" `<Input>` to `deal-edit-modal.tsx` (under Company), seeded from `deal.website ?? ""`, passed into `updateDeal`. No domain field in the form (derived).
6. **Enrich panel component.** Build `components/deal-enrich-panel.tsx` by adapting `CompanyProfile` from `client-detail-tabs.tsx`: the profile facts grid (Website link via `Globe`, Headcount/HQ/Founded/Ownership), "What they do" (description), Key facts list, and the gold "Keep this current" enrich card with the same `idle → results → applied` `useTransition` flow, calling the two new deal actions. Field-label map drops `brandColors`.
7. **Deal detail page.** In `pipeline/[id]/page.tsx`: add the company-profile/website block to the left column; mount `<DealEnrichPanel deal={deal} />`; add a thin-record nudge `Card` (gold, mirrors `contacts/[id]/page.tsx:94-108`) shown when `!deal.enrichedAt && !deal.website && deal.companyKeyFacts.length === 0`; add the website link to the Primary-contact sidebar card.
8. **Seed-forward on create.** In `createDeal` (`pipeline/actions.ts`), select `contact.domain` (already selects `company,industry`), and set `Deal.domain`/`Deal.website` from it when present (website = `domain` as a display value, or leave website null and only set domain — see Risks). Pure add; `structureDealNotes` flow unchanged.
9. **Copy-forward on convert.** In `convertDeal`, when creating the `Client`, pass `website, companySize, headquarters, founded, ownership, description, companyKeyFacts` from the deal (only where the deal has them) so deal-stage enrichment carries into the client. `enrichedAt` carries too.
10. **Contacts side (website gap).** In `contacts/[id]/page.tsx`, render `contact.domain` as a website link (read-only) near Company. In `contacts/[id]/actions.ts`, add `"domain"` to `ENRICH_SCALAR_FIELDS` for the web path so `enrich-contact-web` can fill it; apply `normalizeDomain` to a proposed `domain` value before set-if-empty. Add `"domain"` to the `ENRICH_FIELD_LABELS` map in `contact-actions.tsx` so it renders as "Website".
11. **`npx tsc --noEmit` + `npm run build`** clean. Add a `lib/data/updates.ts` entry (plain English: "Deals now carry a company profile — pull website + company facts from the web, same review-before-keep flow as contacts and clients"). Update the How-it-works page if it enumerates per-record actions. **Not partner-money sensitive → no gating needed.**

## Blast radius (what could break, which call sites, shared types/signatures touched)
- **`updateDeal` signature change** (add `website?`) — only caller is `deal-edit-modal.tsx` (verified via the import at `deal-edit-modal.tsx:13`); additive optional field, existing call still type-checks.
- **`convertDeal`** — adding fields to the `Client.create` `data` is internal; no signature change. Risk: a deal field is `undefined` vs `null` — guard with `?? undefined` so Prisma omits rather than nulls.
- **`DealModel` widening** — `deal-actions.tsx`, `deal-edit-modal.tsx`, and the deal page all take `DealModel`; new optional fields don't break existing prop usage. `lib/types.ts` Deal type must be kept in lockstep or a structural-typing mismatch surfaces at the page boundary.
- **`createDeal`** — adding a `domain`/`website` select + write is additive; the existing `structureDealNotes` try/catch path is untouched.
- **Contact `ENRICH_SCALAR_FIELDS` change** — adding `"domain"` widens what `applyEnrichment` writes; it's set-if-empty so it can't clobber an existing domain. The `enrich-contact-web` SKILL.md must be told `domain` is now an allowed field, or the model never proposes it (no break, just a no-op until the skill knows). Flag to confirm the skill copy.
- **Shared parser duplication** — if I copy `parseCompanyEnrichmentJSON` into the deal action rather than extracting it, two copies drift. Prefer extracting to `lib/company-enrich.ts` and importing in both `clients/[id]/actions.ts` and `pipeline/[id]/actions.ts` (small refactor, touches one existing file).
- **No middleware/auth/billing surfaces touched.** No cron, no MCP. The OpsEvent coupling is the only non-obvious blast: the migration carries telemetry DDL.

## Risks / edge cases
- **Migration bundling (highest risk).** `migrate dev` will fold the un-migrated OpsEvent telemetry into the Deal migration. If that telemetry isn't ready to ship to prod, the Deal migration drags it along. Mitigation in Open decisions Q2.
- **Wrong-company web facts.** The deal's company name may be generic ("Apex Engineering"). The skill disambiguates with name+industry+website; if `website`/`domain` is empty there's less signal. The enrich card copy must say "review before keep" (it does, by mirroring the client card) and conflicts surface for manual resolution. Never auto-applies — preserves PROPOSE-NEVER-AUTO-WRITE in spirit (though note: this is record enrichment, not Ingest; it still goes through partner approval in the UI before `apply*`).
- **`website` vs `domain` duality.** Client stores `website` (display, e.g. "acme.com") and has no separate domain; ProspectLead/Contact store `domain` (normalized). I'm putting **both** on Deal: `website` for display/edit, `domain` for dedup/seed-forward, with `domain` always derived from `website` via `normalizeDomain`. Edge: a partner types `https://www.acme.com/about` as website → `normalizeDomain` yields `acme.com`. Keep website as-typed for display, domain normalized for matching.
- **Seed-forward ambiguity** (step 8): `Contact.domain` is a bare host, not a URL. Setting `Deal.website = contact.domain` shows "acme.com" with no scheme — the page builds the link as `https://${website}` (matching `client-detail-tabs.tsx:230`). Acceptable. Alternatively seed only `domain` and leave `website` null until enriched — Jason's call (minor; I'd seed both).
- **Idempotency of apply** — append-only with case-insensitive dedupe (copied from the proven path) means re-running enrich never duplicates facts. Good.
- **`enrichedAt` semantics** — both manual website edit and AI apply could stamp it; I'll stamp only on AI `apply*` (matches Client/Contact, where `enrichedAt` means "AI last enriched"), not on manual `updateDeal`. Manual edits already bump `updatedAt`.
- **Thin-record nudge flicker** — the nudge condition must exactly complement the "has profile" render so it doesn't show alongside populated facts (mirror the contact `enriched` boolean precisely).

## Open decisions for Jason (anything needing his call — migrations, deps, model forks; phrase each as a crisp question)
1. **Schema approval:** OK to add the 9 company-profile fields to `Deal` (`website, domain, companySize, headquarters, founded, ownership, description, companyKeyFacts, enrichedAt`) and run the prod-touching migration? It's additive/nullable (no backfill, no downtime).
2. **Migration bundling with OpsEvent telemetry:** `schema.prisma` already has the un-migrated `OpsEvent`/`OpsKind`/`OpsStatus`/`ops_alert` telemetry. Running my migration will fold that into one migration that deploys to prod. Do you want me to (a) bundle them in one migration (telemetry ships when Deal ships), (b) coordinate so the telemetry migration lands first as its own commit, or (c) hand-author a Deal-only migration SQL file to keep them separate? My recommendation: **(b)** — land the telemetry migration on its own (it's clearly further along: `lib/ops.ts`, system-status UI), then mine stacks cleanly on top.
3. **Fork resolution — where deal company facts live:** I recommend adding the profile field set **to Deal** (mirrors Client exactly, no new model, survives whatever workstream #2 ships) rather than (a) cramming them onto the linked Contact or (c) waiting for a shared Company store. If workstream #2 is introducing a real `Company`/`Organization` model, say so and I'll instead point Deal at that FK and skip the Deal columns. Which is it?
4. **Skill reuse vs. fork:** Reuse the existing `enrich-company-web` skill for deals (recommended — same company-profile output), or author a deal-specific `enrich-deal-company-web` skill with prospecting framing?
5. **Contact website surfacing:** I'll add `domain` to the contact web-enrich scalar set and display it as "Website" on the contact page. Confirm the `enrich-contact-web` SKILL.md should be updated to list `domain` as an allowed field (otherwise the model won't propose it).

## Verify plan (how we'd test it actually works)
- **Type/build:** `npx tsc --noEmit` and `npm run build` clean (catches the `DealModel`/`lib/types.ts` mismatch and the modal signature change).
- **Local dev (`npm run dev`, port 3030):** open a seed deal → confirm the thin-record nudge shows; click "Enrich from web" → confirm a `enrich-company-web` call fires (watch the System status / `OpsEvent` telemetry row, or server logs), additions render with checkboxes, conflicts render in red; apply a subset → confirm only selected facts persist, scalars don't overwrite existing, `enrichedAt` stamps, and an Activity row + AuditLog (`update.deal.enrich`) appear.
- **Append-only proof:** re-run enrich → confirm no duplicate key facts (case-insensitive dedupe) and an already-set scalar comes back as a conflict, not an overwrite.
- **Manual edit:** Edit deal → set Website → save → confirm `website` shows as a link and `domain` is the normalized host (check via the record / a quick Prisma read).
- **Convert carry-forward:** enrich a deal, then Convert → Client → confirm the new Client's company profile carries the deal's `website`/facts (open the client Company Profile tab).
- **Contacts side:** open a contact with a `domain` → confirm the website link renders; run contact "Enrich from web" → confirm it can now propose a `domain`/website addition.
- **Persistence-recipe audit:** every `apply*` writes exactly one AuditLog + one Activity; no silent writes (grep the AuditLog after each action).

## Effort (S / M / L + one-line justification)
**M** — the enrich action + UI are a near-verbatim port of two existing, proven patterns (low novel logic), but it spans a gated prod migration, ~8 modified files across deals + contacts + convert, a shared-parser extraction, and the OpsEvent migration-coordination overhead.

---

## Appendix Plan 4: #2 - Capture email stakeholders

I have everything I need. The contact detail page renders a "company" field as plain text and lists the contact's deals. There's no stakeholder surface today. I now have a complete picture of the model, the ingest pipeline (extract → propose → review card → approveUnified), the gmail poll's cc-dropping behavior, and the blast radius of a Company entity (595 refs).

Let me write the plan.

## Goal (1-2 lines)
Capture cc'd/to people who aren't in the system as proposed Contacts, and let a partner link multiple people as named stakeholders/team members to a Client (and Project) — all through the existing propose-never-auto-write ingest gate. Add a lightweight `ClientStakeholder` (and optional `ProjectStakeholder`) join table; leave `company` as free text.

## Current state confirmed (what you verified by READING files; cite file:line)
- **No Company entity; `company` is free text everywhere.** `Contact.company`/`Deal.company`/`Client.company` are plain `String` (`prisma/schema.prisma:377`, `:438`, `:473`). The only Contact↔Client links are the named FKs `primaryContactId` (`:487`) and `billingContactId` (`:505`); `Contact` back-relations are just `primaryForClients`/`billingForClients` (`:403-404`). There is **no Contact↔Project relation** on `Project` (`:522-566` — only `consultants Partner[]`, no contacts) and **no Contact↔Client many-to-many**. So "multiple stakeholders" has no schema home. `company` is referenced 595× across 84 files — a Company refactor is genuinely large.
- **Gmail poll drops unknown cc'd people.** `app/api/cron/gmail-poll/route.ts:167-169` builds `participants = [from, ...to, ...cc]`, filters to `external`, then `matchByEmails(external)` (`:88-114`) returns a match **only when exactly one** existing Contact matches (`contacts.length !== 1 → unassigned`). Unknown addresses are never captured — they only feed the text context. `email.cc` is a lowercased address array (`lib/gmail.ts:177-192`, `getEmail`).
- **Unified proposal shape + apply.** `UnifiedProposal` = `{ schemaVersion: 2, ingestType, summary, keyPoints, records: RecordProposal[], tasks: TaskProposal[] }` (`lib/ingest/types.ts:71-78`). A `RecordProposal` with `recordId: null` is the **inline-new contact** convention (`:46-47`). `approveUnified` (`composer-actions.ts:413-754`) applies records in one `$transaction`; for a `contact` record it **skips `recordId === null`** with the comment "inline-new contact already created via addContactInline" (`:489-490`). So today new contacts must be created *before* extraction via `addContactInline` (`:221-247`), which wraps `createContact` (`contacts/actions.ts:52`).
- **createContact recipe.** One `Contact` + `writeAudit` + `writeActivity` in a `$transaction`, then `revalidatePath("/contacts")` (`contacts/actions.ts:87-127`). Validates email + industry; defaults partnerLead to the signed-in partner.
- **Review card is the v2 surface.** `UnifiedProposalCard` (`components/ingest/unified-proposal-card.tsx`) renders each `RecordProposal` via `RecordSection`, builds `ApproveUnifiedSelections` from only-checked items (`:218-266`). Adding a new proposal section means: a new field on the proposal type + a new render block + threading it into `buildSelections`.
- **Client detail / Project detail UIs.** Client detail (`components/client-detail-tabs.tsx`) shows only a single "Primary contact" card (`:92-101`) and a "Billing contact" line (`:132-137`) — no stakeholder list. Project detail (`app/(app)/projects/[id]/page.tsx:532-554`) has a "Team" card that lists `partnerLead` + `consultants` (Partners) — no client-side people.
- **Coordination — un-migrated changes in the working tree.** `schema.prisma` already contains the new `OpsEvent` model + `OpsKind`/`OpsStatus` enums (`:1568-1607`) and `MessageKind.ops_alert @map("ops-alert")` (`:170`), plus untracked `lib/ops.ts`. These are **not yet migrated** (the gmail poll guards `prisma.partnerGmailAuth` with a try/catch "not migrated yet" at `route.ts:124-131`; `logOps` is already imported at `:15`). Any new migration I generate will bundle these telemetry changes too.

## Schema changes + migration sketch (Prisma model/field deltas + a short SQL-ish sketch; or "None")
**Recommendation: lightweight join tables. `company` stays free text.** Two new models + back-relations. **This is a schema change → it runs against the prod Supabase → needs Jason's explicit approval before `prisma migrate dev`, and it will co-migrate the in-flight `OpsEvent`/`ops_alert` telemetry changes already in the working tree (call that out to Jason).**

New enum (brand-new, no legacy data → plain underscored values, **no `@map`**, per the gotcha and the Import-Contacts precedent at `schema.prisma:265-321`):

```prisma
enum StakeholderRole {
  champion
  decision_maker
  economic_buyer
  technical
  influencer
  blocker
  team_member        // firm-side person embedded on the client/project
  other
}
```

`ClientStakeholder` (Contact ↔ Client, the primary deliverable of this workstream):

```prisma
model ClientStakeholder {
  id        String          @id @default(cuid())
  client    Client          @relation(fields: [clientId], references: [id], onDelete: Cascade)
  clientId  String
  contact   Contact         @relation(fields: [contactId], references: [id])
  contactId String
  role      StakeholderRole @default(other)
  roleLabel String?         // free sub-label, e.g. "VP Ops", mirrors Milestone.categoryLabel
  isPrimary Boolean         @default(false)
  notes     String?
  addedBy   String          // partner label or "AGENT · CLAUDE" (loose-coupling, like Interaction.loggedBy)
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  @@unique([clientId, contactId])   // one link per person per client
  @@index([clientId])
  @@index([contactId])
}
```

`ProjectStakeholder` (optional, same shape, FK to `Project`) — include it now so the migration is one pass:

```prisma
model ProjectStakeholder {
  id        String          @id @default(cuid())
  project   Project         @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectId String
  contact   Contact         @relation(fields: [contactId], references: [id])
  contactId String
  role      StakeholderRole @default(other)
  roleLabel String?
  isPrimary Boolean         @default(false)
  notes     String?
  addedBy   String
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  @@unique([projectId, contactId])
  @@index([projectId])
  @@index([contactId])
}
```

Back-relations to add: `Client { stakeholders ClientStakeholder[] }`, `Project { stakeholders ProjectStakeholder[] }`, `Contact { clientStakeholders ClientStakeholder[]; projectStakeholders ProjectStakeholder[] }`.

SQL-ish sketch (additive only — **no changes to existing columns, no backfill required**):
```sql
CREATE TYPE "StakeholderRole" AS ENUM ('champion','decision_maker','economic_buyer','technical','influencer','blocker','team_member','other');
CREATE TABLE "ClientStakeholder" (id text PRIMARY KEY, "clientId" text NOT NULL REFERENCES "Client"(id) ON DELETE CASCADE, "contactId" text NOT NULL REFERENCES "Contact"(id), role "StakeholderRole" NOT NULL DEFAULT 'other', "roleLabel" text, "isPrimary" boolean NOT NULL DEFAULT false, notes text, "addedBy" text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL);
CREATE UNIQUE INDEX ON "ClientStakeholder"("clientId","contactId");
-- + indexes; + the parallel ProjectStakeholder table
```
Then mirror the two models in `lib/types.ts` (the file says keep it in sync; `schema.prisma:2`).

**Why not the full Company entity:** it forces `companyId` FKs onto Contact/Deal/Client, a data backfill that de-duplicates 595 free-text `company` strings into canonical rows, and rewrites every read (`detectTargets` company-name matching at `composer-actions.ts:144-184`, the company-profile fields currently *on Client* at `schema.prisma:490-500`, the enrich actions in `clients/[id]/actions.ts`, all seed fixtures, the `lib/types.ts` mirror, plus pipeline/contacts/clients list pages). That's a multi-day refactor with prod-data risk and is out of scope for "capture cc'd stakeholders." **Dependency for workstream #1 (deal/company enrichment):** #1 should keep enriching the **free-text company profile fields on Client** (the `description/headquarters/website/...` block at `schema.prisma:490-500`) and treat a company as "the set of stakeholders linked to a Client," not a new Company row. If #1 ever needs a first-class Company, that's a separate, larger migration both workstreams would share — flag it, don't build it here.

## New dependencies (npm packages + why + serverless/Vercel compatibility note; or "None")
None. Everything uses existing primitives (Prisma singleton, `generate`/skill, `writeAudit`, `notifyPartner`, the `googleapis` Gmail client already in `lib/gmail.ts`).

## New files (path + one-line purpose)
- `lib/stakeholders.ts` — tx-aware `linkClientStakeholder` / `linkProjectStakeholder` helpers (idempotent upsert on `@@unique`, returns `{created|updated}` for audit), the canonical apply path both the inline action and `approveUnified` call.
- `app/(app)/clients/[id]/stakeholder-actions.ts` — server actions for the manual client-detail surface: `addStakeholder` / `updateStakeholderRole` / `removeStakeholder` (each: mutate + `writeAudit` in one tx, revalidate).
- `components/client-stakeholders.tsx` — client component: the "Stakeholders" card on client detail (list + role badges + add/edit/remove), takes typed props.
- `components/project-stakeholders.tsx` — same for project detail (smaller; reuses the row component).
- `skills/ingest/` addition is **not** a new file (the ingest skill already exists) — see Modified files for the SKILL.md prompt change.

## Modified files (each: path — what changes in one line)
- `prisma/schema.prisma` — add `StakeholderRole` enum + `ClientStakeholder` + `ProjectStakeholder` models + three back-relations (the migration above).
- `lib/types.ts` — mirror the two new models + enum (keep-in-sync convention).
- `lib/ingest/types.ts` — add `ProposedContact` + `StakeholderLink` types; add `proposedContacts: ProposedContact[]` and `stakeholderLinks: StakeholderLink[]` to `UnifiedProposal`; add the approved-side counterparts to `ApproveUnifiedSelections`.
- `lib/ingest/parse.ts` — parse `proposedContacts` (name/email/title/company/role, email-validated) and `stakeholderLinks` (targetKind client|project + targetId + contactRef + role) off the model output, with enum-normalised role.
- `lib/ingest/context.ts` — in `buildIngestContext`, print the email's external participants + which are already-known contacts (the model needs the cc list and existing-stakeholder list to propose links); print current stakeholders for client/project targets.
- `app/api/cron/gmail-poll/route.ts` — stop dropping unknown cc'd people: pass the **full external participant list with display names** into the extract context so the email proposal can surface them as `proposedContacts` (today only the body + one matched contact reach the model). Capture the `From`/`Cc` display names (extend `lib/gmail.ts` `getEmail` to also return `{ email, name }` pairs).
- `lib/gmail.ts` — `ParsedEmail` gains `participants: { email: string; name: string | null }[]` (parse the display-name part of From/To/Cc headers) so proposed contacts have a real name, not just an address.
- `app/(app)/ingest/composer-actions.ts` — in `extractUnified`: parse + carry `proposedContacts`/`stakeholderLinks` into the stored proposal; in `approveUnified`: after the existing records loop, **create each approved proposed contact via the existing `createContact` path** (resolving inline-new refs), then call the `lib/stakeholders.ts` helpers to write the link rows, fold counts into the audit `changes`, and `revalidatePath` the affected client/project.
- `components/ingest/unified-proposal-card.tsx` — render two new opt-in sections: "New people to add" (proposed contacts, each a checkbox + role select) and "Link as stakeholder" (each link a checkbox + role select + target); thread both into `buildSelections`.
- `app/(app)/projects/[id]/page.tsx` — query `project.stakeholders` (include contact) and render `<ProjectStakeholders>` in/under the existing "Team" card.
- `components/client-detail-tabs.tsx` — render `<ClientStakeholders>` (new card in the right column near "Primary contact"); accept `stakeholders` prop.
- `app/(app)/clients/[id]/page.tsx` — load `client.stakeholders` (include contact + partnerLead label) and pass to `ClientDetailTabs`.
- `skills/ingest/SKILL.md` — teach the agent the email-stakeholder rule: when the source is an email with cc'd/to people not in the system, propose them under `proposedContacts` and propose `stakeholderLinks` to the focus client/project with a best-guess `role`; never invent emails — only use addresses present in the source.
- `lib/data/updates.ts` — one dated, plain-English entry ("You can now add cc'd people from an email as contacts and link several stakeholders to a client or project"). *(per the pre-push checklist)*
- How-it-works page (`components/how-it-works-view.tsx`) — add the stakeholder-capture flow to the walkthrough. *(per the pre-push checklist)*

## Step-by-step build approach (numbered, concrete, in build order)
1. **Schema + types (gated on Jason).** Add the enum + two models + back-relations to `schema.prisma`; mirror in `lib/types.ts`. **Get Jason's approval, then** `npx prisma migrate dev --name add-stakeholder-join` (acknowledging it co-migrates the OpsEvent telemetry). `npx prisma generate`. No data backfill.
2. **Stakeholder apply layer.** Write `lib/stakeholders.ts` with `linkClientStakeholder(tx, {clientId, contactId, role, roleLabel, isPrimary, addedBy})` and the project twin — upsert on the `@@unique`, return `{created: boolean, role}` for audit. This is the single write path (mirrors how `lib/ingest/apply.ts` centralises record writes).
3. **Manual client surface (independent of ingest — ship-able alone).** `clients/[id]/stakeholder-actions.ts` (add/update-role/remove, each mutate + `writeAudit` + revalidate). `components/client-stakeholders.tsx` (list with role badges; an "Add stakeholder" picker over existing contacts + role select; inline role edit; remove). Wire into `client-detail-tabs.tsx` + load in `clients/[id]/page.tsx`. Repeat for project via `project-stakeholders.tsx` + the project page's Team card. **This alone delivers "link multiple stakeholders to a company/project."**
4. **Gmail name capture.** Extend `lib/gmail.ts` `ParsedEmail` with `participants: {email,name}[]` (parse the `"Name <addr>"` form in From/To/Cc). Keep `from/to/cc` as-is for back-compat.
5. **Proposal type + parse.** Add `ProposedContact` (`name, email, title?, company?, suggestedRole`) and `StakeholderLink` (`targetKind: "client"|"project", targetId: string|null, contactEmail: string, role`) to `lib/ingest/types.ts`; parse them in `parse.ts` with role normalisation and the same email validation `createContact` uses. Extend `ApproveUnifiedSelections` with `proposedContacts` (approved, partner-edited role) + `stakeholderLinks` (approved).
6. **Context.** In `context.ts`, for email ingests print the external participant list (name + email + "known/unknown"); for client/project targets print current stakeholders so the model doesn't re-propose an existing link. Update `gmail-poll/route.ts` to feed the participant list into the context it builds (it currently only prints From/To + one matched contact at `route.ts:174-184`).
7. **Skill prompt.** Update `skills/ingest/SKILL.md` with the propose-contacts-and-links rule + the no-invented-email guard + the firm-domain exclusion (don't propose firm addresses as client stakeholders — reuse the `FIRM_DOMAINS` notion from `route.ts:29`).
8. **extractUnified.** Carry `proposedContacts`/`stakeholderLinks` from the parsed output into the stored `UnifiedProposal` (validate `stakeholderLinks[].targetId` against the loaded targets, demote unknown targets to the focus client/project or drop — same pattern as `reassignTaskId` validation at `composer-actions.ts:360-370`).
9. **approveUnified.** Inside the existing `$transaction`, after the records loop: for each approved `proposedContact`, call `createContact`-equivalent logic to get a `contactId` (dedupe via the existing `checkContactDuplicate` path so a cc'd person already on file links instead of duplicating); then for each approved `stakeholderLink`, call the `lib/stakeholders.ts` helper. Add `contactsCreated`/`stakeholdersLinked` to the audit `changes` and to `writeActivity`. Revalidate affected client/project paths. **Note:** `createContact` currently opens its own `$transaction` — extract a tx-aware inner (`createContactTx(tx, ...)`) so it composes inside `approveUnified`'s transaction without a nested-transaction error.
10. **Review card UI.** In `unified-proposal-card.tsx`, add the "New people to add" + "Link as stakeholder" sections (checkbox + role `Select` per row, default checked), and thread the approved arrays through `buildSelections`. Update the header counts.
11. **Pre-push docs.** Add the `updates.ts` entry + How-it-works step. `npx tsc --noEmit` + `npm run build` clean.

## Blast radius (what could break, which call sites, shared types/signatures touched)
- **`UnifiedProposal` shape change** is the widest blast point. It's read by: `lib/ingest/types.ts` (`isUnifiedProposal` narrowing), `app/(app)/ingest/page.tsx:57-72` (maps to `ProposalProp.data`), `ingest-view.tsx:101-122` (passes to the card), `unified-proposal-card.tsx` (renders). Adding **optional** arrays (`proposedContacts?`, `stakeholderLinks?`) keeps every already-pending v2 proposal valid (they parse as empty) — do NOT make them required.
- **`approveUnified` transaction** grows two write blocks. Risk: `createContact`'s own `$transaction` nested inside `approveUnified`'s `$transaction` → must refactor to a tx-aware helper (step 9) or Prisma throws. Touches `contacts/actions.ts`.
- **`createContact` signature** — if I extract `createContactTx`, the public `createContact` keeps its signature (callers: `composer-actions.ts:235` `addContactInline`, contacts list UI). Only an internal refactor.
- **`ClientDetailTabs` props** gain `stakeholders` — the only caller is `clients/[id]/page.tsx`; update both together.
- **Project detail page** query gains an `include` — local to that RSC.
- **Gmail `ParsedEmail`** gains a field — consumers are `gmail-poll/route.ts` (and the fireflies/email actions only read `from/to/cc/body`); additive, safe.
- **Migration co-bundling** — the generated migration will include the OpsEvent/ops_alert telemetry already in the tree. Not a code break, but it means this migration ships the System-status feature's schema too; coordinate timing with whoever owns that.
- No existing read of `company` changes — the lightweight choice keeps that 595-reference surface untouched.

## Risks / edge cases
- **Duplicate contacts from cc capture.** A cc'd person may already exist (or appear in two emails the same week). Must dedupe on email via the existing `checkContactDuplicate` (`composer-actions.ts:198-218`) before create, and the `@@unique([clientId,contactId])` makes the link idempotent.
- **Firm-internal addresses.** cc often includes Shift partners — they must NOT become client "stakeholders." Reuse `isInternal`/`FIRM_DOMAINS` (`route.ts:29-33`) to exclude firm addresses from `proposedContacts`/client links (a firm person could legitimately be a `team_member` link, but default to excluding unless the partner opts in).
- **No display name in header.** Some Cc entries are bare addresses; `name` will be null → fall back to the local-part or leave the partner to fill it in the review card. Never block on it.
- **Email-as-match-key.** `email` is explicitly non-overwritable in apply (`lib/ingest/apply.ts:11`). New proposed contacts set email at create only; never propose an email change on an existing contact.
- **`targetId` staleness.** A `stakeholderLink` to a client/project id that vanished between extract and approve must be validated (mirror the `reassignTaskId`/milestone validation) or the FK write throws inside the transaction and rolls back the whole approval.
- **Unassigned email (no focus client/project).** If the email matched no client/deal, there's nowhere to link a stakeholder — the proposal should still offer to *create* the contact, and surface "no client to link to" (mirror the existing "Attach a contact to apply" disabled-note pattern in `ingest-view.tsx:495`).
- **Role guessing.** The model's `suggestedRole` is a hint only; the partner picks the final role in the card (never auto-applied). Keep `other` as the safe default in parse.

## Open decisions for Jason (anything needing his call — migrations, deps, model forks; phrase each as a crisp question)
1. **Migration approval:** OK to run `prisma migrate dev` for the two stakeholder join tables against the shared/prod Supabase — knowing the same migration will also apply the in-flight `OpsEvent` / `ops_alert` telemetry changes already sitting un-migrated in the working tree? (If you want those decoupled, the telemetry change must be migrated first as its own step.)
2. **Model choice confirm:** Confirm the lightweight join (stakeholders linked to a Client, `company` stays free text) over a first-class `Company` entity. This is what workstream #1 (enrichment) will build on — #1 enriches the Client's existing company-profile fields, not a new Company row. Agreed?
3. **Scope of join tables:** Ship **both** `ClientStakeholder` and `ProjectStakeholder` now (one migration), or **Client-only** first and add Project later? (Both-now costs one extra table; one migration vs two.)
4. **Firm people as stakeholders:** Should firm/internal addresses ever be linkable as `team_member` on a client/project, or excluded entirely from stakeholder capture? (Default in this plan: excluded from auto-proposals; manually linkable.)
5. **Stakeholder role set:** Is the proposed `StakeholderRole` enum (champion / decision_maker / economic_buyer / technical / influencer / blocker / team_member / other) right for how you think about buying committees, or do you want a simpler set?

## Verify plan (how we'd test it actually works)
- **Type/build:** `npx tsc --noEmit` + `npm run build` clean (catches the `UnifiedProposal`/props changes).
- **Manual surface (no AI):** on a client detail page, add an existing contact as a stakeholder with a role, edit the role, remove it; confirm one `AuditLog` row per mutation and the card re-renders. Repeat on a project.
- **Ingest capture (local):** paste/compose an email whose body + cc lists a person not in the system, focused on a known client → extract → the review card shows "New people to add" + "Link as stakeholder"; approve → confirm a new `Contact`, a `ClientStakeholder` row, an `AuditLog` row with `contactsCreated`/`stakeholdersLinked`, and that re-approving/re-running does NOT duplicate (idempotent on the `@@unique`).
- **Gmail path:** trigger `gmail-poll` manually (`?secret=`) against a labeled test email with cc'd externals; confirm the resulting pending proposal carries `proposedContacts` (names populated from headers) and that internal/firm addresses are excluded.
- **Propose-never-auto-write invariant:** confirm the poll/extract write only a pending `IngestProposal` (no Contact/stakeholder rows) until a partner approves.
- **Regression:** an existing pending v2 proposal (no stakeholder fields) still renders and approves unchanged.

## Effort (S / M / L + one-line justification)
**L.** Touches the schema (prod migration), the full ingest extract→propose→review→approve chain (types, parse, context, two server actions, the review card), the Gmail poll, plus two new UI surfaces on client and project detail — many coordinated files, though each change is mechanical and rides existing patterns. The manual stakeholder surface alone (steps 1–3) is an **M** and is independently ship-able.

---

