# Shift AI Ops — Codebase Guide

> **What this folder is:** the **`shiftai-ops`** repo — the firm's custom internal operating tool. Pipeline / contacts / clients / projects / hours / invoices, with AI-powered Quick Actions and (Phase 5) autonomous agents. Live at **`https://ops.shiftai.partners`**, source of truth for firm data.
>
> **This CLAUDE.md inherits from `Shift/CLAUDE.md`** (firm-wide invariants — read both).

---

## Stack at a glance

| Layer | Tech | Notes |
|---|---|---|
| Framework | **Next.js 15** App Router | React Server Components by default; client components only where state/interaction lives |
| Auth | **Auth.js v5** (`next-auth@beta`) | Google provider, JWT sessions, `hd=shiftai.partners` chooser restriction, auto-provision Partner on first sign-in |
| DB | **Supabase Postgres** | Project `tqtpglnbotaguiirodou`, region `us-west-2` (Oregon) |
| ORM | **Prisma 7** | Schema in `prisma/schema.prisma`; client generated to `lib/generated/prisma/` (gitignored). New convention: import as `<Name>Model` (e.g. `import type { PartnerModel as Partner }`) |
| Adapter | **`@prisma/adapter-pg`** | Required by Prisma 7 for direct Postgres; singleton client in `lib/prisma.ts` |
| Hosting | **Vercel** (free tier on plan "SHIFT AI CONSULTING" — stale team name, will rename) | Auto-deploys from `main`; custom domain `ops.shiftai.partners` |
| Styling | **Tailwind v4** + custom design tokens | Brand palette in `app/globals.css` (Bitumen / Bone / Track Gold / etc.) |

---

## Critical gotchas — burned hours surfacing these, do not re-discover

### 1. DATABASE_URL split — different value on local vs Vercel (permanent)

- **Local `.env`**: Supabase **Direct connection** (`postgresql://postgres:PWD@db.tqtpglnbotaguiirodou.supabase.co:5432/postgres`). Works because local has IPv4 to direct + Prisma migrations need direct.
- **Vercel `DATABASE_URL`**: Supabase **Transaction pooler** — same host, **port `6543`** (`postgresql://postgres.tqtpglnbotaguiirodou:PWD@aws-1-us-west-2.pooler.supabase.com:6543/postgres`). The pooler (not direct) is required because Vercel functions have no IPv6 outbound (AWS Lambda limit) and Supabase free-tier direct is IPv6-only. **Transaction mode (6543), NOT session mode (5432):** session mode gives each client a dedicated connection so total clients are capped at the pool size (15) — under serverless concurrency that exhausts instantly with `EMAXCONNSESSION: max clients reached in session mode`. Transaction mode returns connections per-statement and multiplexes ~200 clients over the 15 server connections. (Burned a prod outage on this 2026-05-28.)
- **Pool is also capped in code:** [lib/prisma.ts](lib/prisma.ts) sets the pg pool `max: 5` + `idleTimeoutMillis: 10_000` so no single warm Lambda can hoard the pooler. Defense-in-depth on top of the mode choice — don't remove.
- **Don't unify.** If migrations are ever run from Vercel CI (not currently), set `DIRECT_URL` env var alongside.

### 2. Auth.js cookie config MUST live in `auth.config.ts` (not `auth.ts`)

- `auth.config.ts` is the Edge-runtime-safe slice used by middleware.
- `auth.ts` is the full instance (with Prisma) used by route handlers + server components.
- **If `cookies: {...}` is only in `auth.ts`, middleware falls back to Auth.js defaults** (`__Secure-authjs.session-token`), can't read our custom-named cookies, treats every request as unauthenticated → redirect loop between `/login` and `/dashboard`.
- Cookies block lives in `auth.config.ts`; `auth.ts` spreads `...authConfig` and inherits them.

### 3. `force-dynamic` on `app/(app)/layout.tsx`

Every route in the `(app)` group fetches live data via Prisma. Without `export const dynamic = "force-dynamic"`, Next.js tries to statically pre-render them at build time → either hangs (no DB at build) or bakes a stale snapshot. Layout already has it; preserve.

### 4. `postinstall: "prisma generate"` in `package.json`

`lib/generated/prisma/` is gitignored, so Vercel builds wouldn't find the Prisma Client without the postinstall hook. Don't remove.

### 5. Enum string convention

Prisma `@map`'d enums (e.g. `EngagementStatus.on_track @map("on-track")`) return the **underscored TS identifier** in JS (`status === "on_track"`), but the DB stores the hyphenated form. UI display values that show the status to users wrap `.replace("_", "-")` for human readability. Match this convention; mixing breaks renders.

