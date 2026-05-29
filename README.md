# Shift AI Ops

The firm's internal operating tool — system of record for pipeline, contacts, clients, projects, hours, and invoices, with AI Quick Actions and (Phase 5) scheduled agents threaded through every surface as first-class users.

**Live:** [https://ops.shiftai.partners](https://ops.shiftai.partners) · auto-deploys from `main` · **Phases 1–3 shipped** (real auth, persistence, mutations, tracking round-trip, first Quick Action).

> Status, what's next, and the backlog live in [docs/ROADMAP.md](docs/ROADMAP.md). Stack gotchas and conventions live in [CLAUDE.md](CLAUDE.md) — read it before changing auth, the DB URL, or the build config.

---

## What it does

Three pillars over one Postgres, plus the AI layer that makes it different from a Notion/Pipedrive/Harvest stack:

1. **Pipeline / CRM** — contacts with relationship-intelligence records, deals by stage, stale-deal flagging, convert-deal → client.
2. **Client management** — client records with company-profile + engagement/billing tabs, contracts, scoping, invoices with aging.
3. **Project management** — engagement tracking, team + rates, milestones, hours-vs-budget, deliverables.
4. **AI layer** — Quick Actions (Claude API) and scheduled agents reach every record; **everything they produce round-trips back into the DB** (`Artifact` + optional `Interaction` + `AuditLog`). Nothing happens silently — see [docs/ROADMAP.md](docs/ROADMAP.md) "Tracking architecture."

Every AI surface obeys the firm's **no-hallucination rule**: missing facts (price, role, timeline) are left as `[NEEDS INPUT]` markers, enforced server-side — never guessed.

---

## Run it locally

```powershell
cd c:\Users\jason\Desktop\Shift\shiftai-ops
npm install
npm run dev
```

Open <http://localhost:3030>. Sign in with a `@shiftai.partners` Google account (the root redirects to `/login`; middleware gates every `(app)` route).

**Requirements:** Node.js 20+, npm 10+.

**Local `.env`** (gitignored — never committed). Needs `DATABASE_URL` (Supabase **Direct** connection for local — *not* the pooler, see [CLAUDE.md](CLAUDE.md) gotcha #1), `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. Production values live in Vercel env vars, never in the repo.

| Task | Command |
|---|---|
| Dev server (port 3030) | `npm run dev` |
| Type-check | `npx tsc --noEmit` |
| Run a migration | `npx prisma migrate dev --name <name>` |
| Re-seed local DB | `npx tsx prisma/seed.ts` |
| Deploy | push to `main` (Vercel auto-builds) |

---

## Stack

| Layer | Tech |
|---|---|
| Framework | **Next.js 15** App Router (React Server Components by default) + React 19 + TypeScript |
| Auth | **Auth.js v5** (`next-auth@beta`), Google provider, JWT sessions, `hd=shiftai.partners` restriction, auto-provision Partner on first sign-in |
| DB / ORM | **Supabase Postgres** + **Prisma 7** (`@prisma/adapter-pg`); client singleton in [lib/prisma.ts](lib/prisma.ts) |
| AI | **`@anthropic-ai/sdk`** (Quick Actions) + **`googleapis`** (scoped Drive fetch) |
| Hosting | **Vercel** — auto-deploy from `main`; custom domain `ops.shiftai.partners` |
| Styling | **Tailwind v4** + brand tokens in [app/globals.css](app/globals.css) |

---

## Repo layout

```
shiftai-ops/
├── app/
│   ├── (app)/                    protected route group (middleware-gated)
│   │   ├── layout.tsx            force-dynamic; sidebar + main shell
│   │   ├── dashboard/            + actions.ts
│   │   ├── contacts/             + [id]/ + actions.ts (draft-email, log-interaction, enrich)
│   │   ├── pipeline/             + [id]/ + actions.ts (convert-deal)
│   │   ├── clients/              + [id]/
│   │   ├── projects/             + [id]/ + actions.ts (log-hours, task toggle)
│   │   ├── invoices/             + [id]/ + actions.ts (status)
│   │   └── how-it-works/         in-app reference
│   ├── api/auth/[...nextauth]/   Auth.js v5 handler
│   ├── login/                    sign-in (server action calls signIn)
│   └── page.tsx                  → /login (overridden by middleware)
├── components/                   ui.tsx, sidebar, header, dashboard-views,
│                                 contact-actions, deal-actions, convert-deal-modal,
│                                 client-detail-tabs, client-header-actions,
│                                 invoice-status-actions, time-log-modal, theme-toggle
├── lib/
│   ├── prisma.ts                 singleton Prisma client (pg adapter)
│   ├── format.ts                 pure formatters (formatCAD, formatDate, daysSince)
│   ├── types.ts                  UI-facing types (parallel to the schema)
│   ├── drive.ts                  server-side scoped Drive API client
│   ├── audit.ts                  writeAudit() helper
│   ├── data/seed.ts              fictional fixtures + label maps
│   └── generated/prisma/         GITIGNORED — Prisma client output
├── prisma/                       schema.prisma · seed.ts · migrations/
├── auth.ts                       full Auth.js config (Prisma callbacks)
├── auth.config.ts                Edge-safe slice (cookies + authorized)
├── middleware.ts                 Edge middleware (route gating)
└── docs/                         ROADMAP · agent-flow-design · mcp-contract
```

> The exact file inventory and the hard-won gotchas (DATABASE_URL split, cookie config placement, `force-dynamic`, the enum-string convention) are in [CLAUDE.md](CLAUDE.md). Don't re-discover them.

---

## Key flows

- **Convert → Client** (any deal detail page) — the key seam: a signed deal becomes a Client + Project + Drive folder in one step.
- **Draft email** (contact header) — the reference Quick Action: loads a skill, pulls DB context, calls Claude, streams the draft, and persists `Artifact` + `Interaction` + `AuditLog` in one transaction. The `[NEEDS INPUT]` gate is enforced server-side. Remaining Quick Actions clone this recipe (Phase 3e).
- **Deliverables tabs** (Client + Project) — list `Artifact` rows; **Open Drive folder** / **Copy workspace path** buttons link the three operating surfaces.
- **Log hours / log interaction / task toggle / invoice status** — all persist and write an audit row.

---

## Brand discipline encoded

Per [../brand/brand-guide.md](../shiftai-firm/brand/brand-guide.md):

- **Dark mode primary, light mode available** — Bitumen `#0A0A0B` page, Asphalt `#141416` cards, Graphite `#26262A` hairlines. Light mode re-themes by overriding palette CSS variables under `html[data-theme="light"]`; no component classes change. No-flash pre-paint script on load.
- **Track Gold** `#C9A961` once per surface — wordmark, key data point, agent accent.
- **Sharp corners everywhere** — no rounded cards/pills/radius (enforced in `globals.css`).
- **1px Graphite hairlines** for dividers. **No drop shadows, gradients, or glassmorphism.**
- **Big Shoulders 900 + 12° skew** for display headlines and the wordmark; **Inter** for body; **JetBrains Mono** for labels and tabular numbers; all-caps mono eyebrows at 0.15em tracking.

---

## Related docs

- [docs/ROADMAP.md](docs/ROADMAP.md) — phase status, tracking architecture, backlog, open questions
- [docs/agent-flow-design.md](docs/agent-flow-design.md) — Phase 5 agent build queue (one agent at a time)
- [docs/mcp-contract.md](docs/mcp-contract.md) — Phase 4 MCP interface spec
- [CLAUDE.md](CLAUDE.md) — stack, gotchas, repo conventions, recipes
- [../shiftai-firm/WorkspacePlan.md](../shiftai-firm/WorkspacePlan.md) — firm-level operating architecture (this tool is Surface 1)
- [../shiftai-firm/planning/launch-build-log.md](../shiftai-firm/planning/launch-build-log.md) — running engineering record
