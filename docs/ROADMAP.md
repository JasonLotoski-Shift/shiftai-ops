# Ops Tool — Roadmap

> **Status (2026-05-28):** Phases 1–3 shipped — live at `https://ops.shiftai.partners` with Google SSO, Prisma/Supabase persistence, all mutations, the tracking round-trip, the activity feed, and the Tasks surface. **The AI generation layer is not built yet** (see the reality check below). Two tracks run next: **Track A — the AI layer** (the generative spine → firm brain → skills → Quick Actions) and **Track B — the Firm Hub** (messaging, pipeline drag-and-drop, agents tab). They converge at **Phase 4 (MCP)** and **Phase 5 (agents)**.
> **Parent:** [../../shiftai-firm/WorkspacePlan.md](../../shiftai-firm/WorkspacePlan.md) — firm-level operating architecture; the ops tool is Surface 1 (the spine).
> **Stack & conventions:** [../CLAUDE.md](../CLAUDE.md) — production stack, gotchas, repo layout. Not duplicated here.
> **Companions:** [mcp-contract.md](mcp-contract.md) (Phase 4 interface), [agent-flow-design.md](agent-flow-design.md) (Phase 5 build queue).

---

## Mission

Shift AI's internal operating tool — the system of record for pipeline, clients, contracts, and projects. Not a generic CRM or PM stack. Custom, AI-native, owned by the firm. Per the parent plan, the tool itself is the firm's first piece of compounding IP and an acquirer-valued asset alongside the engagement book.

**Three pillars + the AI layer:**
1. **Pipeline / CRM** — contacts, deals, stages, fill-the-pipeline workflows
2. **Client management** — invoicing, contracts, scoping, documents
3. **Project management** — engagement tracking, hours, tasks, deliverables
4. **The AI layer** *(the differentiator)* — every record readable and writable by Claude, both inside the app (Quick Actions) and from outside it (Claude Code + scheduled agents via MCP). AI is first-class, not a plugin.

---

## The AI architecture — the part that makes this not a CRM

This is the most important section in the document. Four pieces do four different jobs. Conflating them is the easiest way to build the wrong thing.

### The four pieces

| Piece | One-line job | Analogy | Who calls it | Knows the DB? | Generates text? |
|---|---|---|---|---|---|
| **Anthropic API** | Turn a prompt into generated text | the **brain** | *our code* (a server action) | No — only sees what we put in the prompt | **Yes** |
| **SKILL.md** | Instruction sheet for one task ("how to draft an email") | the **recipe** | loaded by our code as the system prompt | No | No (it shapes the API call) |
| **Firm brain** | The distilled "who Shift is / how Shift sounds" injected into every call | the **house style** | loaded by our code, prepended to every system prompt | No | No |
| **MCP server** | Let a Claude running *outside* the app read/write our DB | the **hands** | *a Claude* (Claude Code, an agent) | **Yes — that's its whole point** | No — it's data plumbing |

The mental model: **API generates. MCP connects. SKILL.md instructs. The firm brain sets the voice.**

- A **Quick Action** runs *inside* the app, so it reaches the DB directly with Prisma and uses the **API** to think — no MCP needed. This is why Quick Actions ship before MCP.
- **MCP** only matters when a Claude is *outside* the app (your laptop in a client folder, a 6am scheduled agent) and needs a door into the same database. It doesn't generate anything; the thinking still comes from a Claude.

### How a Quick Action composes a call

Every Quick Action (and every agent) builds the same shape:

```
system prompt = [ skills/_firm/context.md ]      ← the firm brain   (shared by ALL actions)
              + [ skills/<action>/SKILL.md ]      ← how to do THIS task
user message  = [ live Prisma query: this client + recent interactions + relevant history ]
              + [ the partner's intake / Task.context ]
        │
        ▼  @anthropic-ai/sdk  ──►  Anthropic API (cloud, runs on Vercel's side, not anyone's laptop)
        ▼
response = the drafted deliverable
        │
        ▼  persist (see "The persistence recipe"): Artifact [+ Interaction] + AuditLog, one transaction
```

Change `skills/_firm/context.md` once → every Quick Action's voice changes. Change a `SKILL.md` → only that one task changes. Voice is never copy-pasted into individual skills.

### The three-layer brain — and where each layer lives

