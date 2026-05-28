# Ops Tool — Feature List

> Companion to [ROADMAP.md](ROADMAP.md) and [userstories.md](userstories.md). Features map back to user stories; priorities feed the build order.
>
> **Status snapshot (2026-05-28):** The Phase 1 prototype build order at the bottom of this doc is ✅ done — those screens ship today on `https://ops.shiftai.partners` with real data through Prisma/Supabase. Most non-AI MVP items here are live. The AI rows (`MVP (UI) · V1 (live)`) have neither half built yet — Phase 3+ work per [ROADMAP.md](ROADMAP.md).

## Priority legend

- **MVP** — must work in v1; demonstrates the core operating loop
- **V1** — production-quality v1; needed before the tool runs the firm
- **Later** — known want, scoped out of v1, revisit when justified by pull

---

## Architectural principle — tracking round-trip

> Every channel where work happens — partner typing in the UI, Quick Action running, Claude Code session in a client folder, scheduled agent — round-trips a row into the ops tool. Nothing happens silently. The four tracking models (`Interaction`, `Task`, `HoursEntry`, `Artifact`) + the `AuditLog` ledger are the substrate. Full design in [ROADMAP.md](ROADMAP.md) "Tracking architecture." This binds every AI feature in Pillar 4 and every manual feature in Pillars 1–3.

---

## Pillar 1 — Pipeline / CRM

| Feature | Priority | Notes |
|---|---|---|
| Contacts list with search and filters | MVP | Name, company, role, partner-lead, last-touch date, tags |
| Contact detail view | MVP | Comms log, related deals, partner lead, reach, stale flag |
| Relationship intelligence fields | MVP | Persona, communication style, key facts, background, hobbies/interests, network affiliations, notes |
| Communications log + log-interaction action | MVP | Call / meeting / email-sent / email-received / other; date defaults to today; one-click from contact |
| Contact web search (proposes additions) | MVP (UI) · V1 (live) | Pulls public info, proposes record additions for partner approval |
| Contact AI enrich from comms log (proposes additions) | MVP (UI) · V1 (live) | Reads interaction history, proposes persona/style/key-fact updates |
| Non-destructive merge on enrichment | MVP | Additions merge; existing facts never overwritten; conflicts flagged for human resolution |
| AI draft email with no-hallucination gate | MVP (UI) · V1 (live) | Missing price/role/date left as `[NEEDS INPUT]`; cannot "send" until filled |
| Add/edit contact | MVP | Single-screen form, sub-30-second flow |
| Pipeline board (kanban by deal stage) | MVP | Stages configurable; default: Lead → Qualified → Discovery → Proposal → Negotiation → Signed |
| Deal record (linked to contact + partner-lead) | MVP | Stage, value estimate, source, close-date target |
| Log a touch-point | MVP | One-click: type (call/email/meeting), date, short note |
| Stale-deal flag | MVP | Auto-highlight deals untouched 30+ days |
| Convert deal → client + project on stage = Signed | MVP | One-click; opens new-client flow |
| Partner-lead assignment + filtering | MVP | Pipeline board filterable by partner |
| Bulk import contacts (CSV) | V1 | For migrating existing contact lists in |
| Email integration (auto-log touch-points from Gmail) | V1 | Gmail API |
| Calendar integration (auto-log meetings) | V1 | Google Calendar API |
| Outreach drafting (AI-assisted) | V1 | Claude drafts re-engagement based on contact history |
| Lead scoring | Later | Probably not needed at this scale |
| Forecast / weighted pipeline | Later | Single-partner view sufficient for MVP |

---

## Pillar 2 — Client management

