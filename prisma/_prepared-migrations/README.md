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
