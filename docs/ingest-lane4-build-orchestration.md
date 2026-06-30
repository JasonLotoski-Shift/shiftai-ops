# Lane 4 + Call Review + Intro Pipeline: Concurrent Build Orchestration

> **Goal:** build phases 6-8 of [ingest-3-lane-plan.md](ingest-3-lane-plan.md) (detailed in [ingest-lane4-intro-and-call-review.md](ingest-lane4-intro-and-call-review.md)) across parallel chats without merge conflicts or prod-DB collisions, then merge through one review pass.
> **Read first:** the two plan docs above. This doc is the coordination contract: who owns which files, what each chat must not touch, and the order of operations.

---

## Why not three chats by phase

Two constraints make a naive "one chat per phase, each pushes to main" unsafe:

1. **One shared prod DB.** All three phases add schema. Concurrent `db-execute` + `migrate-resolve` runs against the same Supabase race each other and risk drift (see [prod DB drift recipe]). Migrations must be serialized.
2. **Phases 6 and 7 share the ingest core.** Both edit `skills/ingest-meeting/SKILL.md`, `components/ingest/unified-proposal-card.tsx`, and the approve path (`composer-actions.ts` / `lib/ingest/apply.ts`). Two chats in those files collide on every save.

The fix: pull the schema + shared types into **one serialized spine (Step 0)**, then fan out **by file ownership** (not by phase) into worktrees that only add code. Phase 7 is split: its capture half rides the ingest core (Workstream A), its surface half is standalone (Workstream B).

---

## The shape

```
Step 0  Schema + types spine        SERIALIZED, first, deploys to main
            |
   +--------+--------+----------------+
   |                 |                |
Workstream A     Workstream B     Workstream C      PARALLEL worktrees off main
ingest core      call-reviews     intro pipeline
(P6 + P7 cap.)   surface (P7)     (P8)
   |                 |                |
   +--------+--------+----------------+
            |
       Review pass                   SERIALIZED, last, one push to main
       merge A->B->C, nav, updates.ts,
       how-it-works, tsc+build, ultrareview
```

---

## Step 0 — Schema + types spine (serialized, must finish + deploy first)

One chat. Lands every schema and shared-type change for 6/7/8 in **one additive, nullable migration**, applied once via `db-execute` + `migrate-resolve` (never `migrate dev`). Pure-additive means it is behavior-preserving and safe to deploy ahead of the features (the 3-lane spine did exactly this).

**Owns:**
- `prisma/schema.prisma`: `Contact.isChannelPartner` (bool, default false) + `Contact.channelNotes` (text); `CallReview` + `CallReviewStatus`; `Intro` + `IntroStatus`; `Task.introId` (nullable FK); the back-relations these add to Contact / Deal / Client / Partner / Interaction.
- The one migration (drift-safe recipe), which also seeds the `bd-sales-playbook` KnowledgeCategory (idempotent `ON CONFLICT (slug) DO NOTHING`).
- `lib/types.ts`: mirror every new model / enum / field. This is the one type file all three models would otherwise collide on, so it lives here.

**Not in Step 0** (clarified during grounding): `lib/ingest/types.ts` (the intro proposal shapes + `callReview` candidate) is touched **only by Workstream A** (B reads the `CallReview` Prisma model, C reads `Intro`), so A owns it. The purple lane color token is applied per-card, which A owns too. Neither is shared, so neither sits in the serialized spine.

**Done when:** `tsc --noEmit` + `npm run build` clean, migration applied + resolved on prod, merged to main, deployed. The schema + `lib/types.ts` surface is now frozen; A/B/C only add feature code.

---

## The three parallel workstreams (worktrees off main, after Step 0)

Each runs in its own git worktree + its own chat. None runs a migration. None pushes to main. None edits `lib/data/updates.ts` or the how-it-works manual (the review pass writes one consolidated entry, which removes a guaranteed 3-way conflict). Each pushes its own branch.

### Workstream A — Ingest core (Phase 6 + Phase 7 capture)
The conflict-heavy core, one owner. Builds the purple lane end to end plus the call-review capture (same skill, same card, same approve path, so it cannot be split out).

**Owns:**
- `lib/ingest/types.ts` — add the intro proposal shapes + the `callReview` candidate to `UnifiedProposal` (only A touches this file; the purple lane color token also lands here or in the card).
- `skills/ingest-meeting/SKILL.md` — Lane-4 output mode (channel-partner contact, BD tasks, the §9 targeting candidate) + the conservative `callReview` candidate.
- `lib/fireflies.ts` — route external-attendee + no-match meetings to `lane: "intro"`.
- `app/(app)/ingest/composer-actions.ts` — the "Intro / channel partner" focus; `approveUnified` writes the channel-partner flag, the contact-scoped BD tasks, and the `CallReview` row.
- `lib/ingest/apply.ts` — persist the channel-partner marker, BD tasks on `contactId`, the `CallReview` row.
- `components/ingest/unified-proposal-card.tsx` — channel-partner toggle, BD-task block (default-OFF), the editable `callReview` block.
- `components/ingest-view.tsx` — the `lane === "intro"` dispatch branch.

