# Ingest Lane 4 (Intro / Relationship) + Call Review: Build Plan

> **Status:** agreed shape, not started (2026-06-30). Two product decisions set by Jason this session: (1) intro/BD meetings get their own **4th lane**, not a Lane-3 broadening; (2) the call-retro layer is a **dedicated `CallReview` model + team surface**, not a card-only block.
> **Builds on:** [ingest-3-lane-plan.md](ingest-3-lane-plan.md) (gold `client_records` / green `financial` / blue `firm_knowledge`). This adds a 4th destination lane and one cross-cutting feature that rides every meeting lane. It inherits the 3-lane spine: the `lane` column, the string-switch card dispatch with the null→gold fallback ([ingest-view.tsx](../components/ingest-view.tsx#L174)), the firm-brain Gate 1 / Gate 2 machinery (3-lane §4c), and the drift-safe migrate recipe.
> **Trigger case:** the David Eppert / Endeavor Trust call (`Jun-30-10-01-AM`). An intro partner with ~1,000 near-public clients offers targeted introductions, declines a referral fee, and sets one condition: narrow the ICP first. Today the tool would force this into a fabricated client record. It should land as a channel-partner relationship plus BD tasks plus one firm-targeting candidate.

---

## 1. The gap these two features close

The 3-lane model routes by destination, and an intro/BD call fits none of the three:

- **Not gold (`client_records`):** there is no client and no deal. David is a source of future deals, and the card would manufacture an "Endeavor Trust" client that does not exist.
- **Not green (`financial`).**
- **Not blue (`firm_knowledge`):** Lane 3 is gated to all-internal meetings ([fireflies.ts](../lib/fireflies.ts#L206)). This call has an external attendee by design, so it falls through the gate. Lane 3 is also arm's-length (stored, kept out of the brain by default). An intro call is the opposite: there is a real external person the firm wants on file as a channel partner, with concrete BD follow-ups.

Second gap, orthogonal to lanes: a call (intro or client) carries coaching signal (what worked in the room, what did not, what to reuse). The firm has nowhere to log it, so the team cannot learn across calls. That is the `CallReview` feature in §6.

What already exists and is reused rather than rebuilt:

- `IngestTargetKind` already includes `"contact"`, and a `RecordProposal` with `kind: "contact"` and `recordId: null` is an inline-new contact ([lib/ingest/types.ts](../lib/ingest/types.ts#L16)). The intro card is a contact-centric proposal, which the unified shape already expresses.
- `RelationshipType.introduced_us` and `DealSourceCommission` already model "this person introduced us to deal/client X" plus the economics once a deal exists. `LeadSource.intro` / `referral` and `ImportLeadType.connector` show the firm already conceptualizes connectors.
- `Task` is polymorphic on `contactId` (nullable), so BD to-dos hang off the introducer contact with no new structure.
- The firm-brain candidate path (draft `DecisionRecord` / `KnowledgeItem` at Gate 1, approve at Gate 2, discriminated by `generatedFromSkill`) is the same path Lane 4's targeting insight uses.

The one thing missing: a Contact-level marker for a person who will introduce **future** deals, before any deal exists. `ContactLink.introduced_us` needs a deal/client target ([types.ts](../lib/ingest/types.ts#L84)), so it cannot carry a channel partner who has not introduced a specific deal yet. That marker is the only required Contact-side change.

---

## 2. Lane 4: Intro / Relationship (PURPLE)

| Lane | Color | Destination | Tasks? | Tie |
|---|---|---|---|---|
| `intro` | **Purple** | Channel-partner Contact + intro-path records + firm brain (by exception) | Yes (firm/BD, default-OFF, promote) | contact (the introducer); never a client or deal at capture |

The card records four things, in priority order:

1. **The channel-partner Contact.** Create or match the introducer (David). Stamp the channel-partner marker (§3). This is a `kind: "contact"` record proposal, `recordId` null for a new person or the matched id for an existing one. No client and no deal is created.
2. **The interaction.** Log the call as an `Interaction` on that contact (`type: "meeting"`, body = transcript), exactly as gold does.
3. **BD tasks.** Default-OFF, the partner promotes (inherits the v2 conservative-task decision). Scope = the introducer `contactId`, `category: firm`, `categoryLabel: "BD"`. For the David call these read: send a tightened ICP one-pager, book the follow-up, prep the target list to run against his near-public client list.
4. **A firm-targeting candidate (by exception).** One `knowledgeCandidate`, `isImportant: false` by default, flips true only against the 3-lane §9 rubric. The David call produces one: the ICP constraint ("narrow the target market before David intros"). It routes through the existing Gate 1 / Gate 2 as a draft `DecisionRecord` or `KnowledgeItem`, invisible to skills until a partner approves it.

### 2a. Routing: when a meeting becomes Lane 4

Set deterministically at intake, switchable in one click at review (same discipline as 3-lane §1). The signal is "external person, no client/deal match, BD-shaped," which the code already half-computes:

- **Fireflies / paste:** `matchContact` returns all-null for 0 or ambiguous matches ([fireflies.ts](../lib/fireflies.ts#L108)). A title-matched meeting with at least one **external** attendee (`emails.some(e => !isInternalEmail(e))`) and **no** client/deal match is the Lane 4 candidate. Internal-only stays blue (Lane 3); matched-to-client stays gold.
- **Composer:** the partner picks the focus today. Add an **"Intro / channel partner"** focus option beside contact/client/deal so a pasted intro transcript routes to purple without forcing a client.
- **Defensive default holds:** unknown/null `lane` still renders gold ([ingest-view.tsx](../components/ingest-view.tsx#L174)), so no row renders blank.

A model nudge is the fallback only for the genuinely ambiguous dropped/pasted case (an external call that could be a first sales touch OR an intro). The card's purple chip defaults to the inferred value and the partner flips it. The common paths stay rule-routed (no token spend, no new mis-classification surface), matching the 3-lane principle.

### 2b. The card

Reuse `UnifiedProposalCard`'s contact path. Add the purple chrome, the channel-partner toggle on the contact record, the BD-task block (already default-OFF), and the targeting-candidate block (the Lane-3 component, reused). Add a `lane === "intro"` branch to the dispatch in [ingest-view.tsx](../components/ingest-view.tsx#L174).

### 2c. Skill

`ingest-meeting` is the extraction skill for Fireflies + paste. Add a Lane-4 output mode: when the meeting is intro-shaped, emit the channel-partner contact, BD tasks scoped to that contact, and the §9 `knowledgeCandidate`. The skill emits no client field-changes and no deal stage signal in this mode (there is no client or deal). Keep it bounded; reuse the firm-board task-dedup candidate list (3-lane §2) scoped to the contact's open tasks.

---

## 3. The channel-partner marker (Contact-side, minimal)

One additive, nullable change. A person can be both a prospect and a connector, so this is a flag, not a type swap:

```sql
ALTER TABLE "Contact" ADD COLUMN "isChannelPartner" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Contact" ADD COLUMN "channelNotes" TEXT;
```

- `isChannelPartner` powers a filtered **Channel Partners** view on the Contacts page (people who send intros), and the Lane-4 card sets it.
- `channelNotes` holds the relationship context (David's reach: ~1,000 issuers, near-public client list, declined a fee, prefers in-office list review).
- Set `Contact.sourceCategory = intro` for color-coding (the enum value already exists).

No `ContactLink` is written at capture (there is no deal yet). The link comes later, at handoff (§4).

---

## 4. Intro-path records (Phase B): the per-intro pipeline

§2 captures the relationship and the call. Tracking each **individual** introduction (David → intro to Acme, status, follow-ups, conversion) is a thin pipeline on top. It lands as a second phase because the David call names no specific target yet; the model earns its keep once intros are in flight.

```prisma
enum IntroStatus {
  proposed      // partner asked the channel partner for an intro to a named target
  requested     // channel partner agreed, intro pending
  made          // intro email/meeting happened
  meeting_set   // a first call is booked
  converted     // produced a Deal
  declined
  dead
}

model Intro {
  id              String      @id @default(cuid())
  introducer      Contact     @relation("ContactIntrosMade", fields: [introducerId], references: [id])
  introducerId    String
  targetCompany   String                       // free text until it firms up
  targetContact   Contact?    @relation("ContactIntrosReceived", fields: [targetContactId], references: [id])
  targetContactId String?
  status          IntroStatus @default(proposed)
  notes           String?
  owner           Partner?    @relation(fields: [ownerId], references: [id])
  ownerId         String?
  // On convert, the Deal this intro produced. ContactLink(introduced_us) +
  // DealSourceCommission then take over the economics.
  deal            Deal?       @relation(fields: [dealId], references: [id])
  dealId          String?
  createdBy       String
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}
```

- **Tasks attach to an intro.** Add a nullable `Task.introId` FK so to-dos hang off the specific introduction, not just the introducer. Reuses the polymorphic-scope convention.
- **Handoff is the whole point.** When an `Intro` converts, create the `Deal`, write `ContactLink(introduced_us)` from the introducer to that deal, set `Intro.dealId`, and the existing `DealSourceCommission` flow runs (David declined a fee, so that row may be zero or absent; the link still records provenance). The intro pipeline ends exactly where the deal pipeline begins.
- **Surface:** the channel partner's Contact page lists their Intros and the conversion rate. A firm-level **Intros** board (Kanban by `IntroStatus`) mirrors the pipeline board, so BD-via-relationship is visible next to BD-via-outbound.

Enum values are plain underscored, no `@map` (brand-new, Import-Contacts precedent).

---

## 5. Lane 4 data-model summary

**Phase A (Lane 4 core):** two nullable Contact columns (§3). No other schema change. The targeting candidate reuses the existing `knowledgeCandidate` JSON → draft `DecisionRecord` / `KnowledgeItem` path. Tasks reuse `contactId` scope.

**Phase B (intro pipeline):** the `Intro` model + `IntroStatus` enum + nullable `Task.introId`.

All applied with `db-execute` + `migrate-resolve`, never `migrate dev` (it would RESET prod). Add the Prisma fields in the same change so `tsc` / `build` stay clean. Mirror into `lib/types.ts`.

---

## 6. Call Review: the cross-cutting learning layer

Decision: a dedicated model and a team surface, not a card-only note. This rides **every** meeting lane (gold client calls and purple intro calls), because every call has room to improve.

```prisma
enum CallReviewStatus {
  draft       // distilled from the transcript, awaiting partner edit/approve
  approved
}

model CallReview {
  id            String           @id @default(cuid())
  title         String           // e.g. "Intro call · David Eppert (Endeavor Trust)"
  callDate      DateTime

  // Structured retro. Arrays so each point is its own chip on the surface.
  whatWorked    String[]
  whatDidnt     String[]
  lessons       String[]         // durable, reusable across engagements
  coachingNotes String?          // freeform partner note

  // Provenance: the meeting this reviews.
  sourceInteraction   Interaction? @relation("CallReviewSource", fields: [sourceInteractionId], references: [id])
  sourceInteractionId String?
  lane          String?          // "client_records" | "intro" — for filtering the surface

  // Polymorphic scope (which call), all nullable.
  client    Client?  @relation(fields: [clientId], references: [id])
  clientId  String?
  deal      Deal?    @relation(fields: [dealId], references: [id])
  dealId    String?
  contact   Contact? @relation(fields: [contactId], references: [id])
  contactId String?

  status      CallReviewStatus     @default(draft)
  // Candid critique is firm_wide for a 3-partner firm; an economics/strategy
  // lesson is tagged managing_partner so it is filtered from non-MP reads.
  sensitivity KnowledgeSensitivity @default(firm_wide)

  // A lesson promoted into the firm brain becomes a KnowledgeItem (the BD/Sales
  // playbook category). Null until promoted.
  promotedKnowledgeItemId String?

  createdBy String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([lane, callDate])
  @@index([clientId])
  @@index([contactId])
}
```

### 6a. Capture
Every meeting-lane skill (`ingest-meeting`, and the gold client-meeting extraction) emits a `callReview` candidate alongside records and tasks: `whatWorked`, `whatDidnt`, `lessons`, `coachingNotes`. Conservative by default: populate only when the transcript carries real signal, leave arrays empty otherwise (no fabricated critique). The candidate renders as an editable block on the proposal card. The partner edits and approves, which writes one `CallReview` row tied to the call's `Interaction`.

### 6b. The team surface
A **Call Reviews** page (its own route, or a tab on the dashboard). Lists reviews, filters by partner / lane / date, and aggregates: recurring "what worked" patterns, recurring "what didn't," and the lessons shortlist. This is the team-learning read-path, and it earns its keep the moment two reviews exist (no waiting on brain-retrieval tuning).

### 6c. Promotion to the brain
A lesson marked durable promotes to a `KnowledgeItem` (`source: "transcript"`, a "BD / Sales Playbook" `KnowledgeCategory`, `generatedFromSkill: "call-review"`), behind the same firm-brain approve gate as Lane 3. Set `CallReview.promotedKnowledgeItemId` so a lesson is promoted once. Most reviews promote nothing; the durable few become reusable IP.

### 6d. Sensitivity
Default `firm_wide` (a partner firm reviewing its own calls). Any review whose lesson touches firm economics, rate strategy, or a buyer/positioning call is tagged `managing_partner` and filtered from non-MP reads at retrieval and render, matching the existing convention. The pre-push firm-money gating check (ops `CLAUDE.md`) applies to the Call Reviews surface.

---

## 7. Build order (continues the 3-lane §8 sequence)

Each phase ships independently behind the drift-safe recipe. Lane 4's targeting candidate depends on the Lane-3 Gate machinery, so it follows 3-lane Phase 4 (blue).

6. **Lane 4 core (purple).** Two Contact columns (`isChannelPartner`, `channelNotes`); the `lane === "intro"` routing at Fireflies/paste (external + no-match) and the composer "Intro / channel partner" focus; the purple card (reuse `UnifiedProposalCard` contact path) with the channel-partner toggle, BD tasks (default-OFF), and the reused targeting-candidate block; `ingest-meeting` Lane-4 output mode; Channel Partners filter on Contacts.
7. **Call Review.** `CallReview` model + `CallReviewStatus` enum; the `callReview` candidate in the meeting-lane skills; the editable card block + approve → `CallReview` row; the Call Reviews surface; lesson → `KnowledgeItem` promotion behind the existing gate.
8. **Intro pipeline (Phase B).** `Intro` model + `IntroStatus` + `Task.introId`; the Intros board and the per-contact intro list; the convert → Deal + `ContactLink(introduced_us)` + `DealSourceCommission` handoff.

Before each push: `npx tsc --noEmit` + `npm run build` clean; a [lib/data/updates.ts](../lib/data/updates.ts) entry; update the How-it-works manual; managing-partner gating check on the Call Reviews surface and any intro-economics view.

---

## 8. Open decisions / risks

1. **Lane label.** "Intro" vs "Relationship" vs "Channel" for the purple lane and its chip. "Intro" is tightest for the trigger case; "Relationship" generalizes if non-intro BD relationships (advisors, partners) later route here. Recommend **Intro** for v1, rename is a label-only change.
2. **Where the Call Reviews surface lives.** Standalone route vs a firm-knowledge tab vs a dashboard tab. Recommend a **standalone `/call-reviews`** so it reads as a team practice, not a sub-feature.
3. **CallReview on internal team meetings (blue).** Out of scope for v1 (blue is arm's-length). A retro on a team sync is plausible later; the model already allows a null scope, so it is additive when wanted.
4. **Intro pipeline timing.** Phase B (the `Intro` model) is deferred until named intros exist. The David call is fully captured by Phase A. Building the pipeline before there is intro volume would ship an empty board.
5. **No auto-write to the brain.** Both the targeting candidate (Lane 4) and the promoted lesson (Call Review) stay draft until a partner approves, preserving the no-silent-write rule the firm brain is built on.
