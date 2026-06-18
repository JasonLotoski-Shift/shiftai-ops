# Prototype-Builder Worker — Phase C: Home wiring + deploy

**Status:** design approved (2026-06-17), pending spec review.
**Scope:** make the Agent SDK prototype-builder worker *fully working end to end* — a partner kicks
off a build from the ops tool, watches the loop iterate live, approves the result, and a Drive
`Artifact` is persisted. Then deploy the worker to Railway.

This is **Phase C** of the plan in `worker/README.md`. Phases A (loop) and B (Library + Gate +
DB/Storage persistence) are done and verified (PR #1, branch `feat/prototype-worker-phase-b`).
Phase D (mid-run pause/resume via SessionStore; harvest finished prototypes into the library)
remains out of scope.

---

## 1. Goal & integration decision

The app already has a two-stage **"Build prototype"** deal action
(`app/(app)/pipeline/[id]/proposal-engine.ts` + `components/proposal-engine-modal.tsx`, wired in
`components/deal-actions.tsx`):

- **Stage 1 — reviewable brief:** `generatePrototypeBrief` reads the deal's whole Drive folder
  (transcripts, discovery report, survey) + a web search for brand, produces an editable
  `prototype-brief.md`; the partner reviews/edits it; `savePrototypeBrief` saves it to Drive + an
  `Artifact`.
- **Stage 2 — one-shot build:** `generatePrototypeHtml` (single Opus call) → `savePrototype` saves
  the HTML to Drive + `Artifact`.

**Decision:** keep Stage 1 **unchanged**. Replace **Stage 2** — when the partner approves the brief
and clicks **Build**, instead of the one-shot Opus call, kick the worker's build⇄critique loop and
turn the modal into a live iteration view. Retire `generatePrototypeHtml` / `savePrototype`.

---

## 2. Architecture & data flow

Home = control plane (Vercel / local Next app). Worker = compute (Railway / local Node). They
communicate through **direct authenticated HTTP** (Home → worker) and **the database** (worker →
Home, via polling). No Supabase Realtime — the codebase has none; this mirrors the existing
`LeadRun`/`ScanRun` polling pattern.

```
Partner approves brief ──▶ "Build"
  startPrototypeBuild(dealId, brief)            [Vercel server action]
    1. ensure deal Drive /Prototype subfolder → folderId
    2. insert PrototypeRun (status=pending, dealId, model, brief snapshot)
    3. POST WORKER_URL/build  (Authorization: Bearer WORKER_SHARED_SECRET)
         { runId, dealId, clientId?, brief, client, industry, drivePrototypeFolderId }
    4. return { runId }  ──▶ modal switches to the live iteration view

Worker /build  (validates secret, 202 ACK, runs loop in background)
    - attaches to the EXISTING PrototypeRun row (status pending→running)
    - per round: write a PrototypeIteration row; upload round HTML + screenshot → Supabase Storage
    - on finish:
        • upload final prototype.html → Supabase Storage  (finalHtmlUrl, for the iframe)
        • upload final prototype.html → deal Drive /Prototype  (webViewLink)
        • Artifact + AuditLog + Activity in one $transaction (agentActor 'prototype-builder')
        • PrototypeRun.status→done, finalScore, artifactId set
    - on abort/error: PrototypeRun.status→error, error message

Home modal polls getPrototypeRunStatus(runId) every ~4s
    - renders the split iteration view (round list + big preview)
    - on done: embeds the final HTML in a sandboxed iframe + shows Approve / Run again

Approve ──▶ approvePrototype(runId): Artifact.reviewStatus→approved (+ AuditLog).
Run again ──▶ startPrototypeBuild again (fresh run; brief reused).
```

---

## 3. Data model

`PrototypeRun` + `PrototypeIteration` already exist in `prisma/schema.prisma` and
`prisma/_prepared-migrations/007_prototype_run_iteration.sql` (prepared, not applied). **Amend `007`
before applying** with three small additions to `PrototypeRun`:

- `brief String?` — the approved brief snapshot the run was built from (so a run is self-contained).
- `artifactId String?` — FK-less link to the final `Artifact`, set by the worker on finish; lets
  `approvePrototype` find the artifact to mark approved.
- A `pending` value on `PrototypeRunStatus` (currently `running | done | error`) — Home inserts the
  row as `pending` before the worker picks it up.

**Apply `007` (amended) to the shared Supabase** — ratified; additive and safe (two new tables + one
enum + the above columns; no data touched). This is the live-prod migration that needed Jason's
approval; approval granted 2026-06-17.

---

## 4. Worker changes

The worker is ~90% there (Phase B). Remaining:

1. **Attach to an existing run.** `createPrototypeRun` (in `worker/persistence.ts`) gains an optional
   `existingRunId`: when present it loads + flips that row `pending→running` instead of creating a new
   one; when absent (the `dev-run` path) it creates its own, as today. `BuildBrief` gains
   `drivePrototypeFolderId?`.
2. **Final-deliverable persistence.** On loop finish, in addition to the Storage upload, the worker:
   uploads the final HTML to `drivePrototypeFolderId` via `lib/drive.uploadFile(html, name, folderId,
   "text/html")`; then writes `Artifact` (`type:"other"`, `title`, `driveUrl:webViewLink`, `fileName`,
   `createdBy: agentActor('prototype-builder').label`, `generatedFromSkill:"prototype-builder"`,
   `reviewStatus:"draft"`, `dealId`) + `AuditLog` + `Activity` in one `prisma.$transaction` (reusing
   `lib/audit` `writeAudit`/`writeActivity`/`agentActor` — verified worker-safe, no `server-only`); and
   sets `PrototypeRun.artifactId`. Best-effort wrapped like the rest of persistence.
3. **`/build` endpoint** (`worker/index.ts`): accept `{runId, dealId, clientId?, brief, client,
   industry, drivePrototypeFolderId}`, validate the Bearer secret (already present), 202-ACK, run
   `runBuild` with `existingRunId=runId` in the background.
4. **Model → Opus** by default (`config.model`, ratified) — match the current Stage-2 quality. Cost
   logged per run (already via the SDK `result` message).

Unchanged from Phase B: the loop, Eyes, Gate, Library, the wall-clock abort, thinking-on default.

---

## 5. Home changes

- **Apply migration `007`** (amended) — section 3.
- **Server actions** (co-located with the pipeline deal page):
  - `startPrototypeBuild(dealId, brief)` → `{runId}` — ensure Drive subfolder, insert `PrototypeRun`
    (pending), POST to `WORKER_URL/build`, return runId. If the POST fails, mark the run `error`.
  - `getPrototypeRunStatus(runId)` → `{status, rounds, finalScore, finalHtmlUrl, iterations:[{round,
    score, critique, screenshotUrl, ...}], artifactId}` — read-only poll target (~4s), mirrors
    `getSegmentRunStatus`.
  - `approvePrototype(runId)` → marks the linked `Artifact.reviewStatus='approved'` + `AuditLog`.
- **Rework `proposal-engine-modal` Stage 2:** the **Build** button now calls `startPrototypeBuild` and
  switches the modal to the **split iteration view** (section 6) which polls `getPrototypeRunStatus`.
  Remove the `generatePrototypeHtml`/`savePrototype` calls and their server functions.
- **Env (Home):** `WORKER_URL`, `WORKER_SHARED_SECRET`. Local dev → `http://localhost:8787`.
- **Deal-page status:** the `build-prototype` ActionBox keeps its green "last ran" via the existing
  `ranAtBySkill` (now keyed on `generatedFromSkill:"prototype-builder"`).
- **Don't break "Build deck":** the `build-deck` action is gated on a prototype `Artifact` existing
  (`hasPrototype`, currently keyed on `generatedFromSkill:"html-prototype"`). Update that gate — and
  any deck logic that reads the prototype artifact — to recognize `"prototype-builder"` (accept both
  during transition so old deals with one-shot prototypes still work).

---

## 6. The iteration view (settled: split + embedded HTML)

A client component inside the existing modal. Left: a compact, clickable list of rounds (R3 ⟶ R1,
each with a score badge); selecting a round shows its full screenshot large on the right with the
round's critique beneath. A header shows `Round n/N · running|done|error`. Footer: **Run again** +
**Approve final** (disabled until `status==='done'`).

On `status==='done'`, the right pane swaps the screenshot for the **interactive prototype** in a
**sandboxed iframe**: `<iframe sandbox="allow-scripts" src={finalHtmlUrl}>` — `allow-scripts` lets the
prototype's inline JS run so the partner can click through it; **no** `allow-same-origin`, so it's
isolated from the app's origin/cookies. `finalHtmlUrl` is the Supabase Storage public URL.

Polling: a `setInterval(~4s)` calling `getPrototypeRunStatus(runId)`; stop on `done`/`error`.

---

## 7. Deploy

- **Dockerfile:** `FROM node:22-slim`; `npm ci`; `npx playwright install --with-deps chromium`;
  `CMD ["npm","run","worker"]`. (Node 22 + chromium are hard requirements — see the Phase B gotchas.)
- **Railway env:** `ANTHROPIC_API_KEY`, `DATABASE_URL` (Supabase **Direct**, :5432, not the pooler),
  `GOOGLE_SERVICE_ACCOUNT_KEY_B64`, `PROTOTYPE_LIBRARY_FOLDER_ID=15Hl4UUK4A5wrbXWOQp6Qj1YXk-w8hYUS`,
  `WORKER_SHARED_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PROTOTYPE_MODEL` (Opus). Size
  ≥1 GiB RAM (Chromium is heavy).
- **Sequencing (ratified): local end-to-end first, then Railway.** Prove the full flow with the worker
  on `localhost:8787` and Home on `localhost:3030`; then deploy to Railway via a runbook Jason executes
  (create service from the repo, set the Dockerfile/start command + env, note the URL, set Home's
  `WORKER_URL`). I cannot operate the Railway console — I provide the Dockerfile, config, and runbook.

---

## 8. Operational prerequisites (gate end-to-end)

1. Apply amended migration `007` to the shared Supabase (Jason — approved).
2. Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (local `.env` + Railway) — Storage uploads are
   coded but unverified without them.
3. Set `WORKER_SHARED_SECRET` (Home + worker) and `WORKER_URL` (Home).
4. Worker runs on Node 22 with chromium installed.

---

## 9. Ratified decisions

- **Polling, not Supabase Realtime** — matches the codebase (zero Realtime today).
- **Worker model → Opus** by default (client-facing quality).
- **Skip the per-run disk cache** for the Library (YAGNI — the live Drive fetch is fast + lazy).
- **Eyes keeps `deviceScaleFactor: 1`** (not the plan's `2`) — deliberate, to stay under the vision
  size cap; verified producing usable screenshots.
- **v1 approval = approve the final** (or run again). Mid-run pause/resume is Phase D.

---

## 10. Risks & guardrails

- **Runaway cost** → `maxTurns` + `maxIterations` + `maxBudgetUsd` + the wall-clock `maxRunMs` abort
  (Phase B). Cost logged per run.
- **Worker → prod DB** → Supabase **Direct** (:5432), not the pooler (opposite of the serverless case).
- **No Next-only imports in the worker** → it writes Prisma rows directly; `lib/audit`/`lib/drive` are
  verified worker-safe. Home reflects changes via polling (no `revalidatePath` from the worker).
- **Screenshots/HTML never in Postgres** → Supabase Storage + Drive; only URLs in rows.
- **Embedded prototype HTML** → sandboxed iframe (`allow-scripts`, no `allow-same-origin`).
- **Migration discipline** → `007` amended + applied with Jason's approval; shared Supabase is prod.
- **Secrets** → Railway/`.env` only; never committed.

---

## 11. Verification (end-to-end)

1. **Local loop through Home:** approve a brief on a real deal → Build → worker (localhost) loops →
   iteration rows stream into the split view (~4s poll) → final HTML embeds and is clickable → Approve
   → `Artifact` (Drive URL) marked approved + visible on the deal page; `AuditLog`/`Activity` written.
2. **Caps:** low gate threshold → early stop; `maxIterations` → halt; `maxRunMs` → clean abort row.
3. **Auth:** worker rejects `/build` without the shared secret.
4. **Library:** the agent calls `list_projects` and `get_project` against the live 12-project library
   during a build.
5. **Railway:** deployed worker reachable only with the secret; full flow from the deployed ops tool.

---

## 12. Out of scope (Phase D / later)

Mid-run human checkpoints (pause/resume via a Postgres `SessionStore`); harvesting strong finished
prototypes back into the Drive library; the demo deck (original Phase 3) and technical scope
(original Phase 4).