### 6. Email domain allowlist accepts both `@shiftai.partners` AND `@shiftcg.ai`

Workspace alias domain `shiftcg.ai` is still active during sunset. Google's OIDC profile sometimes returns the alias address; the signIn callback normalizes `@shiftcg.ai` → `@shiftai.partners` before Partner lookup so one user → one Partner row. Drop `@shiftcg.ai` from `ALLOWED_DOMAINS` in `auth.ts` once the alias is fully retired.

### 7. `.env` file-watcher leak risk

The IDE file-watcher hook pushes `.env` contents into Claude's context whenever it's saved in VSCode. Dev DB password is exposed by this path. **Accepted for dev** (empty/seed-only Supabase, fictional data). For any prod-sensitive secret: set via PowerShell `[System.Environment]::SetEnvironmentVariable(...)`, not by saving `.env`.

---

## Repo layout

```
shiftai-ops/
├── app/
│   ├── (app)/                       protected route group (middleware-gated)
│   │   ├── layout.tsx               force-dynamic; sidebar + main shell
│   │   ├── dashboard/
│   │   ├── contacts/                + [id]/
│   │   ├── pipeline/                + [id]/ (deals)
│   │   ├── clients/                 + [id]/
│   │   ├── projects/                + [id]/
│   │   └── invoices/                + [id]/
│   ├── api/auth/[...nextauth]/      Auth.js v5 handler
│   ├── login/                       sign-in page (server action calls signIn)
│   └── page.tsx                     redirect to /login (overridden by middleware)
├── components/                      UI primitives + page sections
│   ├── ui.tsx                       Card, Badge, Button, Label, Tabs, etc.
│   ├── dashboard-views.tsx          client component, takes typed props
│   ├── client-detail-tabs.tsx       client component, takes typed props
│   ├── contact-actions.tsx          modal-driven actions on contact pages
│   ├── deal-actions.tsx             client wrapper for convert-deal modal
│   └── convert-deal-modal.tsx       multi-step flow
├── lib/
│   ├── prisma.ts                    singleton Prisma client w/ pg adapter
│   ├── format.ts                    pure formatters (formatCAD, formatDate, daysSince)
│   ├── types.ts                     UI-facing types (kept in parallel with Prisma schema)
│   ├── cn.ts                        classnames util
│   ├── data/seed.ts                 fictional fixtures + label maps; re-exports format helpers
│   └── generated/prisma/            GITIGNORED — Prisma client output
├── prisma/
│   ├── schema.prisma                15 models + 11 enums + AuditLog
│   ├── seed.ts                      idempotent fixture loader (preserves explicit IDs)
│   └── migrations/                  applied migrations
├── auth.ts                          full Auth.js config (Prisma callbacks)
├── auth.config.ts                   Edge-safe slice (cookies + authorized)
├── middleware.ts                    Edge middleware (route gating)
├── next-auth.d.ts                   session.user.partnerId type augmentation
├── next.config.ts
├── package.json                     postinstall: prisma generate
├── prisma.config.ts                 Prisma 7 config (DATABASE_URL from process.env)
├── .env                             GITIGNORED — local dev secrets (Direct URL)
└── .gitignore                       includes .env*, lib/generated/prisma, .next
```

---

## Common recipes

### Add a new field to a model
1. Edit `prisma/schema.prisma`
2. `npx prisma migrate dev --name <describe-change>` (locally — uses Direct URL)
3. Update `lib/types.ts` to match
4. Update any UI that needs the new field
5. Update `prisma/seed.ts` if the field should be in fixture data; re-run seed to refresh local
6. Commit + push — Vercel auto-deploys; Vercel reads the same Supabase, sees the new column

### Wire a Quick Action end-to-end
**Canonical persistence recipe.** Every Quick Action (and every Phase 5 agent) follows this exact pattern — no exceptions. Full architecture in [docs/ROADMAP.md](docs/ROADMAP.md) "Tracking architecture."

