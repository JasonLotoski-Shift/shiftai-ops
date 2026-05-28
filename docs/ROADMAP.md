# Ops Tool — Roadmap

> **Status:** Phase 1–2 shipped (prototype UI + working v1 on `https://ops.shiftai.partners`). Phase 3 (MCP + agents) is next.
> **Parent:** [../../shiftai-firm/WorkspacePlan.md](../../shiftai-firm/WorkspacePlan.md) — firm-level operating architecture; the ops tool is Surface 1 (the spine).
> **Stack & conventions:** [../CLAUDE.md](../CLAUDE.md) — current production stack, gotchas, and repo layout live there; this file does not duplicate.
> **Companions in this folder:** [userstories.md](userstories.md), [features.md](features.md), [mcp-contract.md](mcp-contract.md), [agent-flow-design.md](agent-flow-design.md).

---

## Mission

Shift AI's internal operating tool — the system of record for pipeline, clients, contracts, and projects. Not generic CRM or PM. Custom, AI-native, owned by the firm. Per the parent plan, the tool itself is the firm's first major piece of compounding IP and an acquirer-valued asset alongside the engagement book.

---

## What it does (three pillars + the AI layer)

1. **Pipeline / CRM** — contacts, prospects, deal stages, fill-the-pipeline workflows
2. **Client management** — invoicing, contract creation, scoping, document handling
3. **Project management** — engagement tracking, hours, task assignment, deliverable status
4. **MCP integration** *(what makes this different from a Notion/Pipedrive/Harvest stack)* — every record reachable by Claude Code and scheduled agents through an MCP server; AI is first-class, not a plugin

---

## Phase status

### Phase 1 — UI/UX prototype — ✅ done
Pipeline board, contact + client + project + invoice detail views, dashboard, time logging, convert-deal flow — all shipped with seed data ([../lib/data/seed.ts](../lib/data/seed.ts)).

### Phase 2 — Working v1 — ✅ done
- Postgres on Supabase, Prisma 7 schema ([../prisma/schema.prisma](../prisma/schema.prisma)) with 15 models + 11 enums + AuditLog
- Auth.js v5 with Google SSO restricted to `shiftai.partners` (alias `shiftcg.ai` accepted during sunset)
- Auto-deploys to Vercel from `main`; live at `https://ops.shiftai.partners`
- Audit log table in place, not yet exercised by AI writes

### Phase 3 — Mutations + tracking round-trip + first Quick Actions — next

The substrate phase. Today the tool *reads* from the DB across every route but barely *writes*. This phase makes every channel where work happens round-trip back into the ops tool, so deliverables / tasks / interactions / hours all have a single source of truth.

**3a. Mutations pass** — wire the existing forms (convert-deal → client, log-hours, log-interaction, task done-toggle, "+ New" forms, invoice status, non-destructive enrichment merge).

**3b. Tracking architecture** — see "Tracking architecture" section below. Lands in the same migration:
- [ ] Add `Artifact` model — first-class deliverables tracking
- [ ] Add `clientId` + `projectId` FKs to `Task` (currently free-text `relatedTo`)
- [ ] Build `writeAudit()` helper — every mutation writes one `AuditLog` row
- [ ] Server-side no-hallucination gate (`[NEEDS INPUT]` markers block commit at the API layer, not just in the UI)

**3c. Three-surface handshake — make Drive feel connected**
- [ ] "Open Drive folder" + "Copy workspace path" buttons on Client detail (uses `driveFolderUrl` + `workspacePath` already on the schema)
- [ ] "Deliverables" tab on Client + Project detail pages (lists `Artifact` rows)
- [ ] Server-side Drive API client — scoped fetch of specific files for Quick Action context (not "read the whole folder")

**3d. First Quick Action — Draft email** (recommended; narrowest scope, ride-along test of the full persistence recipe)
- [ ] Server-action recipe per [../CLAUDE.md](../CLAUDE.md): load skill → pull DB context → call Claude API → stream result → write `Artifact` + (if outreach) `Interaction` + `AuditLog` rows in one transaction
- [ ] First skill repo-versioned at `shiftai-ops/skills/draft-email/SKILL.md`
- [ ] Then clone the recipe for **Draft proposal** (wraps `/scope`), **Build presentation** (wraps `/html-brief`), **Run an action**, **Add contact**, **Re-engage stale**

### Phase 4 — MCP server + `/onboard-client`
- [ ] Build MCP server alongside the web app (same Prisma client, different surface). Contract: [mcp-contract.md](mcp-contract.md).
- [ ] `/onboard-client` skill — fires on `engagement.created` (deal flips to signed); scaffolds the Shared Drive folder + local workspace + per-client `CLAUDE.md`, writes `driveFolderUrl` + `workspacePath` back to the Client record via MCP. Closes the three-surface handshake automatically instead of manually.
- [ ] First scheduled agent: weekly pipeline review (Reporting agent in [agent-flow-design.md](agent-flow-design.md))
- [ ] Wire Claude Code workspaces to the MCP server

### Phase 5 — Pipeline-mutating agents + `/harvest-engagement`
Once Reporting proves the rails, layer in Pipeline Steward (flag stale → draft touch), then Client Onboarding on signed deals. See [agent-flow-design.md](agent-flow-design.md) for the agent set, build order, and rationale. Also `/harvest-engagement` on `engagement.closed` — walks the closed client workspace, proposes sanitized IP lifts into firm templates (formal "skills get smarter" loop).

---

## Tracking architecture

> **Principle:** every channel where work happens — partner typing in the UI, Quick Action running, Claude Code session in a client folder, scheduled agent — must round-trip a row into the ops tool. Nothing happens silently. The ops tool is the system of record; if it isn't tracked here, it didn't happen.