| Feature | Priority | Notes |
|---|---|---|
| Client record (created from converted deal) | MVP | Name, industry, partner-lead, primary contact, Drive folder URL, Claude workspace path, status |
| Client detail view (two sub-tabs) | MVP | Sub-tab A: company profile · Sub-tab B: engagement & billing |
| Company profile sub-tab | MVP | Size, HQ, founded, ownership, website, branding (colours/logo), description, key facts |
| Company profile auto-update (comms + web search) | MVP (UI) · V1 (live) | Proposes additions; existing facts preserved (non-destructive) |
| Engagement & billing sub-tab | MVP | Contract value, billed/collected/outstanding, payment terms, contract period, projects, invoices |
| Scoping document drafting | MVP | Template-driven; partner fills in scope, system formats as proposal |
| Statement of Work (SOW) generation | MVP | From scope → renderable PDF or markdown |
| Contract record (attach signed PDF + key terms) | MVP | Counterparty, value, start/end, payment terms, signed-on date |
| Invoice creation against project hours + milestones | MVP | Generates invoice number, line items from logged hours, exports PDF |
| Invoice status tracking (draft / sent / paid / overdue) | MVP | Manual status updates v1; Stripe webhooks later |
| Aging report (outstanding by client, by age bucket) | MVP | Single dashboard, top of finance view |
| Document/file attachments on client record | MVP | Pointers to Drive (not file blobs in DB); registered as `Artifact` rows |
| **Open Drive folder / Copy workspace path buttons** on Client detail | MVP | Uses `Client.driveFolderUrl` + `Client.workspacePath` (fields already on schema); cheap three-surface handshake |
| **Deliverables tab** on Client detail | MVP | Lists `Artifact` rows scoped to the client; click → opens Drive URL |
| **Files browser** on Client detail (V1) | V1 | Server-side Drive API list call; lists folder contents, click → opens in Drive |
| E-signature integration | V1 | DocuSign or HelloSign for contracts |
| Stripe / Plaid payment integration | V1 | Auto-mark invoices paid; track aging without manual updates |
| Recurring retainer billing | Later | Project-fee model dominates MVP; retainers can wait |
| Multi-currency | Later | All CAD/USD for MVP |
| Tax handling (HST/GST, US sales tax) | V1 | Required before sending real invoices |

---

## Pillar 3 — Project management

| Feature | Priority | Notes |
|---|---|---|
| Project record (linked to client) | MVP | Name, scope summary, partner-lead, status, start/end, budget hours, budget fee |
| Project detail view | MVP | Team, tasks, milestones, hours-vs-budget, deliverables, status notes |
| Active engagements dashboard | MVP | All in-flight projects on one screen; status colour-coded (on-track/at-risk/blocked) |
| Team assignment (consultant + role + rate) | MVP | Multiple consultants per project; role and rate fields |
| Task list per project | MVP | Title, assignee, status, due date; not a full PM tool — just enough |
| Milestone tracking | MVP | Milestones with dates, status, optional deliverables attached |
| Time logging (project + hours + description) | MVP | Sub-15-second flow from anywhere in the app |
| Hours-vs-budget visualization | MVP | Bar or burn-down per project; flag at 75% / 90% / 100% |
| Deliverable artifact attachment (Drive URL or commit link) | MVP | Registered as `Artifact` rows scoped to the project; appears on the Deliverables tab |
| **Deliverables tab** on Project detail | MVP | Same pattern as Client — lists `Artifact` rows scoped to the project |
| **Task scoped to Client + Project** | MVP | Add `clientId` + `projectId` FKs to `Task` (currently only free-text `relatedTo`); enables "what's open on Acme" queries |
| Engagement close workflow | MVP | Mark closed → final invoice prompt → archive flag → fires `engagement.closed` event |
| "My projects" view for consultants | MVP | Filtered to assigned engagements only |
| Task notifications | V1 | Email or in-app; no Slack yet |
| Gantt / timeline view | Later | Probably overkill for engagement scale |
| Resource capacity planning (across all projects) | V1 | Once 3+ active engagements, partners need this |
| Profitability per project (revenue - cost) | V1 | After invoicing matures; key metric for the firm |
| Time approval workflow (consultant logs → partner approves) | Later | Trust-first culture for now |

---

## Pillar 4 — MCP / AI integration

This is the layer that makes the tool different from a generic ops stack. Every record reachable by Claude Code and scheduled agents through MCP. Contract: [mcp-contract.md](mcp-contract.md). Agent set: [agent-flow-design.md](agent-flow-design.md).

> **Non-negotiable principle — no hallucination.** No AI surface (draft, document, enrichment, profile update) may assume a fact it wasn't given — a role, a price, a timeline, a commitment. Unknowns are asked for or left as explicit `[NEEDS INPUT]` markers; they are never guessed. This overrides "be helpful" and applies to every row below and every skill the firm builds.

