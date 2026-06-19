# Ops tool — Business Model v2 plan

**Status:** Two parts, two gates:
- **Part A — Positioning / AI-context** (the firm brain + scope skill copy). ✅ **Applied 2026-06-14** to `skills/_firm/context.md` and `skills/scope/SKILL.md`, alongside the firm positioning docs. Section A below is the record of what was applied.
- **Part B — Schema + data model** (ProjectType / ProjectPhase / terminology). 🔒 **Not applied.** Gated on **Jason's approval of this migration design**. It runs a Postgres migration against **live prod** (`ops.shiftai.partners`, auto-deploys from `main`): do not execute until Jason signs off here.

**Date:** 2026-06-04.
**Why:** the firm moved to a managed-service model — one-time **build** + monthly **subscription** (the core, replacing the old "retainer = continuation only") + a premium **buy-out**; engagement phase **Run → Operate**; firm keeps a reusable pattern library; client keeps a runnable version of their instance. Canonical model: `../shiftai-firm/planning/business-model-v2.md`.

> ⚠️ **AMENDMENT 2026-06-18 — model moved to v3 (conditional sale + Background IP; buy-out removed).** The commercial/IP model above is superseded by v3: the client **buys and owns the custom Deliverable** outright on full payment; Shift **owns the Background IP** and licenses it for a **monthly Background IP licence fee**; **no buy-out**. The Part-A skill copies (`skills/_firm/context.md`, `skills/scope/SKILL.md`, `skills/sow/SKILL.md`) and the contract tool (`skills/generate-contract/`, `lib/contract/`) have been updated to v3. Change set: [contract-v3-change-brief.md](contract-v3-change-brief.md). Pending Jay's ratification + BC counsel.

---

# Part A — Positioning / AI-context  (✅ applied 2026-06-14)

These files are the **runtime firm brain** + the proposal-drafting skill. They distill the firm positioning. Applied 2026-06-14 with the firm positioning docs; the edits below are the record of what was applied (rendered to comply with the 13 June writing guardrails: em dashes removed). The `_firm/context.md` header notes "Edit by PR only, humans approve."

### A1. `skills/_firm/context.md`

**"What we do" (line ~27)**
BEFORE → `**What we do:** We build the operating systems that run companies — internal ops platforms with AI for automation, custom to how the business actually works. From inside the business, alongside the operators, leaving them with systems they own and run.`
AFTER → `**What we do:** We build the operating systems that run companies — internal ops platforms with AI for automation, custom to how the business actually works. From inside the business, alongside the operators — then we keep the system running and improving as a managed service. The client keeps a runnable version of their own; a buy-out to full ownership is available.`

**The wedge (line ~29)**
BEFORE → `…The work compounds — every engagement makes the next one sharper, and the client owns reusable IP at the end.`
AFTER → `…The work compounds — the firm keeps a reusable pattern library that makes every build sharper, and the client keeps a running version of their own system, kept current by the subscription.`

**Engagement vocabulary (lines ~46–47)**
BEFORE → `- **Phases:** Discovery → Build → Run. (Plain English. No "The Shift Method," no branded methodology name.)`
AFTER → `- **Phases:** Discovery → Build → Operate. (Plain English. No "The Shift Method," no branded methodology name.) Operate is the ongoing managed service: maintain, improve, add modules.`
BEFORE → `- **Recurring deliverables:** Weekly Brief (Fridays, one page), Phase Report (end of phase), Operating Review (quarterly during Run).`
AFTER → `- **Recurring deliverables:** Weekly Brief (Fridays, one page), Phase Report (end of phase), Operating Review (quarterly during Operate).`
**Add** a line under the vocab list → `- **Commercial model:** one-time build + monthly subscription (the core) + a buy-out option. Client keeps a runnable version of their instance; firm keeps the reusable platform/library. Never call the subscription "rent" or describe the system as one the client buys once and owns outright.`

**Header re-distill stamp (line ~14)** → update `Last distilled: 2026-05-28.` to the apply date, and note "reflects Business Model v2 (`../../../shiftai-firm/planning/business-model-v2.md`)."

### A2. `skills/scope/SKILL.md`

**Section 4 (line ~19)** → `Discovery → Build → Run` → `Discovery → Build → Operate`.
**Section 6 (line ~21)**
BEFORE → `6. **What you own** — the systems and IP the client keeps. The work compounds.`
AFTER → `6. **What's yours, and how we keep it sharp** — the client keeps a runnable version of their own system; the monthly subscription maintains and improves it; buy-out to full ownership is available. The firm keeps the reusable platform/library (patterns, never the client's data).`
**Section 7 (line ~22)** → extend the "Investment & timeline" line to cover both the one-time build fee **and** the monthly subscription (`[NEEDS INPUT]` if not supplied), and note buy-out is quoted per deal in the SOW, never in the proposal.
**Rules (line ~30)** → `Just Discovery / Build / Run` → `Just Discovery / Build / Operate`.

> Approved vocabulary + the load-bearing "lock-in" answer live in `../shiftai-firm/planning/business-model-v2.md` §5, §8. Banned words unchanged (no `seamless/robust/leverage`; never "locked").

---

# Part B — Schema + data model  (🔒 needs Jason's approval before running)

## What's actually baked in (and what isn't)

Good news first: the recurring-billing machinery **already exists** — `Project.scheduleType = monthly_even` bills a contract evenly across months (the old "retainer" path). So a subscription is `projectType = subscription` + `scheduleType = monthly_even`; **no new billing model is needed.** The schema comment also notes `projectType` is what the UI shows; `phase` is retained for back-compat. So the change is a contained **enum + label + terminology** update, not a structural rebuild.

## Design decisions (recommendation — confirm before I build the migration)

