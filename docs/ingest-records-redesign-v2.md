# Ingest & Records — Redesign v2 (build plan)

> **Status (2026-06-22).** Plan agreed with Jason. Four problems audited against live code; the four product calls are decided (below). **Nothing built yet.** Phases 0–1 are no-migration and can start once green-lit; Phase 2 is one prod-Supabase migration that needs Jason's explicit approval before it runs.
>
> **Supersedes** the planning intent of [ingest-records-upgrades-plan.md](ingest-records-upgrades-plan.md) (now marked shipped). That doc's records model, ContactLink, attachment reading, cross-reference, and the v2 composer skill are all **done** — verify against the applied schema before assuming any field needs adding.
>
> **Hard invariants (CLAUDE.md):** local `prisma migrate` hits the **same Supabase as prod** → every migration needs Jason's approval. The shared DB has **drift** (e.g. `PrototypeRun.kind`) so plain `prisma migrate dev` wants to RESET (wipes prod) — use the `db execute` + `migrate resolve` recipe instead (see memory `prod-db-drift-migrate-recipe`). Propose-never-auto-write. Every mutation writes one `AuditLog` via `writeAudit`. Both v1 `ExtractedProposal` and v2 `UnifiedProposal` shapes are live; keep v1 readable for already-pending rows.

---

## The four decisions (agreed 2026-06-22)

| # | Decision | Chosen | Why |
|---|---|---|---|
| 1 | **Email-thread queue** | **One card per thread, append** | Group by Gmail `threadId`; first message creates one proposal, later replies append + re-extract. Queue shows one growing card per conversation. Matches "recent email + history." |
| 2 | **Email/meeting archive** | **DB is source of truth + derived Drive `comms-log.md`** | Full body in a DB column on a client/deal-scoped comms record, rendered in-app (expand to read original); a one-way generated `comms-log.md` per client written to Drive for browsing/Claude Code. No second authoritative copy. |
| 3 | **Document history** | **One record, versions added on explicit "replace"** | Re-upload/regenerate appends a version under the existing Artifact (via `supersedesId`) only when the partner clicks replace — no auto-merge of look-alike names. The "reference with a history log" Jason asked for. |
| 4 | **Task creation** | **Conservative skill + default-OFF, partner promotes** | Skill proposes fewer tasks; review card defaults tasks to `keep:false`; partner ticks the ones worth keeping and can promote a key point to a task. Plus the structural fixes below (real due dates, unassigned owner, fuzzy dedup). |

**Two more, settled by the firm's propose-never-auto-write rule (no question needed):**
- A new reply on an **already-approved** thread surfaces as a one-click "new reply — append?" confirm, defaulted yes. Not a silent write.
- Strong matches (shared domain, exact email) **suggest** the client/deal and pre-fill the card. They never auto-file.

---

## What already shipped (do not rebuild)