| Feature | Priority | Notes |
|---|---|---|
| No-hallucination guard on all AI output | MVP | Enforced in prototype UI (draft-email gate, "proposed" enrichment); enforced server-side in V1 |
| Enrichment as a review queue (proposed, never auto-applied) | MVP (UI) · V1 (live) | Web search + AI enrich propose; partner approves; conflicts surfaced, not overwritten |
| **`Artifact` model — first-class deliverables tracking** | MVP | Every AI-generated or partner-uploaded file gets a row; powers Deliverables tabs and harvest flows. Spec: [ROADMAP.md](ROADMAP.md) "Tracking architecture" |
| **`writeAudit()` helper — middleware for every mutation** | MVP | Shared helper; every mutation server action writes one `AuditLog` row before returning. Adding a new mutation = one line |
| **Quick Action persistence recipe** (Artifact + optional Interaction + AuditLog) | MVP | Canonical pattern every Quick Action and Phase 5 agent follows. One server-action transaction; partial failures roll back |
| **Server-side Drive API client** (scoped fetch for Quick Action context) | MVP | Pulls specific files referenced by an action; never folder-wide scans. Preserves per-client isolation |
| MCP server alongside web app (same DB) | V1 | Built once web app stabilizes; not needed for UI/UX prototype |
| MCP tool: `get_client(id)` | V1 | Full client record + linked folder paths |
| MCP tool: `get_project(id)` | V1 | Scope, team, hours, status, deliverables |
| MCP tool: `list_pipeline(filters)` | V1 | For scheduled pipeline-hygiene agents |
| MCP tool: `list_active_engagements()` | V1 | For dashboarding agents |
| MCP tool: `create_engagement(client_id, scope_payload)` | V1 | Fires on signed deal; auto-emits event |
| MCP tool: `log_hours(project_id, hours, description, partner_id)` | V1 | Claude logs time after work sessions |
| MCP tool: `update_project_status(project_id, status, notes)` | V1 | Status updates from inside client workspaces |
| MCP tool: `create_artifact(type, title, drive_url, scope, generated_from_skill?)` | V1 | Registers a deliverable as an `Artifact` row scoped to Client / Project / Deal; auto-emits `AuditLog` row |
| MCP tool: `list_artifacts(scope, filters)` | V1 | Powers Deliverables tabs + harvest agents |
| Event: `engagement.created` (webhook or polled) | V1 | Triggers `/new-client` scaffold flow |
| Event: `engagement.closed` | V1 | Triggers `/harvest-engagement` |
| Event: `proposal.requested` | V1 | Triggers `/scope` skill |
| AI activity audit log (every MCP call logged) | V1 | Required for acquirer diligence per parent plan |
| First-class "AI agent" user type with scoped permissions | V1 | Auditable, revocable |
| AI-drafted outreach sitting in a partner review queue | V1 | Pipeline-hygiene agent output; partner approves/edits before send |
| AI-suggested IP harvest on engagement close | V1 | `/harvest-engagement` proposes patterns; partner approves |

---

## Pillar 5 — Foundational (cross-cutting)

| Feature | Priority | Notes |
|---|---|---|
| Google Workspace SSO (`shiftai.partners`) | MVP | Auth.js v5 + Google provider; `hd=shiftai.partners` chooser restriction; `@shiftcg.ai` accepted during alias sunset |
| User accounts with role (Partner / Consultant / Agent) | MVP | Permissions enforced on every read/write |
| Global search across contacts, clients, projects | MVP | Single search bar, scoped to user's permissions |
| Activity feed (recent changes across the firm) | MVP | Lives in dashboard "The firm" view |
| Dashboard split: "Today" (do) + "The firm" (know) | MVP | Today = quick actions + task list; The firm = team updates, engagements, activity, industry news |
| Quick actions + personal task list | MVP | Launchers (draft email, run action, log hours, draft proposal, add contact, re-engage) + checkable tasks |
| Team updates + industry news feeds | MVP | Daily/weekly updates and account-relevant news in the "know" view |
| Light mode (persisted toggle) | MVP (done) | Dark stays brand default; palette re-themes via CSS variables; no-flash pre-paint script |
| Mobile-responsive layouts | V1 | At minimum: pipeline, time logging, project status |
| Audit log (every write logged with actor + timestamp) | V1 | Table exists ([../prisma/schema.prisma](../prisma/schema.prisma)); foundation for AI activity audit |
| Per-engagement permissioning (partner-of-record only on sensitive deals) | V1 | For M&A advisory / sensitive industries |
| Configurable pipeline stages | V1 | Default set works for MVP |

---

## Prototype build order — ✅ done (Phase 1)

Sequence used to land the clickable demo that pressure-tested the operating loop with partners. All shipped:

1. ✅ Login screen + dashboard shell
2. ✅ Pipeline board (kanban with seed prospects across stages)
3. ✅ Contact detail view (full activity timeline)
4. ✅ Client list + client detail view
5. ✅ Project list + project detail view
6. ✅ Time logging modal (the 15-second flow)
7. ✅ Active engagements dashboard
8. ✅ Invoice list + invoice detail
9. ✅ Convert deal → client flow

Phase 2 then swapped seed fixtures for live Prisma/Supabase + real Auth.js Google SSO. Next: Phase 3 (Quick Actions) per [ROADMAP.md](ROADMAP.md).
