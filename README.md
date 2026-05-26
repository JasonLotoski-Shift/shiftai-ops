# Shift AI Ops — Prototype

UI/UX prototype with fake data. Demonstrates the operating loop end-to-end: pipeline → convert → client → project → hours → invoice, with AI agents (Claude) as first-class users threaded through every surface.

This is Phase 1 of the [ops-tool buildout](../WorkspacePlan.md) — production stack (Postgres, MCP server, real auth) comes in Phases 2–3.

---

## Run it

```powershell
cd c:\Users\jason\Desktop\ABC\ops-tool\prototype
npm install
npm run dev
```

Then open <http://localhost:3030>. The root redirects to `/login` — click **Enter prototype with seed data** to skip auth.

> The dev/start scripts are pinned to port **3030** to avoid clashing with other local servers. Change it in [package.json](package.json) (`-p 3030`) if you need a different port.

**Requirements:** Node.js 20+ (Next.js 15 minimum), npm 10+. If you don't have Node installed: <https://nodejs.org/> (pick the LTS).

---

## What's clickable

| Screen | Route | Notes |
|---|---|---|
| Login | `/login` | Mock — enters with seed data |
| Dashboard | `/dashboard` | Persistent stat row + two views: **Today** (quick actions + task list) and **The firm** (team updates · engagements · activity · industry news) |
| Pipeline | `/pipeline` | Kanban by stage · gold-bordered Signed→Convert column · stale-deal flagging |
| Deal detail | `/pipeline/[id]` | Per-deal view · **Convert→Client** flow opens here |
| Contacts | `/contacts` | List + per-contact record: persona, comm style, key facts, background, hobbies, network, **communications log**, related deals |
| Contact actions | (header on `/contacts/[id]`) | **Draft email** (with no-hallucination gate), **Log interaction**, **Web search**, **AI enrich** (both propose non-destructive merges) |
| Clients | `/clients` | List + detail with two sub-tabs: **Company profile** (auto-updating) and **Engagement & billing** |
| Projects | `/projects` | All projects + per-project view with milestones, hours, AI agent panel |
| Invoices | `/invoices` | AR list + per-invoice detail with line items |
| Time log | (modal) | Header → **Log hours** button — 15-second flow |
| Light/dark | (header toggle) | Sun/Moon button — persists to localStorage, no flash on reload |

The **Convert → Client** flow on any deal detail page is the key seam — it shows how a signed deal becomes a client + project + Drive folder + Claude workspace in one step, firing the `engagement.created` event that scaffolds everything.

**No-hallucination gate** — the contact **Draft email** flow is the reference implementation of the firm's hard rule: missing facts (price, sender role, timeline) are left as `[NEEDS INPUT]` markers and the draft can't "send" until a human fills them. Web search / AI enrich follow the same posture — they *propose* additions and never overwrite existing facts.

---

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript
- **Tailwind CSS v4** (zero-config, brand tokens in [app/globals.css](app/globals.css))
- **lucide-react** icons
- **Google Fonts** via next/font: Big Shoulders Display 900, Inter, JetBrains Mono
- Zero backend — fake data fixtures in [lib/data/seed.ts](lib/data/seed.ts)

---

## Brand discipline encoded

Per [brand/brand-guide.md](../../brand/brand-guide.md):

- **Dark mode primary, light mode available** — Bitumen `#0A0A0B` page, Asphalt `#141416` cards, Graphite `#26262A` hairlines. Light mode re-themes by overriding the palette CSS variables under `html[data-theme="light"]` — no component classes change. Track Gold darkens slightly in light mode for contrast; the `ink` token (text on gold) never flips.
- **Track Gold** `#C9A961` appears once per surface — wordmark, key data point, agent accent
- **Sharp corners everywhere** — no rounded cards, pills, or radius-anything (enforced via `globals.css`)
- **1px Graphite hairlines** for all dividers
- **Big Shoulders 900 + 12° skew** for display headlines and the wordmark
- **Inter 400/500** for body, **JetBrains Mono 500** for labels and tabular numbers
- **All-caps mono labels with 0.15em tracking** for section eyebrows ("— SECTION 03")
- **No drop shadows, no gradients, no glassmorphism**