**Do not touch:** `prisma/schema.prisma`, `lib/types.ts` (frozen by Step 0); contact pages (Workstream C); `call-reviews/*` (Workstream B); the sidebar nav (the review pass owns it); `updates.ts`; how-it-works.

**Note (Phase 4 shipped):** the firm-brain **targeting candidate** reuses the blue-lane Gate 1 / Gate 2 machinery, which **shipped on main 2026-06-30** (`7181082`). So A builds it now: emit the `knowledgeCandidate` from `ingest-meeting`, and on approve write the draft `DecisionRecord` / `KnowledgeItem` through the same path Lane 3 uses (look at how `app/(app)/ingest/actions.ts` + `firm-meeting-proposal-card.tsx` do it on main, and reuse it). No TODO, no fast-follow.

### Workstream B — Call Reviews surface + brain promotion (Phase 7 read half)
Mostly new files. Reads the `CallReview` model from Step 0; no schema edits, no ingest edits.

**Owns:**
- `app/(app)/call-reviews/page.tsx` + `app/(app)/call-reviews/actions.ts` (new).
- `components/call-reviews-view.tsx` (new) — list, filter by partner/lane/date, aggregate patterns.
- The lesson → `KnowledgeItem` promotion action (BD/Sales Playbook category) behind the existing brain approve gate.
- Managing-partner sensitivity filter on the surface (firm-money gating check applies).

**Do not touch:** the ingest core (Workstream A); contact pages; schema/types; the sidebar nav (the review pass adds the `/call-reviews` link); `updates.ts`; how-it-works.

### Workstream C — Intro pipeline (Phase 8)
The most isolated workstream (its own model + board + the convert handoff). Safe to parallelize even though it is the deferred phase: its value lands once named intros exist, but its files barely overlap, so spinning it up now is low-risk.