1. Server action in `app/(app)/<scope>/actions.ts` (or co-located with the page)
2. Action loads the matching skill content (`shiftai-ops/skills/<name>/SKILL.md` once we sync skills here, or `~/.claude/skills/...` for now)
3. Pulls firm context from Prisma (client + interactions + brand + relevant history)
4. *Optional:* fetches specific Drive files via Drive API for additional context (scoped to the action's Client/Project FK — never "read the whole folder")
5. Calls Claude API (`@anthropic-ai/sdk`) with skill content as system prompt + context + user intake
6. Streams result back to UI
7. **Persists the deliverable:**
   - Save the file to Drive via Drive API (if it's a document/deck/proposal)
   - Write an `Artifact` row (`type`, `title`, `driveUrl`, `createdBy: "AGENT · CLAUDE"`, `generatedFromSkill: "<skill-name>"`, `reviewStatus: "draft"`, FK to Client/Project/Deal)
8. **If the artifact is an outreach draft** (email, re-engage), also write an `Interaction` row tagged `loggedBy: "AGENT · CLAUDE"`
9. **Write one `AuditLog` row via `writeAudit(actor, action, target, changes)`** — shared helper; adding a new mutation = one line

All persistence writes (7–9) in one server-action transaction; partial failures roll back. **Nothing happens silently — every channel round-trips into the DB.**

### Reach files in a client's Drive folder
Three pathways, ordered by integration depth:
1. **Click out** — UI button uses `Client.driveFolderUrl` field directly; opens Drive in the browser. Zero AI, zero Drive API.
2. **Server-side scoped fetch** — Quick Action server action calls Drive API with the specific file ID(s) it needs (e.g. "pull the last SOW for style reference"). Scoped to the action's Client FK — not folder-wide scans.
3. **Local filesystem** — for heavy multi-file work (building proposals, decks, deliverables), the partner launches Claude Code at the client's local workspace folder (synced from Drive via Drive for Desktop). Per-client isolation = Claude launched in `Acme-Corp/` can't see `Beta-Corp/`. This is the firm decision in [../shiftai-firm/planning/file-system-platform-decision.md](../shiftai-firm/planning/file-system-platform-decision.md).

### Add a new route
- Server component by default (`page.tsx` is async, queries Prisma directly)
- Client component only if local state (`useState` for modals, toggles)
- Pass typed props from server component to client component; never import seed.ts in new code

### Trigger a redeploy without code changes
- Vercel: Deployments tab → top entry → `...` → Redeploy
- Or push an empty commit: `git commit --allow-empty -m "Redeploy" && git push`

---

## Workflow

| Action | How |
|---|---|
| Run dev server | `npm run dev` (port 3030) |
| Type-check | `npx tsc --noEmit` |
| Run migration locally | `npx prisma migrate dev --name <name>` |
| Re-seed local DB | `npx tsx prisma/seed.ts` |
| Generate Prisma Client | `npx prisma generate` (runs auto on `npm install` via postinstall) |
| Deploy | Push to `main` — Vercel auto-builds |

### Before every push to `main` — run this checklist

A push auto-deploys to prod. Before pushing, confirm both, and act if the answer is yes:

1. **What's new** — did this change add or alter anything a partner would notice (a new thing they can do, a visible change, a fix)? If so, add an entry to [lib/data/updates.ts](lib/data/updates.ts) (top, dated, plain English, no jargon).
2. **How it works** — did this change how a process works or add a new one (a new flow, a changed step, a new "what happens when I do X")? If so, update the How-it-works page so the walkthrough stays accurate.

If neither applies (pure refactor/infra), say so in the push summary and move on. Also: `npx tsc --noEmit` + `npm run build` must be clean before pushing.

---

## Skills & agents

Skills land in **Phase 3** (with Quick Actions); agents land in **Phase 4–5**. See [docs/ROADMAP.md](docs/ROADMAP.md) for phase detail.

- **Skills live in `shiftai-ops/skills/<name>/SKILL.md`** (repo-versioned; canonical firm copy the ops tool reads server-side at Quick Action runtime)
- Personal Claude Code copies at `~/.claude/skills/` for Jason's iteration in chat; promote to repo when stable
- **MCP server** (Phase 4) lives alongside the web app, exposes read/write tools to Claude Code sessions and scheduled agents per [docs/mcp-contract.md](docs/mcp-contract.md)
- **Agent persistence rule** — agents follow the same recipe as Quick Actions (write `Artifact` + optional `Interaction` + `AuditLog` row). No agent is exempt; the round-trip is the design.
- **Skill learning loop:** `/harvest-engagement` (Phase 5) fires on `engagement.closed`, walks the closed client workspace, proposes sanitized IP lifts into `00-Firm/_Templates/` for partner review. Formal "skills get smarter from real engagements" mechanism.

---

## Don't

- Don't add a new `Prisma Client` instance — use the singleton from `@/lib/prisma`
- Don't write to `lib/generated/prisma/` (regenerated on every `prisma generate`)
- Don't import from `lib/data/seed.ts` in production code paths — it's fixtures, not real data. Use Prisma queries.
- Don't add `"use client"` to a page just to add state — extract the stateful bit into a small client child component and keep the page a server component (see `deal-actions.tsx` for the pattern)
- Don't push secrets into env-var values inside commit messages or chat
- Don't disable middleware to "just test something" — the gating IS the security model; bypass = data leaks
