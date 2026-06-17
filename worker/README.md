# Prototype-Builder Worker (Claude Agent SDK)

> **Status: Phase A proven — the build⇄critique loop runs end to end locally.** First local run
> (HVAC dispatch brief, Sonnet 4.6): self-score 77 → the agent saw a real CSS flex-height bug in
> its own screenshot, fixed it over several rounds → 86, halted at the gate. 39 turns, ~$3.26.
> Phases B–D (Drive library, DB persistence, Home UI, Railway deploy) are not built yet. See
> [What's next](#whats-next).

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
| **GATE** | in-process MCP tool `score` — weighted self-assessment + STOP/CONTINUE with a hard round cap | [`tools/gate.ts`](tools/gate.ts) |
| **LIBRARY** | past projects (Drive + disk cache) for reuse ideas | **not built (Phase B)** → `lib/drive-library.ts` |
| **HOME** | ops-tool UI: kick off, stream iterations, approve, persist Artifact | **not built (Phase C)** |

## File map

```
worker/
├── README.md      this handover
├── paths.ts       REPO_ROOT / SKILLS_DIR / RUNS_DIR (resolved from module location)
├── config.ts      model + Gate caps + SDK backstops (all env-overridable)
├── prompt.ts      system prompt = _firm/context.md + html-prototype/SKILL.md + LOOP_PROTOCOL
├── tools/
│   ├── eyes.ts    Playwright screenshot tool (alwaysLoad), shared browser, closeEyes()
│   └── gate.ts    self-score tool (alwaysLoad), keeps history[] for the loop to report
├── loop.ts        runBuild(): the query() loop + canUseTool allowlist
├── index.ts       HTTP entrypoint: GET /health, POST /build (Bearer auth) — Phase A minimal
└── dev-run.ts     local proof: runs one build against a hardcoded HVAC dispatch brief
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
| `WORKER_PORT` / `WORKER_SHARED_SECRET` | server only | HTTP port + `/build` auth |
| `DATABASE_URL` (Direct, :5432) | Phase C | long-lived worker → Supabase **direct** conn, not the pooler |
| `GOOGLE_SERVICE_ACCOUNT_KEY_B64` / `PROTOTYPE_LIBRARY_FOLDER_ID` | Phase B | Drive library (reuses `lib/drive.ts` auth) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Phase C | Storage uploads for screenshots/HTML |

## Gotchas already burned (don't re-discover)

- **MCP tools must set `alwaysLoad: true`** on the server, or the agent's first move is a `ToolSearch`
  to find them (they get deferred). With only two tools, always-load them.
- **Permissions:** headless loop uses `permissionMode: 'acceptEdits'` + a `canUseTool` allowlist
  (Write/Edit + the two MCP tools + ToolSearch) **and** `disallowedTools` hard-blocking
  Bash/WebFetch/WebSearch/Task/etc. Under `acceptEdits`, read-only built-ins (Bash `pwd`/`ls`) can
  slip past `canUseTool`, so the explicit `disallowedTools` block is what actually keeps them out.
  Do **not** use `bypassPermissions` — the auto-mode classifier blocks it and it's unsafe.
- **Tell the agent the exact write path.** With only `cwd` set, the agent guessed an absolute path
  and wrote `prototype.html` to the repo root on its first turn. The prompt now passes the exact
  absolute `runDir/prototype.html` path; Eyes reads the same path. Keep them in sync.
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

## What's next

- **Phase B — Library + real Gate + persistence.** Add `lib/drive-library.ts` (reuse `lib/drive.ts`):
  `mcp__library__list_projects` + `mcp__library__get_project` returning overview/why text + UI
  screenshots (base64) the agent can view, lazily (no whole-folder scan). Tune the Gate rubric. Write
  each round to `PrototypeRun`/`PrototypeIteration` rows + upload HTML/screens to Supabase Storage.
- **Phase C — Home + deploy.** Add the Prisma models (migration **prepared, needs Jason's approval**
  before prod — shared Supabase is prod). Add the kickoff Quick Action (POST to the worker with the
  shared secret), a Supabase-Realtime run-status UI streaming rounds, and final `Artifact` persistence
  via the existing recipe (`agentActor('prototype-builder')`). Add a Dockerfile
  (`node:22-slim` + `npx playwright install --with-deps chromium`) and deploy to Railway.
- **Phase D — later.** Mid-run human checkpoints via Postgres `SessionStore` (pause/resume); a harvest
  step that promotes strong finished prototypes back into the Drive library.
