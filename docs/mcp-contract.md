# Ops Tool — MCP Contract

> **Status:** Phase 4 interface spec — not built yet. Tool signatures are sketches; refine against the live Prisma schema when the build starts.
> **Parent:** [ROADMAP.md](ROADMAP.md) — Phase 4 consumes this contract.
> **Firm context:** [../../shiftai-firm/WorkspacePlan.md](../../shiftai-firm/WorkspacePlan.md) §2 (three surfaces), §6 (`/onboard-client`), §7 (IP library).

Canonical home for the MCP interface the ops tool will expose to Claude Code workspaces and scheduled agents.

---

## Principle

The ops tool exposes an MCP server alongside its web UI. Claude Code workspaces register it in `.claude/settings.json`. The MCP server is the integration layer — not webhooks, not one-off REST endpoints. Same Prisma client / same Postgres behind both surfaces (see [ROADMAP.md](ROADMAP.md) "Architecture").

---

## Read tools (Claude calls these to get state)

- `get_client(id)` — full record: name, contacts, contract terms, status, partner lead, `driveFolderUrl`, `workspacePath`
- `get_project(id)` — scope, team, hours, deliverables, status, parent client
- `list_pipeline(filters)` — open deals by stage, last-touch dates, owners
- `list_active_engagements()` — running engagements with status
- `get_team_hours(period, filters)` — hours by partner / project / week
- `list_artifacts(scope, filters)` — deliverables for a Client / Project / Deal (powers Deliverables tabs)
- `get_ip_library_index()` — what's in the firm IP library (proxied from Drive)

---

## Write tools (Claude calls these to update state)

- `create_engagement(client_id, scope_payload)` — fires on signed deal; auto-emits `engagement.created`
- `log_hours(project_id, hours, description, partner_id)` — Claude logs time after substantial work sessions
- `update_project_status(project_id, status, notes)` — status from inside a client workspace
- `create_artifact(type, title, driveUrl, scope:{clientId?|projectId?|dealId?}, generatedFromSkill?)` — registers a deliverable; auto-emits an `AuditLog` row

> The `Artifact` model and `writeAudit()` ledger already exist (shipped Phase 3 — see [../prisma/schema.prisma](../prisma/schema.prisma)). These write tools wrap them; they don't introduce new schema.

---

## Events Claude listens for (webhooks or polling)

- `engagement.created` → `/onboard-client` workspace scaffold
- `engagement.closed` → `/harvest-engagement` IP extraction
- `proposal.requested` → `/scope` skill drafts a proposal

---

## Custom fields still to add (Phase 4)

The handshake fields `driveFolderUrl` + `workspacePath` are already on `Client` (✅ shipped). Still to add when the build reveals the need:

- **On Client:** `engagementCharterMd` — auto-populated by `/onboard-client`
- **On Project:** `ipHarvestStatus` (patterns extracted into the IP library yet?), `lastClaudeSyncAt` (when Claude last updated status). A hierarchical `buildArtifactsIndex` is largely superseded by the `Artifact` model's Project FK — add only if a tree index proves useful.

---

## Open questions

- **Hosting** — local-only, or cloud-hosted so scheduled agents can reach it from anywhere?
- **Transport** — stdio (simple, local) vs HTTP (remote-accessible, needed if agents run off-machine).
- **Auth** — how does Claude Code authenticate? Inherit Google Workspace SSO, or a separate service token?
- **Webhooks vs polling** for the event stream — webhooks are cleaner but require the tool to know where Claude listens; polling is simpler to start.
- **Schema mapping** — walk each tool signature against the live [../prisma/schema.prisma](../prisma/schema.prisma) before implementing (schema landed after this contract was first drafted).
