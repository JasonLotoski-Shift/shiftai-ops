# Overnight build — 2026-05-29

> Autonomous run against the remaining roadmap. Everything below is **committed, type-checked, production-built, and pushed to `main`** (Vercel auto-deploys). Five commits on top of `b11b615`. DB migrations were applied to the shared Supabase project, so prod schema is already current. No production secrets were touched.

## What shipped (in order)

| Commit | Phase | What |
|---|---|---|
| `d99972d` | A4 | **Add contact** (create form + `?qa=add`), **AI enrich** rebuilt for real (log-grounded, append-only, replaces the fabricated-facts mock), **Run an action** → contact enrich |
| `8484565` | B5 | **Agents tab** — `AgentPlan` CRUD + **live skills viewer** (renders every `SKILL.md` + the firm brain off disk). Sidebar Agents enabled |
| `70706ab` | B4 | **Messaging** — channels + DMs + 4s polling + interactive task cards. `createTask` hand-off posts a task card into the DM. Sidebar Messages |
| `f74dc28` | 4b | **Meeting ingest** — `IngestProposal` review queue + `ingest-meeting` skill + entity matching (paste path). Approve → full persistence recipe |
| `a93e28c` | 4/5 | **MCP server** (functional stdio, `npm run mcp`) + `/onboard-client` + `/harvest-engagement` skills + **Fireflies webhook scaffold** (guarded) |

**Tracks A and B are complete** (B6 data-wipe stays on hold per your note). Phase 4 and 4b have working first builds.

## Migrations applied to the shared Supabase DB (already live)

`agent_plan` · `messaging` (Channel/ChannelMember/Message) · `ingest_proposal`. All additive — no drops, no data loss. Local `.env` Direct URL and Vercel pooler point at the same project, so prod already has the tables; Vercel only runs `prisma generate`, which it does on every build. New dependency added: `@modelcontextprotocol/sdk`.

## Decisions I made (so I didn't stall on your call)

- **AI enrich is log-only.** It infers from the contact's logged interactions, proposes append-only additions, and you approve which to keep. It never overwrites a set field; divergences come back as "conflicts" to resolve by hand.
- **Web search enrich = honest "not wired."** The old modal fabricated board memberships and titles — a no-hallucination-rule violation. I replaced it with a truthful notice rather than inventing facts. Real web search is a follow-up (needs server-side web access).
- **Chat is its own ledger.** Messages persist to the `Message` table but don't spam `AuditLog`/`Activity` per line (the work-event ledger stays clean).
- **MCP transport = stdio** for the local Claude-Code case (the contract's open question). HTTP is the upgrade path for off-machine agents.
- **MCP omits the hours tools** from the contract — `HoursEntry` was removed.
- **Entity matching refuses to guess** — >1 known participant or no match lands the proposal "unassigned" for you to attach. Unassigned beats wrong.

## Your catch-up list (manual / infra — I can't do these autonomously)

1. **Verify the deploy.** Check the latest Vercel build went green, then click through the new nav: **Messages**, **Agents**, **Meeting ingest**, plus **Add contact** and **AI enrich** on a contact. (Generative actions need `ANTHROPIC_API_KEY` — already set, since the other Quick Actions work.)
2. **MCP server → Claude Code.** Register it in a client workspace's `.claude/settings.json` (snippet in [`../mcp/README.md`](../mcp/README.md)), then try a read tool (e.g. `list_pipeline`) and a write (e.g. `create_task`).
3. **Fireflies webhook.** Set `FIREFLIES_API_KEY` + `FIREFLIES_WEBHOOK_SECRET` in Vercel, register the webhook URL (`/api/ingest/fireflies?secret=…`) in Fireflies, and test against one real meeting. It's guarded (returns 501) until configured, and **untested end-to-end** — validate the GraphQL field names against the live API before relying on it.
4. **Scheduled agents (Phase 4/5).** The weekly pipeline review and other agents need a scheduler/host on top of the MCP rails — not built. `/onboard-client` and `/harvest-engagement` skills exist but aren't auto-triggered yet (run them from Claude Code).
5. **Decide MCP auth/HTTP** before any *remote* agent (open question in the contract).
6. **B6 data wipe** — still on hold; run deliberately at go-live.

## How to re-verify locally

```bash
npx tsc --noEmit        # clean
npm run build           # clean (one pre-existing "Big Shoulders" font warning, not an error)
npm run mcp             # MCP server boots on stdio (needs .env)
```

## Not done / out of scope tonight

Real web-search enrichment · the scheduled-agent runtime · Fireflies end-to-end test · backlog items (Stripe, Gmail/Calendar ingest, files browser, global search). These are infra- or decision-blocked, not code-blocked.
