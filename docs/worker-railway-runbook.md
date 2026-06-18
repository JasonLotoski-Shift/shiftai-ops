# Prototype worker — Railway deploy runbook (for Jason)

The autonomous prototype-builder runs as a separate always-on service on Railway (it can't run on
Vercel — it's a long-running Node process with a headless browser). The ops app (Vercel) kicks off
builds by POSTing to this worker. This sets it up.

**Repo owner (Jason) does the GitHub grant + ideally creates the service**, because the Railway
GitHub App needs access to your personal repo `JasonLotoski-Shift/shiftai-ops` — only you can grant
that. Once created, add Jack via the Railway project's **Settings → Members** so he can manage it.

---

## 1. Grant Railway access to the repo + create the service

1. Railway → **New Project → Deploy from GitHub repo**.
2. If `shiftai-ops` isn't listed, click **Configure GitHub App** → on GitHub, give the Railway app
   access to `shiftai-ops` (or "All repositories") and approve.
3. Pick `JasonLotoski-Shift/shiftai-ops`, **branch `feat/prototype-worker-phase-c2-partner-refine`**
   (this is where the worker lives until it's merged to `main`; switch the service to `main` after the
   merge so it tracks prod).

> Build config is automatic: the repo has a `railway.json` that tells Railway to build
> `worker/Dockerfile` and health-check `/health`. No manual Dockerfile/start-command setting needed.

## 2. Resources

Service → Settings → set **memory ≥ 1 GiB** (Chromium is heavy). 1 vCPU is fine.

## 3. Environment variables

Service → **Variables** → add these. The first three already exist in the **Vercel** project's env —
copy them over. Do **not** set `WORKER_PORT` (Railway injects `PORT`, which the worker uses).

| Variable | Value / where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | same as Vercel |
| `DATABASE_URL` | the Supabase **direct / session-pooler** URL (`...pooler.supabase.com:5432...`) — NOT the `:6543` transaction pooler. (This is the app's `DIRECT_URL` value.) |
| `GOOGLE_SERVICE_ACCOUNT_KEY_B64` | same as Vercel |
| `SUPABASE_URL` | `https://tqtpglnbotaguiirodou.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the new Supabase **secret key** (`sb_secret_…`) — Jack has it |
| `PROTOTYPE_LIBRARY_FOLDER_ID` | `15Hl4UUK4A5wrbXWOQp6Qj1YXk-w8hYUS` |
| `PROTOTYPE_MODEL` | `claude-opus-4-8` |
| `WORKER_SHARED_SECRET` | **generate a strong random string.** Save it — the exact same value goes into Vercel in step 5. |

## 4. Deploy

Trigger the deploy. First build is ~5–10 min (it installs Chromium). When it's healthy, Service →
Settings → **Networking → Generate Domain** → copy the public **service URL**.

> ⚠️ **Set the domain's TARGET PORT to match what the worker logs.** The worker binds to
> Railway's injected `PORT` and prints `listening on 0.0.0.0:<PORT>` (currently `8080`). When you
> generate the domain, Railway may default the target port to `8787` (our *local-dev* fallback) —
> if it doesn't match the logged port, every request 502s with "Application failed to respond"
> even though the deploy is green. Edit the domain → set **Target Port = the port from the log
> (`8080`)**. (Burned ~an hour on this 2026-06-18.)

Quick check: `curl https://<service-url>/health` → `{"ok":true}`.

## 5. Wire the app to the worker (Vercel)

In the **Vercel** project (ops app) → Settings → Environment Variables, add:
- `WORKER_URL` = the Railway service URL (no trailing slash)
- `WORKER_SHARED_SECRET` = the **same** value you generated in step 3

(These take effect on the next Vercel deploy — which happens when we merge the feature to `main`.)

## 6. After the merge to `main`

Once the feature is merged to `main` and Vercel redeploys, switch the Railway service's deploy branch
from `feat/prototype-worker-phase-c2-partner-refine` → **`main`** so it auto-deploys on every push to
prod. Then a partner can run **Build prototype** on a deal end-to-end.

## Notes
- Worker env, in case of confusion: it reads `PORT` (Railway), `DATABASE_URL`, `ANTHROPIC_API_KEY`,
  `GOOGLE_SERVICE_ACCOUNT_KEY_B64`, `PROTOTYPE_LIBRARY_FOLDER_ID`, `WORKER_SHARED_SECRET`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PROTOTYPE_MODEL`.
- The worker writes directly to the same Supabase the app uses, and uploads prototype HTML +
  screenshots to Supabase Storage (bucket `prototypes`, auto-created public on first upload).
