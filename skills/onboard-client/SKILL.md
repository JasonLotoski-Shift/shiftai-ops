# Skill — Onboard client

Scaffold a new client's three surfaces the moment a deal is signed, then write the handles back to the ops tool. Fires on `engagement.created` (a deal converting to a Client). Run from Claude Code with the ops-tool MCP server registered.

The firm's voice, identity, and hard rules are in the firm context above. Apply them.

## When this runs

A deal just became a Client. The Client row already has `company`, `industry`, `partnerLead`, `primaryContact`, and contract terms (convert-deal wrote them). What's missing is the **workspace**: a Drive folder, a local folder, and a per-client `CLAUDE.md`. This skill closes the three-surface handshake (web UI ↔ Drive ↔ local Claude Code) so the next person to touch the client lands in a ready workspace.

## Inputs you'll get

- The `clientId` (and, via `get_client(clientId)` over MCP, the full record).

## What to do

1. **Read the client.** Call `get_client(clientId)`. Confirm `company`, `industry`, partner lead, primary contact, contract value/terms. If `driveFolderUrl` / `workspacePath` are already set, **stop** — this client is already onboarded (idempotent; never clobber an existing workspace).
2. **Create the Drive folder** under the "Shift AI - Clients" Shared Drive, named for the company. Seed the standard subfolders (`01-Discovery`, `02-Proposals-SOW`, `03-Build`, `04-Deliverables`, `05-Admin`).
3. **Create the local workspace folder** (synced via Drive for Desktop) at the firm's client-workspace root, named for the company. Per-client isolation — never nest a client inside another client's folder.
4. **Write a per-client `CLAUDE.md`** into the workspace root from the firm template: who the client is (from the record), the engagement scope, the partner lead, the isolation rule ("you are working on <Company> only — never reach into another client's folder"), and a pointer back to the ops tool record.
5. **Draft an engagement charter** (`engagementCharterMd`) — a short doc stating the engagement's goal, scope boundaries, and success measures, grounded in the signed deal's notes. Mark anything not in the record as `[NEEDS INPUT]`; never invent scope.
6. **Write the handles back** via MCP: set the Client's `driveFolderUrl` and `workspacePath`, and register the charter as an `Artifact` (`create_artifact`, `generatedFromSkill: "onboard-client"`, scope `clientId`). The `create_artifact` write auto-logs an `AuditLog` row.

## Hard rules

- **Idempotent.** If the workspace handles already exist on the record, do nothing. Re-running must never duplicate folders or overwrite a `CLAUDE.md`.
- **Per-client isolation is absolute.** One client per workspace; the workspace `CLAUDE.md` states it explicitly.
- **Never invent scope, dates, or numbers.** Pull from the deal/client record; mark gaps `[NEEDS INPUT]` for the partner.
- **Propose, don't presume.** The charter is a draft (`reviewStatus: "draft"`); the partner approves it.
- Everything you write through MCP round-trips into the ledger — that's the design, not overhead.
