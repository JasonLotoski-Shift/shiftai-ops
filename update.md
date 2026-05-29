# Update — Communication & Activity Hub + Pipeline/Tasks/Agents

> Active build plan. Sits between Phase 3e and Phase 4 in [docs/ROADMAP.md](docs/ROADMAP.md).
> Decisions made 2026-05-28 (Jason): **real-time = short-interval polling**, **data wipe on hold**.
> Fold the agreed shape into ROADMAP.md once the first steps land.

---

## What we found (grounding)

The schema is most of the way there already:

- `Activity` model exists but is **only written by `prisma/seed.ts`** — no real mutation feeds it yet.
- `Task` has `owner` (Partner FK) + `clientId`/`projectId` FKs already.
- `AuditLog` already captures every write via `writeAudit()` inside each action's `$transaction`.
- `Partner` is the user table (Auth.js links by email at first sign-in).
- No real-time anything today (no polling / sockets / Supabase Realtime).
- Sidebar (`components/sidebar.tsx`) already has disabled "Agents / Settings" slots under a "Firm" section.

So most of this is **wiring, not new foundations**.

---

## Part 1 — Communication & Activity Hub

### Core idea: one firm timeline, three lanes

Not "chat plus a separate log." One timeline of timestamped events, rendered in three lanes:

| Lane | What | Backing model | Written by |
|---|---|---|---|
| **Channels** | Firm rooms (`#general`, `#pipeline`, `#deals`) | `Message` (channel-scoped) | Partners |
| **Direct messages** | 1:1 between partners | `Message` (DM-scoped) | Partners + system (task cards) |
| **Activity feed** | Auto "what happened" — deal moved, task done, action ran | `Activity` (exists) | The app, from mutations |

A deal moving to "negotiation" is structurally the same as a partner posting a message — both are timestamped events. The activity feed is a read-only system author posting into the timeline. Render them in the same scroll, styled differently. That's the live pulse.

### New models (messaging)

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

Clickable links = linkify at render time, not schema.

### Activity feed wiring (the "already designed" part)

- Add a `writeActivity()` helper alongside `writeAudit()`, called in the **same transaction** for feed-worthy events only:
  - Deal stage change · Task assigned/completed · Quick Action ran · Client created (convert-deal)
- Extend `Activity` with a single nullable `link` column (relative URL like `/pipeline/<id>`) so feed rows click through. Chose one free-text `link` over three FK columns to match the codebase's loose-coupling convention for log models (`Interaction.loggedBy`, `HoursEntry.loggedBy`, `Activity.actor` are all free-text, not FKs) — and to avoid back-relations + migration delete-ordering on three models.
- `AuditLog` stays the complete ledger (every write, due-diligence grade). `Activity` is the curated human feed. Same transaction → never drift.

**Step 1 — DONE (2026-05-28):** `writeActivity()` in `lib/audit.ts`; `Activity.link` column + migration `activity_link_field`; wired into `toggleTaskDone` (completions only), `convertDeal`, `logHours`, `logInteraction`, `saveEmailDraft`, `sendEmail`, `markInvoiceSent`, `markInvoicePaid`; dashboard feed rows now click through when `link` is set. `lib/types.ts` Activity kept in sync. Type-check clean.

### Real-time — DECISION: short-interval polling (3–5s)

Matches "semi-real-time" exactly. No new infra, no anon key on the client, no RLS. A `getMessagesSince(channelId, cursor)` server action on a `setInterval`. Supabase Realtime is the documented upgrade path the day polling feels laggy — won't at 3 partners.

### Task assignment integration

`Task` already has an `owner` Partner FK. Add:

1. `assignedById` (Partner FK, nullable) + `context` (text) on `Task`. Owner *is* the assignee.
2. On assignment, post a **system `Message` with `taskId` set** into the DM channel between assigner and assignee → renders as an interactive task card. "Task appears in the chat with that person" falls out for free.
3. Toggling done anywhere (chat card or Tasks tab) flips the same row and posts a completion event to the activity feed.

One `Task` row, surfaced in three places (chat card, Tasks tab, activity feed). No duplication.

---

## Part 2 — Pipeline / Tasks / Agents

### 2a. Wipe customer data — ON HOLD

Decision: don't touch data yet. When ready, a guarded `prisma/wipe.ts` that truncates business tables but preserves `Partner` rows (SSO keeps working), with a typed confirmation. Run deliberately, not as part of feature work.

### 2b. Pipeline drag-and-drop + next-task pop-up

