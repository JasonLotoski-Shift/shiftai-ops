# Prototype-Builder Worker (Claude Agent SDK)

> **Status: Phase B (local proof) — Eyes + Gate + Library + DB/Storage persistence run locally.**
> The build⇄critique loop reads the Drive prototype library, scores with the tuned Gate, and writes
> a `PrototypeRun` + per-round `PrototypeIteration` rows (HTML/screenshots in Supabase Storage).
> Proven end to end on the HVAC dispatch brief (Sonnet 4.6): the agent saw real bugs in its own
> screenshots and fixed them over rounds (e.g. 77 → 86, 70 → 82), halting at the gate with real
> per-round rows written. The migration is **PREPARED, not applied** — see
> [`prisma/_prepared-migrations/007`](../prisma/_prepared-migrations/007_prototype_run_iteration.sql)
> (needs Jason's approval; shared Supabase is prod). Phase C–D (Home UI, Railway deploy) are next.
> See [What's next](#whats-next).

This is the prototype-builder rebuilt as an **autonomous Claude Agent SDK worker**: a long-running
Node process that builds a client demo prototype, **looks at its own work** through a headless
browser, critiques it, rebuilds, and repeats until it's good enough. It replaces the old one-shot
`html-prototype` skill. The worker lives in this repo (shares `lib/`, `skills/`, Prisma) and is
meant to deploy as a **separate Railway service** from the Vercel app.

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────────────────┐
│  shiftai-ops (Vercel)    │  job    │  Agent Worker (Railway, always-on)     │
│  = HOME / control plane  │ ──────▶ │  @anthropic-ai/claude-agent-sdk        │
│  • kick off a build      │  POST   │  • runs build⇄critique LOOP            │
│  • stream iterations     │ + row   │  • EYES: Playwright/Chromium           │
│  • approve / GATE         │ ◀────── │  • LIBRARY: Google Drive (+disk cache) │
│  • save final Artifact   │ rows +  │  • writes each iteration back to DB    │
└─────────────────────────┘ screens │  • persists Artifact + AuditLog        │
   Supabase Postgres = job + state bus; screenshots/HTML in Supabase Storage  │
                                     └──────────────────────────────────────┘
```

| Component | What it is | Where |
|---|---|---|
| **LOOP** | one `query()` session: build → screenshot → critique → score → repeat, bounded by `maxTurns`/`maxBudgetUsd` | [`loop.ts`](loop.ts) |
| **EYES** | in-process MCP tool `screenshot` — renders `prototype.html` in headless Chromium, returns the image so Claude *sees* it | [`tools/eyes.ts`](tools/eyes.ts) |
| **GATE** | in-process MCP tool `score` — weighted self-assessment + per-dimension floors + STOP/CONTINUE with a hard round cap | [`tools/gate.ts`](tools/gate.ts) |
| **LIBRARY** | past projects from Drive — `list_projects` + `get_project` (overview/why text + UI screenshots the agent can see), fetched lazily one project at a time | [`tools/library.ts`](tools/library.ts) + [`lib/drive-library.ts`](../lib/drive-library.ts) |
| **PERSISTENCE** | `PrototypeRun` + per-round `PrototypeIteration` rows (direct via `lib/prisma`); HTML/screenshots → Supabase Storage | [`persistence.ts`](persistence.ts) + [`storage.ts`](storage.ts) |
| **HOME** | ops-tool UI: kick off, stream iterations, approve, persist Artifact | **not built (Phase C)** |

## File map

```
worker/
├── README.md      this handover
├── paths.ts       REPO_ROOT / SKILLS_DIR / RUNS_DIR (resolved from module location)
├── config.ts      model + Gate caps + SDK backstops (all env-overridable)
├── prompt.ts      system prompt = _firm/context.md + html-prototype/SKILL.md + LOOP_PROTOCOL
├── tools/
│   ├── eyes.ts    Playwright screenshot tool (alwaysLoad); shared browser; remembers each round's files
│   ├── gate.ts    self-score tool (alwaysLoad): weighted rubric + floors; history[] carries artifact paths
│   └── library.ts Drive prototype-library tool (alwaysLoad): list_projects + get_project (lazy, image blocks)
├── persistence.ts createPrototypeRun(): writes the run + per-round rows via lib/prisma (best-effort)
├── storage.ts     Supabase Storage uploads over REST (no SDK dep); skipped when SUPABASE_* unset
├── loop.ts        runBuild(): the query() loop + canUseTool allowlist + persistence wiring
├── index.ts       HTTP entrypoint: GET /health, POST /build (Bearer auth) — Phase A minimal
└── dev-run.ts     local proof: runs one build against a hardcoded HVAC dispatch brief
../lib/drive-library.ts  listProjectFolders() + loadProjectMetadata() — reuses lib/drive.ts auth
.runs/             per-run working dirs (agent cwd + round-N.jpg/html) — gitignored
```

## Run it locally

Requires Node 22+ and an `ANTHROPIC_API_KEY` in `.env` (already present for dev).

```bash
npm install                      # installs the SDK, playwright, zod
npx playwright install chromium  # one-time: download the browser binary
npm run worker:dev-run           # runs one build loop against the sample brief
# or run the HTTP server:
npm run worker                   # listens on :8787 ; POST /build with Bearer WORKER_SHARED_SECRET
```

Output lands in `worker/.runs/run-<ts>/`: `prototype.html` (final) plus `round-N.jpg` + `round-N.html`
for every iteration, so you can watch it improve.

## Env vars

| Var | Used now? | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | **yes** | the SDK's model auth |
| `PROTOTYPE_MODEL` | optional | default `claude-sonnet-4-6` (dev). Prod should use an Opus-class model |
| `PROTOTYPE_MAX_ITERATIONS` | optional | Gate round cap (default 5) |
| `PROTOTYPE_GATE_THRESHOLD` | optional | self-score needed to stop (default 85) |
| `PROTOTYPE_MAX_TURNS` / `PROTOTYPE_MAX_BUDGET_USD` | optional | hard SDK backstops (80 / $8) |
| `PROTOTYPE_MAX_RUN_MS` | optional | wall-clock backstop (default 20 min) — aborts the run if it exceeds this, so a stalled stream can't hang forever. See the thinking gotcha |
| `PROTOTYPE_MAX_THINKING_TOKENS` | optional | extended-thinking budget. **Default: on** (SDK default). Set a number to cap, or `0` to disable, if you hit the thinking-stall gotcha below |
| `WORKER_DEBUG` | optional | when set, surfaces the SDK subprocess's stderr + debug stream (`debug: true`) to diagnose a stalled run |
| `WORKER_PORT` / `WORKER_SHARED_SECRET` | server only | HTTP port + `/build` auth |
| `DATABASE_URL` (Direct, :5432) | **yes** | long-lived worker → Supabase **direct** conn, not the pooler. If unset/unmigrated, persistence no-ops and the loop still runs |
| `GOOGLE_SERVICE_ACCOUNT_KEY_B64` / `PROTOTYPE_LIBRARY_FOLDER_ID` | **yes** | Drive library (reuses `lib/drive.ts` auth). If unset, the library tools report "not configured" and the agent proceeds from the brief |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Storage uploads for screenshots/HTML. If unset, uploads are skipped and the rows store null URLs |
| `PROTOTYPE_STORAGE_BUCKET` | optional | Storage bucket name (default `prototypes`); created public on first upload |

## Gotchas already burned (don't re-discover)

- **Extended thinking is ON, bounded by a wall-clock abort.** Thinking helps design quality, so the
  worker leaves the SDK default on. But in some environments the *thinking* stream trickles (~7 tok/s
  seen on one machine), so the first turn can sit for many minutes producing thinking tokens with no
  output — a silent hang the token/turn caps never catch (no new turns ⇒ `maxTurns`/`maxBudgetUsd`
  never trip; both the parent and the SDK subprocess just idle in the event-loop poll). Two backstops:
  `maxRunMs` (default 20 min, `PROTOTYPE_MAX_RUN_MS`) aborts the query via an `AbortController` and
  marks the run errored; and `PROTOTYPE_MAX_THINKING_TOKENS` caps thinking (set `0` to disable) if you
  hit the stall repeatedly. Diagnose with `WORKER_DEBUG=1` (surfaces the subprocess stderr) and/or
  `sample <pid>` the `claude-agent-sdk-darwin-*/claude` subprocess — slowly climbing `thinking_tokens`
  events is the tell.
- **Chromium binary must be installed for Eyes** (`npx playwright install chromium`, one-time). Without it
  `screenshot` errors with "Playwright not installed" and the agent scores **blind** (judging its own code,
  not a render) — the loop still finishes but the self-critique is worthless. The Dockerfile (Phase C) runs
  `npx playwright install --with-deps chromium`.
- **MCP tools must set `alwaysLoad: true`** on the server, or the agent's first move is a `ToolSearch`
  to find them (they get deferred). With only two tools, always-load them.
- **Permissions:** headless loop uses `permissionMode: 'acceptEdits'` + a `canUseTool` allowlist
  (Write/Edit + the two MCP tools + ToolSearch) **and** `disallowedTools` hard-blocking
  Bash/WebFetch/WebSearch/Task/etc. Under `acceptEdits`, read-only built-ins (Bash `pwd`/`ls`) can
  slip past `canUseTool`, so the explicit `disallowedTools` block is what actually keeps them out.
  Do **not** use `bypassPermissions` — the auto-mode classifier blocks it and it's unsafe.
- **Tell the agent the exact write path.** With only `cwd` set, the agent guessed an absolute path
  and wrote `prototype.html` to the repo root on its first turn — where Eyes (which reads
  `runDir/prototype.html`) never sees it, and where a stale file then trips Claude Code's "must Read
  before Write" guard, sending the agent into a workaround spiral. The prompt now passes the exact
  absolute `runDir/prototype.html` path and "create it directly, don't touch other files"; Eyes reads
  the same path. Keep them in sync.
- **Gate cap is soft; maxTurns/maxBudgetUsd are the hard stops.** The agent may take many
  screenshot/edit cycles between `gate.score` calls, so the round cap counts scores, not edits. The
  real backstops are `maxTurns` (80) and `maxBudgetUsd` ($8).
- **Vision image size:** Eyes uses `deviceScaleFactor: 1` + JPEG q85 to stay under the vision size cap.
  Tool-result image block shape is `{ type:'image', data, mimeType }` (no `source` wrapper — that's
  only for streaming *input*).
- **Browser lifecycle:** one shared Chromium per process; `closeEyes()` runs in the loop's `finally`.
- **Don't import Next-only code** (`revalidatePath`, `server-only`) into the worker — it's a plain Node
  process. Reuse `lib/prisma.ts` / `lib/drive.ts` / the Anthropic helpers; write DB rows directly.
- **Prod DB connection** must be the Supabase **direct** URL (:5432), not the transaction pooler.
- **`lib/drive.ts` builds its client at module load** and throws if `GOOGLE_SERVICE_ACCOUNT_KEY_B64`
  is unset. So the library tool imports `lib/drive-library` **lazily** (dynamic `import()` inside the
  handler), never at the top — a top-level import would crash the whole worker on a box without the
  Drive key (e.g. the local dev-run). Keep new Drive-touching code behind the same lazy boundary.
- **Persistence is best-effort, never load-bearing.** Every DB write / Storage upload is wrapped so a
  missing table (migration unapplied), a down DB, or unset `SUPABASE_*` logs a warning and the build
  loop still completes. The build is the critical path; the rows are observability.
- **The migration is PREPARED, not applied.** `PrototypeRun`/`PrototypeIteration` exist in
  `schema.prisma` (client regenerated) but the tables aren't on prod yet — `prisma/_prepared-migrations/007`.
  Don't run `prisma migrate` against the shared Supabase without Jason's OK.

## What's next

- **Phase B — Library + real Gate + persistence. ✅ done (this branch).** `lib/drive-library.ts` reuses
  `lib/drive.ts`; `mcp__library__list_projects` + `mcp__library__get_project` return overview/why text +
  UI screenshots (image blocks) the agent can view, lazily (no whole-folder scan). The Gate rubric is
  tuned (interactivity/fidelity-weighted + per-dimension floors, hard round cap kept). Each round writes
  a `PrototypeRun`/`PrototypeIteration` row + uploads HTML/screens to Supabase Storage. Migration
  prepared (007), **not applied**.
- **Phase C — Home + deploy.** Add the Prisma models (migration **prepared, needs Jason's approval**
  before prod — shared Supabase is prod). Add the kickoff Quick Action (POST to the worker with the
  shared secret), a Supabase-Realtime run-status UI streaming rounds, and final `Artifact` persistence
  via the existing recipe (`agentActor('prototype-builder')`). Add a Dockerfile
  (`node:22-slim` + `npx playwright install --with-deps chromium`) and deploy to Railway.
- **Phase D — later.** Mid-run human checkpoints via Postgres `SessionStore` (pause/resume); a harvest
  step that promotes strong finished prototypes back into the Drive library.