- **Records/relationship model** — `ContactLink` (M2M Contact↔Deal/Client, relationship + role + isPrimary), plus the full firmographic / Shift-signal / sales-intel field sets on Deal/Client/Contact/Project. Migration `20260610061421_records_relationship_model`.
- **Attachment reading (#3)** — `lib/ingest/extract-file.ts`; the Gmail poll already reads PDF/Word/Excel/MD/HTML + images into the body.
- **Cross-reference button (#4)** — `lib/ingest/cross-reference.ts` + the v2 review card; re-resolves a match and flags task/milestone overlap on demand.
- **v2 unified composer skill** — `skills/ingest/SKILL.md` with `proposedContacts`, `contactLinks`, wide per-kind field allowlists, and the `currentSystems`/`painPoints` Shift-signal extraction.
- **Screenshots / dropped files** — `lib/ingest-uploads.ts` already saves the **original bytes** to the client/deal Drive folder + one Artifact, re-readable for vision. "Go back and see what they shared" is solved for uploads. The gaps are emails (no readable archive) and documents (no version history).

---

## The four problems → root causes (audited, with file:line)

### 1. Email chains create "many many ingests"
- Gmail poll dedupes on the per-**message** id: [`gmail-poll/route.ts:165`](../app/api/cron/gmail-poll/route.ts#L165) checks `externalId: id`, [`:241`](../app/api/cron/gmail-poll/route.ts#L241) writes it; `id` is the Gmail message id. A 6-message labeled thread = 6 proposals.
- `email.threadId` is **parsed but never read** ([`gmail.ts:205`](../lib/gmail.ts#L205)).
- The **paste** path collapses a whole chain into **one** proposal ([`composer-actions.ts`](../app/(app)/ingest/composer-actions.ts) `extractUnified`) — opposite behavior to the poll.
- Post-approval there's no "this thread lives here" record: [`Interaction`](../prisma/schema.prisma#L479) has no thread key, no body, no client/deal FK.
- The email skill reinforces per-message framing ([`skills/ingest-email/SKILL.md:3,39`](../skills/ingest-email/SKILL.md)).

### 2. Task creation is "MEH"
- **Fake due dates.** `Task.due` is non-null ([`schema.prisma:1044`](../prisma/schema.prisma#L1044)) but the skill returns `due:null` for most tasks. Apply stamps the source date: [`composer-actions.ts:803`](../app/(app)/ingest/composer-actions.ts#L803) `… ? d : proposal.meetingDate` → tasks **born overdue**.
- **Owner force-assigned / dropped.** [`composer-actions.ts:801`](../app/(app)/ingest/composer-actions.ts#L801) `if (!t.title?.trim() || !t.ownerId) continue;` drops an unowned task; the card never produces a null owner because [`unified-proposal-card.tsx:226`](../components/ingest/unified-proposal-card.tsx#L226) falls back to `currentPartnerId`. So unmatched owners are silently assigned to the reviewer.
- **Default-checked.** Every proposed task seeds `keep:true` ([`unified-proposal-card.tsx:245`](../components/ingest/unified-proposal-card.tsx#L245)).
- **Exact-only dedup at approve.** `findDuplicateOpenTask` ([`dedup.ts:44`](../lib/ingest/dedup.ts#L44)) is normalized-title-exact; "Send proposal" vs "Send the proposal" both create. The fuzzy matcher `findSimilarOpenTasks` exists but only fires on the manual cross-reference click.

### 3. Matching to project/pipeline "not doing well"
- **Project matching doesn't exist.** [`cross-reference.ts:96`](../lib/ingest/cross-reference.ts#L96) declares a `project` bucket and never fills it. `matchedProjectId` is only ever set by a manual focus pick.
- **Domain never used.** `Client.domain` / `Deal.domain` / `Contact.domain` are populated by enrichment but no matcher reads them — the single biggest missed signal.
- **Exact-one-contact gate.** [`gmail-poll/route.ts:107`](../app/api/cron/gmail-poll/route.ts#L107) `if (contacts.length !== 1) return …unassigned` drops every multi-party thread.
- **Primary-only.** Matching uses `primaryForClients` only; `ContactLink` committee members are never consulted.
- Three parallel matchers (`resolveTargetsFromText`, `matchEntity`, `matchByEmails`) drift apart.

### 4. The email body is orphaned
- On approve, [`Interaction`](../prisma/schema.prisma#L479) stores only the AI **summary**, scoped to a contact (no body, no client/deal FK). The body goes to a Drive `.md` no page renders + `IngestProposal.transcript` (never read again).
- Client page ([`clients/[id]/page.tsx`](../app/(app)/clients/[id]/page.tsx)) and deal page ([`pipeline/[id]/page.tsx`](../app/(app)/pipeline/[id]/page.tsx)) **don't load interactions at all** — comms show only on the contact page. No client/deal-level "everything they sent us."
- **Documents have no version concept** — every re-upload is a new look-alike Artifact ([`schema.prisma:1150`](../prisma/schema.prisma#L1150), no `supersedesId`).

---

## Build plan (phased)

> **Built 2026-06-22/23 (working tree — verified `tsc` + `build` clean, NOT pushed):**
> - **Phase 1** (no migration): the upgraded matcher (domain + ContactLink + sole-active-project), the live Gmail poll using it, and the task-quality fixes (unassigned-owner, default-off + key-point promotion, near-dupe `normalizeTitle`, priority validation, conservative skill rubric).
> - **Phase 2** (ALL of it — code complete, **migration staged but NOT run**): `Task.due` nullable end-to-end (fake-overdue gone); `Interaction` extended into a comms record (body/subject/threadId/externalId + client/deal scope, contactId nullable) with the body written on approve incl. a contact-less branch for auto-mail; a shared **Timeline** on the client (new tab) + deal pages; **Artifact versioning** (supersedesId + `replaceArtifact` + a Replace control + heads-only Documents with a version-history disclosure); **Gmail thread-collapse** (group by threadId, append + re-extract, messageIds[] idempotency) + a thread-aware `ingest-email` skill. Migration SQL staged at `prisma/migrations/20260623120000_phase2_ingest_records_comms/migration.sql` — apply via the drift-safe recipe **with Jason's approval**, then push.
>
> **⚠ Deploy ordering:** this working tree cannot be pushed to prod until the staged migration runs (the code reads columns that don't exist yet). Run the migration first, then deploy. The migration is additive/independent of the in-flight `20260622193000` batch migration.

### Phase 0 — Polls speak v2 · folded into Phase 2
The matching half of this already shipped (the live Gmail poll calls `resolveTargetsFromText`). The remaining half — making the polls emit the v2 `UnifiedProposal` (so auto-mail captures `proposedContacts` / `contactLinks` / `currentSystems` / `painPoints` and renders on the v2 review card) — is a rewrite of two live crons. **Decision: do it together with Phase 2's thread-collapse**, because thread-collapse rewrites the same poll loop and needs the `threadId` migration anyway — rewriting the cron once (with full context) beats twice. Until then the polls keep emitting v1 `ExtractedProposal` (still matched by the upgraded matcher), reviewed on the v1 card.

### Phase 1 — No-migration quick wins
**Tasks**
- Owner: when the hint doesn't resolve, set `ownerId = null` (unassigned), not the reviewer. Relax the [`:801`](../app/(app)/ingest/composer-actions.ts#L801) skip so an unassigned task still creates.
- Default-OFF: seed task `keep:false` in the card; add a "promote this key point to a task" one-click.
- Dedup: run `findSimilarOpenTasks` in the approve path behind a partner-confirm ("new task, or the existing one?"); improve `normalizeTitle` to drop leading verbs/stopwords so near-dupes collapse.
- Validate `priority` against the enum server-side; add a short keyPoint-vs-task + priority rubric to the skill.

**Matching** (consolidate everything onto `resolveTargetsFromText`)
- **Domain pass:** derive each external email's bare domain (reuse `normalizeDomain`), look up `Client/Deal/Contact.domain`; gate with a personal-domain blocklist (gmail/outlook/icloud/…).
- **Consult `ContactLink`:** surface every linked client/deal, not just `primaryForClients[0]`.
- Drop the exact-one-contact gate → rank-and-confirm: score candidates, default the card to the top suggestion (never auto-file).
- **Project disambiguation:** once a client resolves, pre-select its sole active project; if several, one-click pick (default most-recently-updated active).

### Phase 2 — One migration (Jason's approval) · drift-safe recipe
Bundle all schema changes into a single reviewed migration so there's one prod-touch:
1. **`Task.due` → nullable.** Stop the fake-date stamp; board shows "no date". Update every board sort/overdue/filter query to handle null.
2. **Thread identity on `IngestProposal`:** add `threadId` (+ index) and a supersede/parent linkage so a thread is one evolving record.
3. **Comms body + scope:** a queryable, client/deal-scoped comms record with full `body` + `threadId` (extend `Interaction` with `body` + `clientId`/`dealId`, or add an `EmailRecord` — decide at build; extend is lighter).
4. **Artifact versioning:** add `Artifact.supersedesId` so "replace / new version" appends instead of spawning a sibling row.

> Migration runs via `prisma migrate diff` → hand-checked SQL → `db execute` → `migrate resolve`, **not** `migrate dev` (drift would reset prod). All adds are nullable/new → no backfill.

---

## Mechanism detail

### Thread collapse (problem 1)
At poll time, after fetching new message ids, **group by `email.threadId`**. For each thread, look up an `IngestProposal` by `threadId`:
- **None** → create one pending proposal; transcript = assembled thread; `threadId` set.
- **Pending exists** → append the new message(s) to its transcript, re-extract, bump `updatedAt`. Queue shows **one growing card**.
- **Already approved** → the thread already lives on a client (detect via `threadId` on the comms record); the new reply surfaces as a one-click "append?" confirm, then lands as one "recent email" entry rather than re-creating the set.

This makes the poll behave like the paste path and implements "one thread = one record, new emails append" literally.

### Records source of truth (problem 4)
- **Emails & meeting notes → DB is canonical.** Full body in the comms record (summary stays for the glance view). Render **one merged timeline** on the client **and** deal pages — comms rows + documents — which neither page shows today. Stop writing the per-email `.md` Artifact.
- **Documents / deliverables / screenshots → Drive holds the bytes (already true), the Artifact row is the DB index.** `supersedesId` collapses N look-alike rows into one record with a history disclosure.
- **`comms-log.md` is a derived, one-way convenience view** — a generated per-client file marked "do not edit," for human/Claude-Code browsing. Never a competing source of truth.

### Skills
- Rewrite `skills/ingest-email` (or retire it for `skills/ingest`) to extract **whole-thread**, not single-message — one summary across the conversation, newest-first.
- Tighten `skills/ingest` task emission: a task names an action someone owes; otherwise it's a key point. Add the priority rubric.

---

## Deferred sub-questions (decide at build, not blocking)
- **Retention:** keep full email/meeting bodies in Postgres indefinitely, or age out bodies to Drive-only past N months keeping summary + link? (Default: keep — firm scale is small.)
- **Timeline scope:** show comms from all linked contacts on a company (full picture) or primary only (less noise on big committees)? (Default: all linked, with a filter.)
- **`comms-log.md` scope:** per client only, or also per active deal before conversion? (Default: both.)

---

## Invariants preserved across all phases
- **Propose-never-auto-write** — nothing becomes a record without partner approval (the reply-confirm and match-suggest decisions above keep this intact).
- **Every mutation writes one `AuditLog` via `writeAudit`**; deliverables → `Artifact`, outreach → `Interaction`.
- **Prisma singleton**; `force-dynamic` on the `(app)` layout untouched.
- `npx tsc --noEmit` + `npm run build` clean before any push; `lib/data/updates.ts` + the How-it-works page updated for partner-visible changes (all four qualify).