- Today `app/(app)/pipeline/page.tsx` renders stage columns as static `<Link>` cards (no DnD).
- Extract the board into a client component using **dnd-kit** (React 19 / Next 15-safe; `react-beautiful-dnd` is unmaintained).
- On drop → `updateDealStage(dealId, newStage)` server action → `writeAudit` + `writeActivity` (also feeds the activity lane).
- On successful drop → **next-task modal**: "Acme moved to Negotiation. Action the next task?" with (a) a stage-suggested next action, (b) a context textarea. Confirming creates a `Task` (with context) or kicks off the matching Quick Action.

**Step 3 — DONE (2026-05-28):** Used **native HTML5 drag-and-drop** (no dnd-kit) — only column-to-column restage is needed, so a dependency + React-19 peer friction wasn't worth it. New `updateDealStage` action in [app/(app)/pipeline/actions.ts](app/(app)/pipeline/actions.ts) (validates target stage, rejects `signed` → that's the convert flow, resets `lastTouchAt`, writes Deal + AuditLog + Activity "Moved to X"). Board extracted to client component [components/pipeline-board.tsx](components/pipeline-board.tsx): draggable cards with optimistic move + revert-on-error, column drop highlight, cards still click through to the deal. On a successful drop, a **next-task pop-up** opens pre-filled with a stage-appropriate task title + context scaffold (per-stage map), defaulting the assignee to the deal's partner lead, due in 3 days — confirming calls `createTask`; "Skip" just keeps the move. [app/(app)/pipeline/page.tsx](app/(app)/pipeline/page.tsx) is now a thin server shell (header + stats) feeding the board. Type-check clean.
  - *Deferred:* "kick off the matching Quick Action" from the pop-up (vs. create a task) — wires in once the remaining Quick Actions exist (Phase 3e). The signed column is a non-droppable info panel pointing to the convert flow.

### 2c. Tasks tab + context input

- New route `/tasks` (server component, like other list pages); enable the slot in `components/sidebar.tsx`.
- **Remove** the task list from the dashboard "Today" tab (`components/dashboard-views.tsx`, the `grid-cols-[24px_1fr_120px_110px]` block).
- **Every task gets a `context` field.** Rule: no task is a single button. Task create/assign form + every Quick Action modal grow a context textarea, optionally pre-filled with suggested context (from the related Client's recent interactions — already fetched for Quick Actions). Forward-looking: when API agents wire in via MCP (Phase 4), `Task.context` is the payload they read.

**Step 2 — DONE (2026-05-28):** Schema — `Task.context`, `Task.assignedById` (+ named `TaskOwner`/`TaskAssignedBy` relations on Partner); migration `task_context_and_assignment`. New `/tasks` route: server page ([app/(app)/tasks/page.tsx](app/(app)/tasks/page.tsx)) + interactive client view ([components/tasks-views.tsx](components/tasks-views.tsx)) with optimistic toggle + inline create/assign form (assignee dropdown, priority, due, related-to, context textarea with an "insert template" starter). `createTask` action in [app/(app)/tasks/actions.ts](app/(app)/tasks/actions.ts) — writes Task + AuditLog + Activity ("Assigned task to X" / "Created task"). Sidebar gains a **Tasks** item. Task list removed from the dashboard "Today" tab (now just Quick Actions); `toggleTaskDone` revalidates `/tasks` too. `lib/types.ts` Task kept in sync. Type-check clean.
  - *Deferred:* AI-suggested context (auto-pulled from related Client interactions) lands with the Claude API / Quick Action wiring — the manual + template path is in now. Reassignment of an existing task (vs. create-with-assignee) also deferred; create covers the assignment case for now.

### 2d. Firm Agents tab — planning vs. live

- **Agent plans** (collaboration, does NOT deploy anything): new `AgentPlan` model — `name`, `goal`, `keyTasks` (string[]), `notes`, `status`, `createdById`. Simple CRUD forms. Start with a notes field; add a per-plan channel only if threaded discussion is wanted.
- **Live agents**: read-only view rendering the actual `SKILL.md` for each running skill/agent (server-side file read from `shiftai-ops/skills/<name>/`), so anyone sees how the agent thinks. Bridges to Phase 4/5 — scheduled agent runs post into the activity feed too.

---

## Build sequence

Each step ships independently; later steps lean on earlier ones.

1. **Activity feed wiring** — `writeActivity` helper + extend `Activity`. Small; makes the dashboard come alive; no new UI surface. ← starting here
2. **Tasks tab + `context` field + remove from dashboard** — self-contained; unblocks 2b's pop-up and chat task cards.
3. **Pipeline drag-and-drop + next-task pop-up** — depends on 1 + 2.
4. **Messaging (channels + DMs + polling)** — biggest new surface; task cards in DMs depend on 2.
5. **Firm Agents tab** — standalone.
6. **Data wipe** — on hold; run when going live.

~5 shippable PRs. Roadmap entry to follow once step 1 lands.
