# Prepared migrations — REVIEW, then apply manually

These `.sql` files are **PREPARED, NOT APPLIED.** Nothing here has run against any
database. This folder is a deliberate sibling of `prisma/migrations/` (with a
leading underscore) so Prisma never auto-scans or applies it.

The matching edits are **already in `prisma/schema.prisma` and `lib/types.ts`**.
These SQL files are the human-reviewable record of what those schema edits imply
at the DB level, plus a manual-apply fallback.

> ⚠️ **Local `prisma migrate` hits the SAME live Supabase as prod.** The local
> `.env` `DATABASE_URL` is the Supabase **Direct** connection to the one shared
> project (`tqtpglnbotaguiirodou`) that also backs production. There is no
> separate dev DB. Treat every migration as a production change. Run only after
> a human has reviewed each file. (See `shiftai-ops/CLAUDE.md` gotcha #1.)

## Run order

Apply in numeric order — later steps assume earlier ones:

| # | File | What it does | Destructive? |
|---|------|--------------|:---:|
| 001 | `001_industry_add_values.sql` | Adds 9 new `Industry` enum values | no |
| 002 | `002_contact_subindustry.sql` | Adds `Contact.subIndustry TEXT` | no |
| 003 | `003_task_tags_archive_reviewer.sql` | Adds `Task.dealId / contactId / archivedAt / reviewerId` + 3 FKs + 3 indexes | no |
| 004 | `004_milestone_drop_deal.sql` | **Drops `Milestone.dealId`** + its FK | **YES** |
| 005 | `005_task_milestone_on_delete_setnull.sql` | Task→Milestone FK = `ON DELETE SET NULL` | no (likely no-op) |
| 006 | `006_action_draft.sql` | Creates the `ActionDraft` table | no |

## 007 — prototype builder (separate, independent changeset)

`007_prototype_run_iteration.sql` is **not part of the 001–006 batch.** It adds two
new tables (`PrototypeRun`, `PrototypeIteration`) + the `PrototypeRunStatus` enum for
the Phase B prototype-builder worker (`worker/`). Purely additive, depends on nothing
in 001–006, and applies on its own. The schema edits are already in
`prisma/schema.prisma` and the client is regenerated. Apply with
`npx prisma migrate dev --name add_prototype_run_iteration` (emits exactly 007's SQL,
since 001–006 are already applied) or paste the file into the Supabase SQL editor.
**Still needs Jason's approval — the shared Supabase is prod.**

## 008 / 009 — partner refine + deck builds (extend the prototype set)

`008_partner_refine.sql` adds the partner-refine column + durable session store.
`009_build_run_kind.sql` adds `PrototypeRun.kind` ('prototype' | 'deck') so the
proposal-deck build rides the same run tables as the prototype builder (one column,
default `'prototype'`, so applying it leaves every existing/prototype row unchanged).
Both depend on 007 and apply in order after it. Schema edits are already in
`prisma/schema.prisma`; the client is regenerated. Apply all three together with
`npx prisma migrate dev` (it emits 007+008+009 as one migration) or paste them into
the Supabase SQL editor in order. **Still needs Jason's approval — the shared Supabase is prod.**

## 010 — Financials rebuild, Phase 1 (additive schema; STAGED differently)

> ✅ **APPLIED 2026-06-29.** Run via `prisma db execute` against the shared Supabase
> (additive only: zero existing reads broke), the staged `schema.prisma` +
> `lib/types.ts` edits made live, the Prisma client regenerated, and recorded in
> Prisma's ledger as migration `20260629120000_financials_rebuild_phase1`
> (`migrate resolve --applied`). The applied copy lives at
> `prisma/migrations/20260629120000_financials_rebuild_phase1/migration.sql`; this
> file is retained as the human-readable record + companion to the schema notes.

`010_financials_rebuild_phase1.sql` is the additive schema for the Financials
rebuild: 3 new enums + 6 new tables (`CommissionLine`, `CommissionPayout`,
`FxRate`, `OpeningBalance`, `BankReconciliation`, `InvoicePayment`) + 2 nullable
columns on existing tables (`Deal.budgetFee`, `Invoice.driveUrl`). Purely additive,
depends on nothing in 001–009, applies on its own.

**This one breaks the "edits already in `schema.prisma` + client regenerated"
rule above, on purpose.** Because it adds columns to the hot `Deal` / `Invoice`
tables and the apply is deferred (the rebuild applies it in a later, owner-approved
landing), the matching `schema.prisma` + `lib/types.ts` edits are STAGED in
`010_financials_rebuild_phase1.schema.md` rather than made live, and the Prisma
client is **not** regenerated yet. Regenerating ahead of the un-applied DDL would
make every bare `Deal` / `Invoice` read SELECT columns the prod DB lacks
(`42703`) and break them everywhere. Apply the SQL, paste the companion edits,
`prisma generate`, and `migrate resolve` **together** — full recipe in the
companion file. **Needs Jason's approval — the shared Supabase is prod.** Do NOT
run `migrate dev`.

## How to apply (recommended path)

The clean way is to let Prisma generate the migration from the edited schema and
confirm it matches these files:

1. Review each `.sql` above.
2. With the local `.env` Direct URL pointed at Supabase, run:

   ```
   npx prisma migrate dev --name industries_taskboard_actiondraft_milestone_cleanup
   ```

   Prisma diffs the edited `schema.prisma` against the live DB and emits its own
   migration SQL. **Read the generated SQL and confirm it matches steps
   001–006 here before accepting it.** Notable expected differences:

   - **001 (enum ADD VALUE) — keep isolated if Prisma complains.** Postgres
     can't `ALTER TYPE ... ADD VALUE` and then USE the new value in the same
     transaction. Prisma usually splits enum additions out automatically, but if
     `migrate dev` errors on the enum step, apply `001_industry_add_values.sql`
     first by hand (its own transaction), then re-run `migrate dev` for the rest.
   - **005 will probably produce NO SQL.** The live `Task_milestoneId_fkey`
     constraint was already created with `ON DELETE SET NULL` (Prisma's default
     for the optional relation). Step 005 only makes `schema.prisma` say so
     explicitly. If Prisma emits nothing here, that's correct.

3. **004 is the one destructive step** — it `DROP COLUMN "dealId"` on
   `Milestone`. It is safe: no fixture and no code path ever set that column, so
   every value is NULL (see the comment block in `004_milestone_drop_deal.sql`).
   Still, eyeball it before accepting.

## Manual-apply fallback

If you'd rather apply by hand (e.g. via the Supabase SQL editor / psql) instead
of `migrate dev`, run files 001 → 006 in order. 001 should be its own
transaction (enum `ADD VALUE`). The rest can each run in a transaction. Note
that a hand-applied path leaves Prisma's `_prisma_migrations` ledger out of sync
— prefer the `migrate dev` path above unless you have a reason not to.