**Owns:**
- `app/(app)/intros/page.tsx` + `app/(app)/intros/actions.ts` (new) — the Intros board (Kanban by `IntroStatus`) + CRUD.
- `components/intros-board.tsx` (new).
- `app/(app)/contacts/page.tsx` — the **Channel Partners** filter (a Phase-6 UI deliverable, owned here so the contacts surface has one owner).
- `app/(app)/contacts/[id]/page.tsx` — the per-contact intro list + channel-partner panel.
- Convert handoff: from `intros/actions.ts`, create `Deal` + call `linkContact(tx, {relationship: "introduced_us", dealId})` ([lib/contact-links.ts:52](../lib/contact-links.ts#L52)) + set `Intro.dealId`. Reuses the single ContactLink write path, so no edit to `pipeline/[id]/actions.ts`.

**Do not touch:** the ingest core; `call-reviews/*`; schema/types; the sidebar nav (the review pass adds the `/intros` link); `updates.ts`; how-it-works.

---

## Review pass (serialized, last, one push to main)

One chat. Integrates and ships.

1. Merge the branches in order: A, then B, then C (off the Step-0 main). With nav owned here and C reusing `linkContact`, the merges are clean (disjoint files).
2. Add both sidebar nav links (`/call-reviews`, `/intros`) to `components/sidebar.tsx` — the one shared file, owned by this pass.
3. Write **one** consolidated [lib/data/updates.ts](../lib/data/updates.ts) entry covering the purple lane + Call Reviews + Intros, and **one** how-it-works update.
4. `npx tsc --noEmit` + `npm run build` clean.
5. Firm-money gating check: Call Reviews MP-sensitivity, any intro-economics view, the channel-partner notes. Gate with `requireManagingPartner()` where it surfaces firm money.
6. Run the deep multi-agent review on the merged branch (`/code-review ultra`), address findings, then push to main once.

---

## Chats vs workflow

- **Build = concurrent chats in git worktrees.** Each workstream touches the deploy boundary and benefits from your supervision; worktrees give file isolation; chats are resumable. A background workflow whose parallel agents mutate shared ingest files and run prod migrations unsupervised is the wrong tool for the build.
- **Final review = the multi-agent pass.** `/code-review ultra` on the merged branch is exactly the fan-out-and-verify shape a workflow is good at, and it is already wired.

### Worktree setup (run once per workstream, after Step 0 is on main)
```bash
git checkout main && git pull
git worktree add ../shiftai-ops-A -b feat/ingest-lane4-core      # Workstream A
git worktree add ../shiftai-ops-B -b feat/call-reviews-surface   # Workstream B
git worktree add ../shiftai-ops-C -b feat/intro-pipeline         # Workstream C
```
Open Claude Code in each worktree folder, paste that workstream's kickoff prompt (below), build, then `git push -u origin <branch>`.

---

## Paste-ready kickoff prompts

### Step 0 (run first, alone)
```
Build Step 0 (schema + types spine) from docs/ingest-lane4-build-orchestration.md.
Read that doc + docs/ingest-lane4-intro-and-call-review.md first.
Add, in ONE additive/nullable migration applied via the drift-safe db-execute +
migrate-resolve recipe (NEVER migrate dev): Contact.isChannelPartner + channelNotes;
CallReview + CallReviewStatus; Intro + IntroStatus; Task.introId; plus the back-relations
these add to Contact/Deal/Client/Partner/Interaction. The migration also seeds the
bd-sales-playbook KnowledgeCategory (idempotent ON CONFLICT DO NOTHING). Mirror every new
model/enum/field in lib/types.ts. Do NOT touch lib/ingest/types.ts or any lane color token
(those belong to Workstream A). Behavior-preserving: build no feature UI. tsc --noEmit +
npm run build must be clean. Then apply/resolve the migration on prod and push to main so
the workstreams can branch off it.
```

### Workstream A (after Step 0 is on main)
```
Build Workstream A (ingest core: Lane 4 + Call Review capture) from
docs/ingest-lane4-build-orchestration.md. Read that doc + the two plan docs it links.
You OWN only: lib/ingest/types.ts (add the intro proposal shapes + the callReview
candidate to UnifiedProposal; the purple lane color token lands here or in the card),
skills/ingest-meeting/SKILL.md, lib/fireflies.ts,
app/(app)/ingest/composer-actions.ts, lib/ingest/apply.ts,
components/ingest/unified-proposal-card.tsx, components/ingest-view.tsx.
Do NOT edit schema or lib/types.ts (frozen by Step 0), contact pages, call-reviews/*,
the sidebar nav, lib/data/updates.ts, or how-it-works.
Build the purple intro lane end to end (channel-partner contact + contact-scoped BD
tasks default-OFF + the call logged as an Interaction), the editable callReview
candidate block + its write on approve, AND the firm-brain targeting candidate
(Phase 4 / Lane 3 Gate machinery shipped on main 2026-06-30 — reuse the knowledgeCandidate
-> draft DecisionRecord/KnowledgeItem path that app/(app)/ingest/actions.ts +
firm-meeting-proposal-card.tsx already use). Branch off the CURRENT main (refactored
ingest-view.tsx; mirror firm-meeting-proposal-card.tsx for the purple card). Run no
migration, do not push to main. tsc + build clean, then push branch feat/ingest-lane4-core.
```

### Workstream B (after Step 0 is on main)
```
Build Workstream B (Call Reviews surface + brain promotion) from
docs/ingest-lane4-build-orchestration.md. Read that doc + the two plan docs it links.
You OWN: app/(app)/call-reviews/ (page + actions, new), components/call-reviews-view.tsx
(new), the lesson -> KnowledgeItem promotion action behind the existing firm-knowledge
approve gate, and the managing-partner sensitivity filter on the surface. Read the
CallReview model from Step 0; make NO schema or lib/ingest edits. Do NOT touch the
sidebar nav (the review pass adds the /call-reviews link).
Do NOT touch the ingest core, contact pages, schema/types, updates.ts, or how-it-works.
Run no migration, do not push to main. tsc + build clean, then push branch
feat/call-reviews-surface.
```

### Workstream C (after Step 0 is on main)
```
Build Workstream C (Intro pipeline, Phase 8) from
docs/ingest-lane4-build-orchestration.md. Read that doc + the two plan docs it links.
You OWN: app/(app)/intros/ (board page + actions, new), components/intros-board.tsx
(new), the Channel Partners filter on app/(app)/contacts/page.tsx, the per-contact
intro list + channel-partner panel on app/(app)/contacts/[id]/page.tsx, and the
convert handoff (create Deal + call linkContact(tx, {relationship: "introduced_us",
dealId}) from your own actions file + set Intro.dealId; no edit to pipeline actions).
Do NOT touch the sidebar nav (the review pass adds the /intros link), the ingest core,
call-reviews/*, schema/types, updates.ts, or how-it-works.
Run no migration, do not push to main. tsc + build clean, then push branch
feat/intro-pipeline.
```

---

## Decisions set (2026-06-30, Jason)

1. **Targeting candidate folded into A (Phase 4 shipped).** Phase 4 (the blue Lane 3 Gate 1 / Gate 2 machinery) landed on main on 2026-06-30 (`7181082 feat(ingest): Lane 3 firm-knowledge capture`), so the dependency is resolved. Workstream A builds the full purple lane in one pass: channel-partner contact + BD tasks + the logged call **and** the firm-brain targeting candidate routed through the existing gates. No fast-follow.
2. **All three workstreams run concurrently now** (A + B + C), including the otherwise-deferred Intro pipeline (its files are isolated, so parallelizing is low-risk).
3. **A/B/C branch off the new main.** main moved +2 on 2026-06-30 (Phase 3 green + Phase 4 blue). Those commits refactored `components/ingest-view.tsx` (the dispatch) and added `components/ingest/financial-proposal-card.tsx` + `components/ingest/firm-meeting-proposal-card.tsx`. Workstream A mirrors `firm-meeting-proposal-card.tsx` for the purple card and adds its `lane === "intro"` branch into main's refactored dispatch. Step 0's spine touches none of those files, so it merges cleanly first.
