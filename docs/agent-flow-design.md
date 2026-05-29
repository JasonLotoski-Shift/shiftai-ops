# Agent Flow Design — Ops Tool

> **Status:** Phase 5 build queue. Agents land *after* the MCP server (Phase 4).
> **Parent:** [ROADMAP.md](ROADMAP.md). **Persistence rule:** [../CLAUDE.md](../CLAUDE.md) "Wire a Quick Action end-to-end".

---

## The discipline (read first)

**Build one agent at a time.** Each agent ships complete — trigger, real tool calls, output schema, and the persistence round-trip — before the next one starts. No batch builds, no speccing 6 agents up front and wiring them in parallel. A pre-revenue firm with a handful of prospects does not need a fleet; it needs one agent that works and earns trust, then the next.

**Every agent round-trips into the ops tool** — same recipe as Quick Actions: write an `Artifact` (`createdBy: "AGENT · CLAUDE"`, `generatedFromSkill`, `reviewStatus: "draft"`), an `Interaction` if the output is outreach, and one `AuditLog` row. No agent is exempt — without the round-trip, agents accumulate work the firm's system of record never sees.

**Every agent drafts, never sends or commits without a human** (firm-wide no-hallucination rule). Ceiling: 8–10 agents total, ever.

---

## Build queue

Sequenced by *what's unblocked × what a pre-revenue firm actually needs* — land prospects and be sharp in the room first; manage pipeline state later.

| # | Agent | One-liner | Needs | Status |
|---|---|---|---|---|
| 1 | **Research** | Paste a prospect → full enrichment dossier + news, each item with a "why" | Web + Drive (live today) | **next — spec below** |
| 2 | **Lead Scout** | Same research engine in "find" mode — surfaces new prospects against the ICP | Web + Drive | queued |
| 3 | **Proposal Builder** | Wrapper on the existing `/scope` skill; auto-triggers on `deal.stage → proposal` | `/scope` (live); auto-trigger needs MCP | capability live, automation queued |
| 4 | **Reporting** | Read-only weekly firm brief (active builds, at-risk flags, pipeline movement). First agent that *writes to the tool* — the safe way to build trust | MCP (read) | after MCP |
| 5 | **Pipeline Steward** | Flags stale deals → drafts a re-engagement email matched to contact style + a next-action task. First agent that *acts on records* | MCP (read + write) | after Reporting proves the rails |
| 6 | **Client Onboarding** | On `deal.stage → signed`: new Client + Project + Drive folder + kickoff checklist + intro-email draft | MCP + Drive | when deals start closing |

Two decisions already settled (don't relitigate): Proposal Builder is the `/scope` skill wrapped, not a rebuild; Follow-Up folded into Pipeline Steward (one flow); open-ended "Task Planner" deferred — it's the highest-hallucination-risk agent and its output is a section of the Reporting brief, not a standalone agent.

---

## Next agent — Research (full spec)

The only agent specced in detail. The next one gets specced when this one ships.

- **Trigger:** new contact created · `daysSince(enrichedAt) > 90` · manual ("research X before my call") · weekly industry sweep
- **Inputs:** contact name + company · the 4 beachhead verticals · web search · Drive · prior interactions
- **Outputs:** contact enrichment (`persona`, `communicationStyle`, `keyFacts`, `background`, `networkAffiliations`, `enrichedAt`) + `news[]` items each with a `why` line. **Proposed, non-destructive** — additions merge, existing facts never overwritten.
- **Writes back:** file-based now (pre-MCP), via MCP later. Plus the standard Artifact + AuditLog round-trip.
- **Needs:** live today (web + Drive). Pairs with the `meeting-prep-jason` skill.
- **Why first:** unblocked today, directly sharpens discovery calls and proposals, strongest 5-minute demo, and produces the enrichment every later agent consumes.

**Next step:** write the one-week build spec — exact tool calls, dossier output schema, file-based write-back path.

---

## When MCP lands

Agents 4–6 are gated on the MCP server (ROADMAP Phase 4) for structured pipeline read/write. Agents 1–3 run on what's live today (web search, Drive, `/scope`). The defensible alternative to "Research first" is "Reporting first" — if the goal is *prove agents can safely touch the tool* over *generate pipeline*. But Reporting is blocked until MCP exists and Research is not; at pre-revenue stage, hold the line on Research.
