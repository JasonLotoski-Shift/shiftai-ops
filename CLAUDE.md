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
- **Vercel `DATABASE_URL`**: Supabase **Session pooler** (`postgresql://postgres.tqtpglnbotaguiirodou:PWD@aws-0-us-west-2.pooler.supabase.com:5432/postgres`). Required because Vercel functions have no IPv6 outbound (AWS Lambda limit) and Supabase free-tier direct is IPv6-only.
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
Pattern (per plan §2C):
1. Server action in `app/(app)/<scope>/actions.ts` (or co-located with the page)
2. Action loads the matching skill content (`shiftai-ops/skills/<name>/SKILL.md` once we sync skills here, or `~/.claude/skills/...` for now)
3. Pulls firm context from Prisma (client + interactions + brand + relevant history)
4. Calls Claude API (`@anthropic-ai/sdk`) with skill content as system prompt + context + user intake
5. Streams result back to UI
6. Persists artifact to DB (new model TBD — `Artifact`?) linked to the record
7. **Writes one `AuditLog` row** (actor + action + targetType + targetId + changes)

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

---

## Skills & agents (Phase 5 — not yet built)

When Quick Actions / agents start landing:
- **Skills live in `shiftai-ops/skills/<name>/SKILL.md`** (repo-versioned; canonical firm copy the ops tool reads server-side)
- Personal Claude Code copies at `~/.claude/skills/` for Jason's iteration in chat; promote to repo when stable
- MCP server (Phase 5) lives alongside the web app, exposes read/write tools to Claude Code sessions

---

## Don't

- Don't add a new `Prisma Client` instance — use the singleton from `@/lib/prisma`
- Don't write to `lib/generated/prisma/` (regenerated on every `prisma generate`)
- Don't import from `lib/data/seed.ts` in production code paths — it's fixtures, not real data. Use Prisma queries.
- Don't add `"use client"` to a page just to add state — extract the stateful bit into a small client child component and keep the page a server component (see `deal-actions.tsx` for the pattern)
- Don't push secrets into env-var values inside commit messages or chat
- Don't disable middleware to "just test something" — the gating IS the security model; bypass = data leaks