**Four tracking models + the audit ledger underneath:**

| Dimension | Model | What writes to it |
|---|---|---|
| Calls / meetings / emails | [`Interaction`](../prisma/schema.prisma#L159) — `loggedBy` is free-text so agents log too | Manual UI form · Quick Action drafting outreach (tags `AGENT · CLAUDE`) · Gmail/Calendar ingest (V1) |
| Tasks | [`Task`](../prisma/schema.prisma#L362) — needs `clientId` + `projectId` FKs added | Manual UI form · convert-deal (creates kickoff tasks) · AI Quick Action suggestions |
| Hours | [`HoursEntry`](../prisma/schema.prisma#L302) | Manual UI form · Claude Code session-end hook in client workspaces (V1) |
| Deliverables | **`Artifact` — to add** | Quick Action persistence recipe · manual file upload · Drive change watcher (V1) |
| Audit trail | [`AuditLog`](../prisma/schema.prisma#L416) — table exists, writer = `writeAudit()` helper | **Every** mutation, no exceptions |

**The `Artifact` model spec** (lands in the Phase 3b migration):
```
Artifact {
  id, type (proposal | deck | email | sow | invoice | report | other),
  title, driveUrl, fileName,
  createdBy            // free-text — partner name or "AGENT · CLAUDE"
  generatedFromSkill?  // optional — "scope", "html-brief", "draft-email", null for manual
  reviewStatus         // draft | approved | sent | archived
  clientId? | projectId? | dealId?  // one of, FK
  createdAt, updatedAt
}
```

**The persistence recipe — every Quick Action and every agent follows this exact pattern:**
1. Save the artifact to Drive via Drive API
2. Write an `Artifact` row pointing to it
3. If it's an outreach draft (email / re-engage), also write an `Interaction` row with `loggedBy: "AGENT · CLAUDE"`
4. Write one `AuditLog` row via `writeAudit(actor, action, target, changes)`

All three writes in one server-action transaction; partial failures roll back. No agent is exempt.

**External-surface ingest (V1 — not Phase 3):**
- Gmail integration scans recent threads, *proposes* `Interaction` entries for partner approval
- Calendar integration scans meetings, proposes `Interaction` entries
- Drive change watcher proposes `Artifact` entries when new files appear in client folders
- Claude Code session-end hook logs hours + registers files via MCP

All of these write into the same four models. No schema churn for any of them.

---

## Client-file access patterns

How the ops tool reaches files in client Drive folders (and why the per-client isolation rule still holds):

| Pattern | Use for | Access model |
|---|---|---|
| **Click-out buttons** (Phase 3c) | Cheap, ship today — partner clicks "Open Drive folder" from the Client page, jumps to Drive in context | UI uses `driveFolderUrl` field; no server-side file access |
| **Server-side Drive fetch** (Phase 3d Quick Actions) | Quick Actions that need specific files for context (e.g. "Draft proposal" pulls last SOW) | Server-side Drive API call, scoped to the Client FK on the action — pulls only the referenced file, not the folder tree |
| **Embedded file listing** (V1) | "Files" tab on Client/Project detail page — lists folder contents, click → opens in Drive | Server-side Drive API list call, scoped to `driveFolderUrl` |
| **Claude Code in the client folder** (heavy lifts) | Multi-file work: building proposals, decks, build artifacts | Local filesystem read/write via Drive for Desktop sync; isolation rule = launch Claude at the *client folder*, never at the drive root |

**Isolation rule, refined:** the per-client boundary is "one client at a time, not no client access." When you're working on Acme — whether in Claude Code or via an Acme Quick Action — Claude has full read/write on Acme. The boundary prevents *cross-client* bleed (can't see Beta while working on Acme), not Claude-to-client access. See [../../shiftai-firm/planning/file-system-platform-decision.md](../../shiftai-firm/planning/file-system-platform-decision.md) for the architecture.

---

## Architecture (target end-state)

```
┌──────────────────────────────────────────┐
│  OPS TOOL                                │
│  ┌────────────────┐    ┌──────────────┐  │
│  │  Web UI        │    │  MCP Server  │  │
│  │  (Next.js)     │    │  (same DB)   │  │
│  └────────┬───────┘    └──────┬───────┘  │
│           │                   │          │
│           └─────────┬─────────┘          │
│                     ▼                    │
│            ┌────────────────┐            │
│            │  Postgres      │            │
│            │  (Supabase)    │            │
│            │  - clients     │            │
│            │  - projects    │            │
│            │  - contacts    │            │
│            │  - deals       │            │
│            │  - hours       │            │
│            │  - invoices    │            │
│            │  - artifacts   │            │
│            │  - audit_log   │            │
│            └────────────────┘            │
└──────────────────────────────────────────┘
```

Web UI and MCP server share the same Postgres. Two interfaces over one state — humans use the web UI, Claude Code and scheduled agents use MCP, both write through the same Prisma client.

---

## Open questions

- **Tenancy.** Single-tenant (Shift AI only) forever, or design for multi-tenant in case the tool becomes acquirer IP that's sold/licensed? Single-tenant for v1; revisit when first acquisition conversation starts.
- **Client portal.** Should clients ever see project status / deliverable acceptance / invoices in the tool? Out of scope; flag for later.
- **Document storage.** Pointers to Drive for now (cheap, simple). Move to file blobs in DB only if a real workflow demands it.
- **MCP transport / hosting.** stdio (local-only, simple) vs HTTP (remote-accessible, needed if scheduled agents run off-machine). See [mcp-contract.md](mcp-contract.md) open questions.
- **Stripe / Calendar / Slack integrations.** Pick zero for MVP; add one at a time based on partner pull.
