# Ops-tool MCP server

The "door for Claudes outside the app" (ROADMAP Phase 4). Same Prisma client / same Postgres as the web UI — a second surface over one source of truth. Claude Code workspaces and scheduled agents call its tools to read and write firm state. Full interface in [../docs/mcp-contract.md](../docs/mcp-contract.md).

## Run it

```bash
npm run mcp        # tsx mcp/server.ts — stdio transport
```

Needs `DATABASE_URL` in the environment (the same `.env` the web app uses — Direct connection locally). The server speaks JSON-RPC over **stdio**, so it logs to stderr and keeps stdout clean.

## Register in a Claude Code workspace

Add to the workspace's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "shiftai-ops": {
      "command": "npm",
      "args": ["run", "--silent", "mcp"],
      "cwd": "C:\\Users\\jason\\Desktop\\Shift\\shiftai-ops"
    }
  }
}
```

(Or point `command` at `tsx` with the absolute path to `mcp/server.ts`.)

## Tools

**Read:** `get_client`, `get_project`, `list_pipeline`, `list_active_engagements`, `list_artifacts`, `get_contact`, `list_contacts`.

**Write (each writes an `AuditLog` row + a feed `Activity`, tagged `AGENT · MCP`):** `create_artifact`, `update_project_status`, `create_task`, `log_interaction`.

## Notes / not-yet

- **Transport** is stdio (local Claude Code). HTTP transport is the upgrade path for off-machine scheduled agents — not built (open question in the contract).
- **Auth** is none beyond filesystem/env access (local trust model). A service token / SSO inheritance is needed before remote hosting.
- `log_hours` / `get_team_hours` from the contract are intentionally **omitted** — Hours was removed from the tool (2026-05-28).
- Writes follow the same persistence recipe as Quick Actions; no tool introduces new schema.