**1. `ProjectType` enum** (`prisma/schema.prisma` lines ~233–238). Today: `discovery_report · pilot_project · monthly_project · full_build`.
- Keep `discovery_report` (paid discovery sprint).
- Keep `pilot_project` (Pilot build, 1–2 modules) — relabel UI "Pilot".
- Keep `full_build` (Full Project, the module set) — relabel UI "Full Project".
- **Rename `monthly_project` → `subscription`** (this WAS the retainer; it's now the core recurring engagement). Postgres `RENAME VALUE` updates existing rows in place — no backfill.
- **Add `buyout`** (the premium buy-out engagement).
- Result: `discovery_report · pilot_project · full_build · subscription · buyout`.

**2. `ProjectPhase` enum** (lines ~87–91). Today: `discovery · build · run`.
- **Rename `run` → `operate`** (`RENAME VALUE`, in-place, no backfill). `Project.phase` is required, so rename — not drop/add — is the safe path. ⚠️ This rename is also brand vocabulary (Run→Operate), so ideally execute it **after** the 3/3 positioning vote even though the rest of Part B can go on Jason's approval. (The `projectType` rename/add is internal commercial model — Jason's call, not gated on the brand vote.)

**3. `ScheduleType`** (lines ~195–199) — **no enum change.** Update the comments only: `monthly_even` is "subscription / recurring," not "retainers."

**Open question for Jason:** is **buy-out** a `ProjectType`, or is it better modeled as a one-time event/flag on an existing subscription project? Recommendation: a `ProjectType` value is simplest and matches how the tool already tracks engagement kinds. Flag if you'd rather model it as a conversion event.

## Migration approach (Postgres + Prisma 7)

- Enum **rename**: `ALTER TYPE "ProjectType" RENAME VALUE 'monthly-project' TO 'subscription';` and `ALTER TYPE "ProjectPhase" RENAME VALUE 'run' TO 'operate';` — in-place, existing rows follow automatically.
- Enum **add**: `ALTER TYPE "ProjectType" ADD VALUE 'buyout';`
- ⚠️ **Prisma/PG gotcha:** `ALTER TYPE … ADD VALUE` cannot run inside a transaction with older PG, and Prisma wraps migrations in one. The `RENAME VALUE` + `ADD VALUE` mix likely needs a **hand-edited migration** (and possibly splitting the ADD into its own migration). I'll author and test it locally (Direct URL) before it ever touches prod. Per CLAUDE.md, run `npx prisma migrate dev --name business_model_v2_engagement_types` locally first.
- DB stores hyphenated `@map` values; keep the convention (`@map("subscription")` is identity so optional; `buyout` plain).

## Blast radius (files that reference the changed enums — read + edit each at execution)

**`ProjectType` consumers (7):**
- `prisma/schema.prisma` (enum def + `Project.projectType`)
- `lib/types.ts` (`ProjectType` union: `"discovery-report" | "pilot-project" | "monthly-project" | "full-build"` → swap `monthly-project`→`subscription`, add `buyout`)
- `components/project-type-edit.tsx` (`TYPE_LABELS` + `TYPE_ORDER` — the client-facing labels)
- `components/convert-deal-modal.tsx` (the `["discovery_report","pilot_project","monthly_project","full_build"]` choice list)
- `app/(app)/pipeline/[id]/actions.ts` (`VALID_PROJECT_TYPES_CONVERT` allowlist)
- `app/(app)/projects/[id]/actions.ts` (validation)
- `prisma/migrations/**` (historical SQL — **do not touch**)

**`ProjectPhase` / `"run"` consumers (9):** `lib/types.ts`, `components/client-detail-tabs.tsx`, `components/dashboard-views.tsx`, `lib/data/seed.ts`, `app/(app)/pipeline/[id]/actions.ts`, `lib/ingest/apply.ts`, `app/(app)/invoices/[id]/page.tsx`, `app/(app)/projects/page.tsx`, `prisma/schema.prisma`. (Several are display strings like `.replace("_"," ")`; confirm none hard-code the literal `"run"` in a way the rename breaks.)

**Terminology-only (internal, low-risk, can ride along):**
- `lib/billing/schedule.ts` (comment "retainer-style") · `lib/billing/economics.ts` (comment "retainer/subsequent") · `components/billing/origination-editor.tsx` (`"50 / 25 / 25 (pilots & projects)"`) · `prisma/schema.prisma` ScheduleType/Project comments ("retainers", "pilots/projects").
- `lib/data/seed.ts` fixtures ("Run phase", a `monthly-project` row if present) → update for consistency once enums change.
- `lib/data/updates.ts` changelog (mentions "retainers") — and **add a new dated entry** for the model change per the CLAUDE.md "before every push" rule.

## Sequencing & guardrails

1. Confirm the design decisions above (esp. buy-out-as-type).
2. Author + run the migration **locally** (Direct URL); `npx prisma generate`; `npx tsc --noEmit` + `npm run build` clean.
3. Update `lib/types.ts` + all UI/action consumers; re-seed local; manual pass on a project page, the convert-deal modal, the projects list.
4. Add a `lib/data/updates.ts` entry; update the How-it-works page if any flow wording changed.
5. **Ideally land the `run → operate` rename after the positioning vote** so user-visible phase wording matches the ratified brand.
6. Only then push to `main` (auto-deploys to prod). The prod DB picks up the migration on deploy — confirm the migration is in `prisma/migrations/` and the Vercel build runs it.

## NOT in this pass
- No execution. No prod migration. No schema edit until Jason approves the design above.
- No new billing model (recurring already works via `monthly_even`).
- Buy-out **pricing** is per-deal/no-formula (firm decision) — the tool just needs the type, not a pricing rule.