"The company brain" is really three things with different change-rates and different homes. Keeping them separate is what stops the whole thing from going stale.

| Layer | Examples | Change-rate | Where it lives | Why there |
|---|---|---|---|---|
| **Strategy brain** (human + Claude Code) | brand guide, positioning, partner bios, economics | slow, narrative | **`shiftai-firm/`** — already exists, rich ([brand/brand-guide.md](../../shiftai-firm/brand/brand-guide.md), [context/positioning.md](../../shiftai-firm/context/positioning.md), partner bios) | For humans and Jason's Claude Code sessions. Deep, discursive. Stays put. |
| **Live firm state** | pipeline, clients, hours, last-contact dates | fast, factual | **Postgres** — queried live every call | It's *data*, not prose. Queried fresh each time, so it can never be stale. |
| **Runtime firm context** (the Quick Actions' brain) | firm one-liner, voice/tone rules, the jargon ban-list, partner roster | slow, distilled | **`skills/_firm/context.md` in the ops repo** *(to build — does not exist yet)* | Vercel must read it at runtime, and `shiftai-firm/` is on a laptop, **not deployed**. A committed file is reachable, versioned, and diffable. |

The runtime context is a **lean, distilled subset** of the strategy brain — not a copy of it. The strategy brain is the source; `skills/_firm/context.md` is the deploy-time extract.

### Governance — fresh without letting it rewrite itself

Jason's explicit concern: the brain gets old fast, but we also don't want it silently rewriting itself. Three structural answers (not discipline — structure):

1. **Split by change-rate so it rarely needs touching.** The reason brains rot is people put *changing facts* in them. Don't. Slow-changing identity → the committed file. Fast-changing facts (current clients, this quarter's numbers, who's on what) → live Prisma queries, never baked into prose. The split *is* the anti-staleness mechanism.
2. **Git is the guardrail against self-rewriting.** Because the runtime context is a committed file, an agent physically cannot mutate it silently — any change is a commit with a reviewable diff and a one-click undo. This is *why* a repo file beats a DB row or a Drive doc for this specific thing.
3. **Propose, never auto-write — the firm's existing pattern.** `/harvest-engagement` (Phase 5) *proposes* IP lifts into firm templates **for partner review**; it never auto-commits. Same rule for the brain and for every deliverable: an agent may **propose** a diff (a PR, or a row with `reviewStatus: "draft"` — that field already exists on `Artifact`), a human approves the merge. **No agent gets write access to the canonical file.** Propose → human approves → commit.

---

## Reality check — what "the first Quick Action" actually shipped

The earlier roadmap implied 3d shipped `draft-email` as a full AI feature. The code says otherwise, and the plan below depends on being honest about it:

- **`@anthropic-ai/sdk` is not installed.** There is zero Claude generation anywhere in the repo today.
- The shipped `saveEmailDraft` / `sendEmail` in [contacts/[id]/actions.ts](../app/(app)/contacts/[id]/actions.ts) take a **human-typed body**, upload it to Drive, and write `Artifact` + `Interaction` + `AuditLog`. Note `generatedFromSkill: null`.
- There is **no `skills/` folder in the ops repo** yet. The only skills that exist are Jason's *personal* Claude Code skills at `~/.claude/skills/` (all `-jason`-suffixed, e.g. `html-brief-jason`).

**So what 3d actually proved is the persistence round-trip — the hard, valuable plumbing — not the generation.** The generative half is Track A below, and the SKILL.md is its centerpiece, not an add-on.

---

## Phase status

### Phases 1–3 — ✅ shipped

| Phase | What landed |
|---|---|
| **1 — UI/UX prototype** | Pipeline board, contact/client/project/invoice detail, dashboard, time logging, convert-deal flow |
| **2 — Working v1** | Supabase Postgres + Prisma 7 (15 models, 11 enums, AuditLog); Auth.js v5 Google SSO restricted to `shiftai.partners`; auto-deploy to Vercel; all read routes on Prisma |
| **3a — Mutations** | task done-toggle, log-interaction (+ `lastTouchAt`), log-hours, invoice status, convert-deal → Client + Project + Drive folder |
| **3b — Tracking architecture** | `Artifact` model, `clientId`/`projectId` FKs on `Task`, `writeAudit()` helper, server-side `[NEEDS INPUT]` gate |
| **3c — Three-surface handshake** | "Open Drive folder" / "Copy workspace path" buttons on Client detail; Deliverables tab on Client + Project; server-side scoped Drive API client |
| **3d — Email persistence round-trip** | `draft-email` **persistence** end-to-end (Drive upload → `Artifact` + `Interaction` + `AuditLog` in one transaction). Body is human-typed today; the AI generation step is Track A. |

> Detail lives in git history and [../../shiftai-firm/planning/launch-build-log.md](../../shiftai-firm/planning/launch-build-log.md).

---

### Track A — the AI layer (Phase 3e) — ⏳ next

The generative layer. **The order matters:** the spine and the brain come before any individual Quick Action, because every action depends on them.

#### A1 — The generative spine *(one-time foundation)*
- [ ] Add `@anthropic-ai/sdk` to `package.json`.
- [ ] Set `ANTHROPIC_API_KEY` in Vercel env (prod) and local `.env` (dev) — same split discipline as `DATABASE_URL` (see [../CLAUDE.md](../CLAUDE.md) gotcha #1; never paste the prod key into chat per gotcha #7).
- [ ] Write a shared `generate()` helper (`lib/ai.ts`): loads `skills/_firm/context.md`, takes a skill name + context + intake, calls the API, streams back. One place every Quick Action and agent calls — adding an action becomes "write a SKILL.md + call `generate()`."
- [ ] Decide streaming transport (server action + RSC streaming vs. route handler) and standardize it once.

#### A2 — The firm brain *(runtime context)*
- [ ] Create `skills/_firm/context.md` — the lean runtime brain, **distilled from** [../../shiftai-firm/brand/brand-guide.md](../../shiftai-firm/brand/brand-guide.md), [context/positioning.md](../../shiftai-firm/context/positioning.md), partner roster, and the firm-wide voice invariants (incl. the jargon ban-list — never "locked," "leverage AI," etc.).
- [ ] Establish the distill-and-review loop: changes to the firm brain are PRs (human-approved), never agent-written. Document the propose→approve rule inline.

#### A3 — Skills folder + promotion path
- [ ] Create `skills/` in the ops repo (canonical firm copies the tool reads server-side at runtime).
- [ ] **Promote, don't copy.** Personal skills (`html-brief-jason`, etc.) get de-personalized into firm-generic skills: strip the `-jason`, write for *any partner clicking the button*, point voice at `skills/_firm/context.md`.

#### A4 — The Quick Actions *(one at a time, each the full round-trip)*
The lineup (reset 2026-05-28). Generative actions clone the `draft-email` recipe (firm brain + SKILL.md + live context → `generate()` → persist):
- [x] **Draft email** — ✅ shipped. `generateEmailDraft()` → editable draft → `Artifact` (+ `Interaction` on send) + `AuditLog`. *(Contact page.)*
- [x] **Draft proposal** — ✅ shipped 2026-05-29. `scope` skill; `generateProposal()`/`saveProposal()` → `Artifact` (proposal → Drive) + `AuditLog` + `Activity`. *(Deal page.)*
- [x] **Draft client survey** — ✅ shipped 2026-05-29. `client-survey` skill via shared `generateClientDoc()`/`saveClientDoc()` → `Artifact` (report) + `AuditLog` + `Activity`. *(Client page.)*
- [x] **Draft discussion doc** — ✅ shipped 2026-05-29. `discussion-doc` skill, same shared client-doc pair. *(Client page.)*
- [x] **Upload client files** — ✅ shipped 2026-05-29. *Ingest, not generation.* `uploadClientFile()` — file/paste → client Drive → `Artifact` (+ `Interaction` when logged as a meeting) + `AuditLog` + `Activity`. *(Client page.)* Optional Fireflies API pull later.
- [ ] **Add contact** — fast capture. `Contact` + `AuditLog`. (Mutation, not generative.)
- [ ] **Run an action** — generic launcher (enrich a contact, generate a brief, run a health check).

> **Dropped from the lineup (2026-05-28):**
> - **Build presentation** → moves to the Claude Code **workspace**. Heavy multi-file decks belong at the client folder, not the ops tool.
> - **Re-engage stale** → replaced by **visual pipeline aging** (Track B, B3b). The team *sees* the stall on the board and acts; no action chasing it.
> - **Log hours** → **removed from the ops tool entirely** (UI + action + `HoursEntry` model via migration). Not part of how the firm wants to operate the tool.

---

### Track B — the Firm Hub (between 3e and Phase 4) — ⏳ in progress

Make the tool *come alive* for the three partners: one firm timeline, real tasks, a live pipeline, and a window into the agents. **Decisions (Jason, 2026-05-28): real-time = short-interval polling; data wipe on hold.** Mostly *wiring*, not new foundations — the schema is most of the way there (`Activity` model exists but only the seed writes it; `Task` already has `owner`/`clientId`/`projectId` FKs; `AuditLog` captures every write; `Partner` is the Auth.js user table; the sidebar already has disabled "Agents/Settings" slots).

#### Core idea — one firm timeline, three lanes

Not "chat plus a separate log." One timeline of timestamped events, rendered in three lanes. A deal moving to "negotiation" is structurally the same as a partner posting a message — both are timestamped events. The activity feed is a read-only system author posting into the timeline. Render them in the same scroll, styled differently. That's the live pulse.

| Lane | What | Backing model | Written by |
|---|---|---|---|
| **Channels** | Firm rooms (`#general`, `#pipeline`, `#deals`) | `Message` (channel-scoped) | Partners |
| **Direct messages** | 1:1 between partners | `Message` (DM-scoped) | Partners + system (task cards) |
| **Activity feed** | Auto "what happened" — deal moved, task done, action ran | `Activity` (exists) | The app, from mutations |

#### B1 — Activity feed wiring — ✅ done 2026-05-28
- `writeActivity()` helper alongside `writeAudit()`, called in the **same transaction** for feed-worthy events only (deal stage change · task assigned/completed · Quick Action ran · client created).
- `Activity` extended with a single nullable `link` column (relative URL like `/pipeline/<id>`) so feed rows click through. Chose **one free-text `link`** over three FK columns to match the codebase's loose-coupling convention for log models (`Interaction.loggedBy`, `HoursEntry.loggedBy`, `Activity.actor` are all free-text) and to avoid back-relations + migration delete-ordering on three models.
- Migration `activity_link_field`; wired into `toggleTaskDone` (completions only), `convertDeal`, `logHours`, `logInteraction`, `saveEmailDraft`, `sendEmail`, `markInvoiceSent`, `markInvoicePaid`. Dashboard feed rows click through when `link` is set. `lib/types.ts` kept in sync.
- `AuditLog` stays the complete ledger (every write, due-diligence grade); `Activity` is the curated human feed. Same transaction → never drift.

#### B2 — Tasks surface — ✅ done 2026-05-28
- Schema: `Task.context`, `Task.assignedById` (+ named `TaskOwner`/`TaskAssignedBy` relations on `Partner`); migration `task_context_and_assignment`. Owner *is* the assignee.
- New `/tasks` route ([app/(app)/tasks/page.tsx](../app/(app)/tasks/page.tsx)) + interactive client view ([components/tasks-views.tsx](../components/tasks-views.tsx)) with optimistic toggle + inline create/assign form (assignee dropdown, priority, due, related-to, context textarea with an "insert template" starter). `createTask` writes Task + AuditLog + Activity. Sidebar gains a **Tasks** item. Task list removed from the dashboard "Today" tab; `toggleTaskDone` revalidates `/tasks` too.
- **Rule established: no task is a single button.** Every task gets a `context` field; every task form and (later) every Quick Action modal grows a context textarea. Forward-looking — when agents wire in via MCP (Phase 4), `Task.context` is the payload they read.
- *Deferred:* AI-suggested context auto-pulled from related Client interactions (lands with Track A's `generate()` wiring); reassignment of an existing task (create-with-assignee covers the case for now).

#### B3 — Pipeline drag-and-drop + next-task pop-up
- Today `app/(app)/pipeline/page.tsx` renders stage columns as static `<Link>` cards (no DnD). Extract the board into a client component using **dnd-kit** (React 19 / Next 15-safe; `react-beautiful-dnd` is unmaintained).
- On drop → `updateDealStage(dealId, newStage)` server action → `writeAudit` + `writeActivity` (feeds the activity lane).
- On successful drop → **next-task modal**: "Acme moved to Negotiation. Action the next task?" with (a) a stage-suggested next action, (b) a context textarea. Confirming creates a `Task` (with context) or kicks off the matching Quick Action.

#### B3b — Pipeline card aging (visual staleness) — ✅ done 2026-05-29 — *replaces the dropped "Re-engage stale" action*
Each deal card carries a left-accent color by **time in its current stage**: green → orange → red, stepping every **14 days without movement**. New/just-moved deal = green; 14d → orange; 28d+ → red. The team sees the stall on the board and acts — no agent chasing it.
- `Deal.stageEnteredAt` (migration `deal_stage_entered_at`): set on create, **reset on every stage change** (`updateDealStage` + convert-deal). Existing rows backfilled from `lastTouchAt`.
- `stageAgeTier()` + `STAGE_AGE_STEP_DAYS` (14) in `lib/format` — thresholds as named constants. Cards/`text-signal-*` colors via two theme tokens (`signal-fresh`/`signal-warming`, dark+light) + `flag-red`. Optimistic move flips a card to green instantly.
- Pipeline "Stale" summary stat now counts stale-in-stage (28d+).

#### B4 — Messaging (channels + DMs + polling)
- New models:

```prisma
model Channel {
  id        String   @id @default(cuid())
  kind      ChannelKind        // channel | dm
  name      String?            // null for DMs (derived from members)
  members   ChannelMember[]
  messages  Message[]
  createdAt DateTime @default(now())
}

model ChannelMember {
  channelId   String
  partnerId   String
  lastReadAt  DateTime?         // unread badges
  @@id([channelId, partnerId])
}

model Message {
  id         String   @id @default(cuid())
  channelId  String
  authorId   String?            // Partner FK; null = system message
  body       String
  taskId     String?            // if set → render as inline task card
  createdAt  DateTime @default(now())
  @@index([channelId, createdAt])
}
```

- Clickable links = linkify at render time, not schema.
- **Real-time = short-interval polling (3–5s)** — matches "semi-real-time" exactly. No new infra, no anon key on the client, no RLS. A `getMessagesSince(channelId, cursor)` server action on a `setInterval`. Supabase Realtime is the documented upgrade path the day polling feels laggy — it won't at three partners.
- **Task assignment integration:** on assignment, post a **system `Message` with `taskId` set** into the DM channel between assigner and assignee → renders as an interactive task card ("task appears in the chat with that person" falls out for free). Toggling done anywhere (chat card or Tasks tab) flips the same row and posts a completion event to the feed. **One `Task` row, surfaced in three places** (chat card, Tasks tab, activity feed) — no duplication. (`Task.assignedById` shipped in B2.)

#### B5 — Firm Agents tab
- **Agent plans** (collaboration, deploys nothing): new `AgentPlan` model — `name`, `goal`, `keyTasks` (string[]), `notes`, `status`, `createdById`. Simple CRUD. Start with a notes field; add a per-plan channel only if threaded discussion is wanted.
- **Live agents:** read-only view rendering the actual `SKILL.md` for each running skill/agent (server-side file read from `skills/<name>/`), so anyone sees how the agent thinks. Bridges to Phases 4/5 — scheduled-agent runs post into the activity feed too.

#### B6 — Data wipe — on hold
- Don't touch data yet. When ready, a guarded `prisma/wipe.ts` that truncates business tables but **preserves `Partner` rows** (SSO keeps working), with a typed confirmation. Run deliberately, not as part of feature work.

**Build sequence** (each ships independently; later steps lean on earlier): B1 ✅ → B2 ✅ → B3 (needs B1+B2) → B4 (task cards need B2) → B5 (standalone) → B6 (on hold, run at go-live). ~4 shippable PRs remain.

> Tracks A and B are independent and can interleave. B is mostly wiring on schema that already exists; A introduces the AI dependency.

---

### Phase 4 — MCP server + `/onboard-client`
- [ ] MCP server alongside the web app (same Prisma client, different surface). Contract: [mcp-contract.md](mcp-contract.md). This is the **door for Claudes outside the app** — Claude Code in a client folder, scheduled agents.
- [ ] `/onboard-client` skill — fires on `engagement.created`; scaffolds Shared Drive folder + local workspace + per-client `CLAUDE.md`, writes `driveFolderUrl` + `workspacePath` back to the Client record. Closes the three-surface handshake automatically.
- [ ] First scheduled agent: weekly pipeline review (Reporting agent — see [agent-flow-design.md](agent-flow-design.md)).
- [ ] Wire Claude Code workspaces to the MCP server; surface scheduled-agent runs in the activity feed and the Agents tab (B5).

### Phase 5 — Agents
Build **one agent at a time** off the MCP rails. Each agent = a SKILL.md + `generate()` for thinking + MCP tools for reading/writing state, following the same persistence recipe as a Quick Action (no agent is exempt). Order, specs, and discipline in [agent-flow-design.md](agent-flow-design.md). Includes `/harvest-engagement` on `engagement.closed` — *proposes* sanitized IP lifts into firm templates for partner review (the skill-learning loop; propose-not-write, per governance above).

---

## Tracking architecture

> **Principle:** every channel where work happens — partner typing in the UI, a Quick Action running, a Claude Code session in a client folder, a scheduled agent — must round-trip a row into the ops tool. Nothing happens silently. The ops tool is the system of record; if it isn't tracked here, it didn't happen.

**Three tracking models + the audit ledger underneath** (Hours removed 2026-05-28):

| Dimension | Model | What writes to it |
|---|---|---|
| Calls / meetings / emails | [`Interaction`](../prisma/schema.prisma) — `loggedBy` free-text so agents log too | Manual UI form · Quick Action drafting outreach (tags `AGENT · CLAUDE`) · Gmail/Calendar ingest (backlog) |
| Tasks | [`Task`](../prisma/schema.prisma) — has `clientId` + `projectId` FKs, plus `context` + `assignedById` (B2) | Manual UI form · convert-deal (kickoff tasks) · AI suggestions |
| ~~Hours~~ | ~~`HoursEntry`~~ | **Removed 2026-05-28** — Log hours pulled from the tool entirely (UI + action + model). |
| Deliverables | [`Artifact`](../prisma/schema.prisma) | Quick Action recipe · manual upload · Drive change watcher (backlog) |
| Audit trail | [`AuditLog`](../prisma/schema.prisma) — writer = `writeAudit()` | **Every** mutation, no exceptions |

The human-facing **activity feed** ([`Activity`](../prisma/schema.prisma), writer = `writeActivity()`) is the curated pulse over the same transactions; `AuditLog` stays the complete due-diligence ledger. Same transaction → never drift (B1).

**The persistence recipe — every Quick Action and every agent follows this exact pattern** (canonical version in [../CLAUDE.md](../CLAUDE.md) "Wire a Quick Action end-to-end"):
1. *(generative actions)* compose the call — firm brain + SKILL.md as system prompt, live Prisma data + intake as the message — and call `generate()`.
2. Save the artifact to Drive via Drive API (if it's a document).
3. Write an `Artifact` row pointing to it (`generatedFromSkill` set, `reviewStatus: "draft"`).
4. If it's an outreach draft (email / re-engage), also write an `Interaction` row tagged `loggedBy: "AGENT · CLAUDE"`.
5. Write one `AuditLog` row via `writeAudit(actor, action, target, changes)` — and `writeActivity()` if it's feed-worthy.

All writes in one server-action transaction; partial failures roll back. No agent is exempt.

**External-surface ingest (backlog — feeds the same models, no schema churn):** Gmail/Calendar scan and *propose* `Interaction` rows for partner approval; Drive change watcher proposes `Artifact` rows; Claude Code session-end hook logs hours + registers files via MCP. All propose-not-write, per governance.

---

## Client-file access patterns

How the ops tool reaches files in client Drive folders (per-client isolation holds throughout):

| Pattern | Use for | Access model | Status |
|---|---|---|---|
| **Click-out buttons** | Partner clicks "Open Drive folder" from the Client page | UI uses `driveFolderUrl`; no server-side access | ✅ shipped |
| **Server-side scoped fetch** | Quick Actions needing specific files for context (e.g. last SOW for style) | Drive API call scoped to the action's Client FK — the referenced file only, not the tree | ✅ shipped |
| **Embedded file listing** | "Files" tab listing folder contents | Server-side Drive API list, scoped to `driveFolderUrl` | backlog |
| **Claude Code in the client folder** | Multi-file heavy lifts (proposals, decks) | Local filesystem via Drive for Desktop; launch Claude at the *client folder*, never the drive root | available now |

**Isolation rule:** the boundary is "one client at a time, not no client access." Working on Acme — in Claude Code or via an Acme Quick Action — Claude has full read/write on Acme; it cannot see Beta. Prevents *cross-client* bleed, not Claude-to-client access. Architecture: [../../shiftai-firm/planning/file-system-platform-decision.md](../../shiftai-firm/planning/file-system-platform-decision.md).

---

## Architecture (target end-state)

```
┌──────────────────────────────────────────────────────────────┐
│  OPS TOOL                                                      │
│                                                                │
│  ┌────────────────┐                    ┌──────────────┐       │
│  │  Web UI        │                    │  MCP Server  │       │
│  │  (Next.js)     │                    │  (same DB)   │       │
│  │  • Quick       │                    └──────┬───────┘       │
│  │    Actions ────┼──► generate() ──┐         │               │
│  │  • Firm Hub    │                 │         │               │
│  └────────┬───────┘                 │         │               │
│           │                         │         │               │
│           │   ┌─────────────────────▼──┐      │               │
│           │   │ skills/_firm/context.md │      │  (Claude Code │
│           │   │ skills/<action>/SKILL.md│      │   + scheduled │
│           │   └────────────┬────────────┘      │   agents      │
│           │                ▼                    │   call in)    │
│           │        Anthropic API (cloud)        │              │
│           │                                     │               │
│           └─────────────┬───────────────────────┘               │
│                         ▼                                       │
│                ┌────────────────┐                              │
│                │  Postgres      │  ← live firm state           │
│                │  (Supabase)    │                              │
│                └────────────────┘                              │
└──────────────────────────────────────────────────────────────┘
        ▲                                              ▲
   humans (web UI)                    Claude Code / scheduled agents (MCP)
```

Two interfaces over one state. Humans use the web UI; Claude Code and scheduled agents use MCP; both write through the same Prisma client. The **API** is the brain both surfaces borrow to generate; the **firm brain + skills** shape what it produces; the **DB** is the single source of truth.

---

## Backlog (post-Phase-3, pulled in by partner pull, not date)

Known wants scoped out of the shipped phases. Promote into a phase when something forces it.

| Item | Trigger to build |
|---|---|
| Tax handling (HST/GST, US sales tax) | Before sending the first real invoice |
| Bulk import contacts (CSV) | Migrating an existing contact list in |
| Gmail / Calendar ingest (propose Interactions) | When manual logging gets missed |
| Files browser on Client/Project (Drive list) | When click-out isn't enough |
| Global search wiring (Cmd+K is decorative today) | When the data set outgrows nav |
| E-signature (DocuSign / HelloSign) | First contract that needs e-sign |
| Stripe / Plaid (auto-mark paid, aging) | When manual invoice status gets tedious |
| Resource capacity planning · profitability per project | At 3+ concurrent engagements |
| Task notifications (email/in-app) | When tasks get dropped |
| Per-engagement permissioning | First sensitive (M&A) engagement |
| Mobile-responsive (pipeline, time log, status) | When partners work off-desktop |
| **Later, probably never at this scale:** lead scoring · weighted forecast · Gantt · recurring retainer billing · multi-currency · time-approval workflow · client portal · multi-tenant | revisit only if justified |

---

## Open questions

- **Firm-brain scope.** What goes in `skills/_firm/context.md` vs. what's pulled live from Prisma per call? Start narrow (voice + positioning + jargon ban + roster); expand only when an action visibly needs it.
- **Skill de-personalization.** How much of each `-jason` personal skill survives the firm-generic rewrite? Decide per skill at promotion time.
- **Tenancy.** Single-tenant forever, or design for multi-tenant if the tool becomes sellable acquirer IP? Single-tenant for now; revisit at first acquisition conversation.
- **MCP transport / hosting.** stdio (local, simple) vs HTTP (remote, needed if agents run off-machine). See [mcp-contract.md](mcp-contract.md) open questions.
- **Document storage.** Drive pointers for now; move to DB blobs only if a real workflow demands it.
- **Integrations (Stripe / Calendar / Slack).** Zero for now; add one at a time on partner pull.