---

## Folder structure

```
prototype/
├── app/
│   ├── globals.css              brand tokens + base styles
│   ├── layout.tsx               root layout, fonts
│   ├── page.tsx                 → redirects to /login
│   ├── login/page.tsx
│   └── (app)/                   route group — authed pages share the shell
│       ├── layout.tsx           sidebar + content area
│       ├── dashboard/page.tsx
│       ├── pipeline/page.tsx
│       ├── pipeline/[id]/page.tsx
│       ├── contacts/page.tsx
│       ├── contacts/[id]/page.tsx
│       ├── clients/page.tsx
│       ├── clients/[id]/page.tsx
│       ├── projects/page.tsx
│       ├── projects/[id]/page.tsx
│       ├── invoices/page.tsx
│       └── invoices/[id]/page.tsx
├── components/
│   ├── ui.tsx                   Button, Card, Badge, Input, Label, Stat, Hairline, Tabs
│   ├── wordmark.tsx             SHIFT AI wordmark + SA sigil
│   ├── sidebar.tsx              left-nav
│   ├── header.tsx               page header with search + utility actions + theme toggle
│   ├── theme-toggle.tsx         light/dark switch (persists to localStorage)
│   ├── dashboard-views.tsx      "Today" + "The firm" tabbed dashboard body
│   ├── contact-actions.tsx      draft email (no-hallucination gate), log interaction, web search, AI enrich
│   ├── client-detail-tabs.tsx   company-profile + engagement/billing sub-tabs
│   ├── time-log-modal.tsx       15-second time entry flow
│   └── convert-deal-modal.tsx   the pipeline → engagement seam
├── lib/
│   ├── types.ts                 domain types (Partner, Contact, Deal, Client, Project, Invoice…)
│   ├── data/seed.ts             fake data fixtures
│   └── cn.ts                    classname helper
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
└── .gitignore
```

---

## What's intentionally not built

Mapped to MVP scope in [../features.md](../features.md):

- **Real auth.** Login is a mock — clicking either button just routes to /dashboard.
- **Persistence.** Time-log modal, convert-deal flow, log-interaction, enrichment merges, task checkboxes, "+ New" buttons all simulate state but nothing saves. This is the UI/UX layer; persistence comes in Phase 2.
- **Live web search / LLM.** Contact + company **Web search** and **AI enrich** are simulated — they show the *flow* (run → proposed additions → non-destructive merge) with canned results. Real search and model calls land with the MCP layer in Phase 3. The **no-hallucination posture is real in the UI** (the draft-email `[NEEDS INPUT]` gate), and is what the server-side guard will enforce.
- **MCP server.** Phase 3 — the AI integration layer is *represented* in the UI (agent cards, AI-logged hours, suggested actions, enrichment review) but the actual MCP server doesn't exist yet.
- **Search.** Header bar is decorative — Cmd+K not wired.
- **Filters, sorts.** Static lists in v1 prototype. Add when partner pull is clear.
- **Mobile responsive.** Desktop-first. Mobile lands in Phase 2 per features.md priorities.

---

## Iteration path

1. **Now:** Partners click through the prototype, react to UX, push back on shapes
2. **Iterate UX:** Adjust whatever feels wrong while it's still cheap
3. **Phase 2:** Postgres schema mirroring [lib/types.ts](lib/types.ts), real auth, real persistence
4. **Phase 3:** MCP server, scheduled agents, Claude Code workspace integration
5. **Phase 4:** Graduate out of `ABC/ops-tool/prototype/` into its own repo at `ShiftAI-OpsTool/`

---

## Related docs

- [../WorkspacePlan.md](../WorkspacePlan.md) — full ops tool buildout plan
- [../userstories.md](../userstories.md) — user stories driving these features
- [../features.md](../features.md) — feature backlog with MVP/V1/Later priorities
- [../../WorkspacePlan.md](../../WorkspacePlan.md) — parent: firm-level operating architecture
- [../../brand/brand-guide.md](../../brand/brand-guide.md) — brand canon
- [../../CLAUDE.md](../../CLAUDE.md) — firm operating invariants
