# Ops Tool — MCP Contract

> **Status:** Draft v1. Sketched at the firm-architecture level; not implementation-ratified. Refine here as the Phase 3+ build reveals real shape.
> **Parent:** [ROADMAP.md](ROADMAP.md) — Phase 4 (MCP server + scheduled agents) consumes this contract.
> **Firm context:** [../../shiftai-firm/WorkspacePlan.md](../../shiftai-firm/WorkspacePlan.md) §2 (three operating surfaces), §6 (the `/new-client` flow), §7 (IP library).

Canonical home for the MCP interface the ops tool will expose to Claude Code workspaces and scheduled agents. The firm-level WorkspacePlan points here rather than duplicating.

---

## Principle

The ops tool exposes an MCP server alongside its web UI. Claude Code workspaces register the server in their `.claude/settings.json`. The MCP server is the integration layer — not webhooks, not one-off REST endpoints. Same Prisma client / same Postgres behind both surfaces (see [ROADMAP.md](ROADMAP.md) "Architecture").

---

## Read tools (Claude calls these to get state)

- `get_client(id)` — full client record: name, contacts, contract terms, status, partner lead, drive_folder_url, claude_workspace_path
- `get_project(id)` — scope, team, hours logged, deliverables, current status, parent client
- `list_pipeline(filters)` — open deals by stage, last-touch dates, owners
- `list_active_engagements()` — currently-running engagements with status
- `get_team_hours(period, filters)` — hours by partner, by project, by week
- `get_ip_library_index()` — what's in the firm IP library (proxied from Drive)

---

## Write tools (Claude calls these to update state)

- `create_engagement(client_id, scope_payload)` — fires when a deal is signed; auto-emits `engagement.created` event
- `log_hours(project_id, hours, description, partner_id)` — Claude logs time after substantial work sessions
- `update_project_status(project_id, status, notes)` — status updates from inside a client workspace
- `attach_artifact(project_id, drive_url, type)` — link a deliverable to the project
- `create_proposal_record(prospect_id, proposal_url)` — when `/scope` skill drafts a proposal

---

## Events Claude listens for (webhooks or polling)

- `engagement.created` → triggers `/new-client` workspace scaffold flow
- `engagement.closed` → triggers `/harvest-engagement` IP extraction
- `proposal.requested` → triggers `/scope` skill to draft proposal

---

## Custom fields the ops tool adds to first-class records

These are the pointers that link the three surfaces.

**On Client** (✅ already in [../prisma/schema.prisma](../prisma/schema.prisma#L205)):
- `driveFolderUrl` — canonical link to client's Drive folder
- `workspacePath` — canonical link to local workspace folder
- *(`engagement_charter_md` — auto-populated by `/onboard-client` skill; not yet added)*

**On Project** (not yet added — Phase 4 work):
- `build_artifacts_index` — pointers to deliverables in Drive/workspace *(largely superseded by the `Artifact` model below, which scopes to Project by FK — keep only if a hierarchical index proves useful)*
- `ip_harvest_status` — has this project's patterns been extracted into IP library yet?
- `last_claude_sync_at` — when Claude last updated this project's status

---

## `Artifact` model — deliverables tracking (Phase 3b — to add)

Every AI-generated or partner-uploaded deliverable gets a first-class DB row, not a free-text Drive link buried in notes. Full design in [ROADMAP.md](ROADMAP.md) "Tracking architecture."

```
Artifact {
  id                   String   @id @default(cuid())
  type                 ArtifactType   // proposal | deck | email | sow | invoice | report | other
  title                String
  driveUrl             String
  fileName             String?
  createdBy            String   // free-text — partner name or "AGENT · CLAUDE"
  generatedFromSkill   String?  // optional — "scope", "html-brief", "draft-email", null for manual
  reviewStatus         ArtifactReviewStatus   // draft | approved | sent | archived

  client     Client?   @relation(fields: [clientId],  references: [id])
  clientId   String?
  project    Project?  @relation(fields: [projectId], references: [id])
  projectId  String?
  deal       Deal?     @relation(fields: [dealId],    references: [id])
  dealId     String?

  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@index([clientId, createdAt])
  @@index([projectId, createdAt])
}
```

Write tool (post-MCP):
- `create_artifact(type, title, driveUrl, scope:{clientId?|projectId?|dealId?}, generatedFromSkill?)` — registers a deliverable, auto-emits `AuditLog` row.

Read tool:
- `list_artifacts(scope, filters)` — for the "Deliverables" tab on Client/Project detail pages.

---

## Open questions

- **MCP server hosting** — local-only, or cloud-hosted so scheduled agents can reach it from anywhere?
- **Transport** — stdio (simple, local) vs HTTP (remote-accessible, needed if scheduled agents run off-machine).
- **Auth** — how does Claude Code authenticate to the MCP server? Inherit Google Workspace SSO, or separate service token?
- **Webhooks vs polling** for the event stream — webhooks are cleaner but require the ops tool to know where Claude is listening; polling is simpler to start with.
- **Data model mapping** — how do these tool signatures map to the live Prisma schema ([../prisma/schema.prisma](../prisma/schema.prisma))? Needs a walkthrough — schema landed after this contract was first drafted.
