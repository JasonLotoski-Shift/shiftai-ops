# Agent Flow Design — Ops Tool

> **Status:** Working draft (2026-05-20). Exploratory, not partner-ratified.
> **Parent:** [ROADMAP.md](ROADMAP.md) — Phase 4+ (MCP server + agents) is where this lands.
> **Companions:** [../../shiftai-firm/planning/launch-roadmap-60-day.md](../../shiftai-firm/planning/launch-roadmap-60-day.md) Workstream 6, [../../shiftai-firm/.claude/skills/scope/SKILL.md](../../shiftai-firm/.claude/skills/scope/SKILL.md).

---

## Goal

Agents that manage the pipeline, think about what needs doing, and execute it — from client acquisition through proposal building. **Constraint:** 8–10 agents total.

---

## What changed the design (read first)

Three facts about the existing substrate reframe the original 8-agent list:

1. **The web app already storyboards these agents.** Seed data ([../lib/data/seed.ts](../lib/data/seed.ts)) treats `AGENT · CLAUDE` as a logged actor — flagging stale leads (`a-6`), drafting the weekly firm brief (`tu-1`), drafting work-order specs. The deal screen already exposes "Draft SOW →" and "Draft re-engagement email" ([../app/(app)/pipeline/[id]/page.tsx](../app/(app)/pipeline/[id]/page.tsx)); the board has a "Signed → Convert" column "waiting on `/new-client` trigger" ([../app/(app)/pipeline/page.tsx](../app/(app)/pipeline/page.tsx)). The UI already promises these flows.

2. **One agent already exists.** "Proposal Builder" is the [`/scope` skill](../../shiftai-firm/.claude/skills/scope/SKILL.md) — full intake, pricing math, brand spec, HTML output. Wrap it, don't rebuild it.

3. **Most agents have a dependency that isn't built yet.** The MCP server that lets agents read/write deal/client/project records is **Phase 4** in [ROADMAP.md](ROADMAP.md). Any agent that manages *structured pipeline state* is gated on it. Agents that run on what's live today (Gmail / Drive / Calendar MCP, web search, workspace files, `/scope`) are not.

That dependency, plus the roadmap's own discipline rule ("one workflow, one week to v1 — don't let it become a 6-month rabbit hole"), drives the priority.

---

## Consolidation: 8 → 6

Building 8 pipeline-management agents while the firm has ~1 real prospect is the rabbit hole the roadmap warns against. Three merges:

| Original | Verdict | Reason |
|---|---|---|
| Proposal Builder | **Already exists** — wrap `/scope` | The skill does scope + pricing + HTML today |
| Follow-Up Agent | **Merge into Pipeline Manager** → "Pipeline Steward" | Detecting a stale deal and drafting the re-engage touch is one flow (already one card in the UI) |
| Reporting Agent | **Keep** — it's the safe first writer | Read-only firm digest; the `tu-1` brief is already in the seed |
| Task Planner | **Fold into Reporting v2 / defer** | Open-ended "figure out what needs doing" is the highest-hallucination-risk, lowest-trust agent. Its output (the `tasks[]` list) is a section of the weekly brief, not a standalone agent |

Final set of **6**: Reporting, Pipeline Steward, Research, Lead Scout, Proposal Builder (wrapper), Client Onboarding — under the 8–10 ceiling, with room.

---

## Build order

Sequenced by **what's unblocked today × what a pre-revenue firm actually needs** — land prospects and be sharp in the room, not manage a pipeline that doesn't exist yet.

### Phase A — ship now, on existing rails (no MCP server needed)

1. **Research Agent** — *build first.* Runs today on web + Drive, directly sharpens discovery calls and proposals, is the strongest 5-minute demo ("paste a prospect → full dossier"), and produces the enrichment data every later agent consumes.
2. **Lead Scout** — same research engine in "find" mode instead of "enrich" mode. Fills the empty pipeline.
3. **Proposal Builder** — already shipped as `/scope`; the only remaining work is the auto-trigger wrapper, which waits for MCP. Capability available today, automation in Phase B.

### Phase B — after the ops-tool MCP server lands (ROADMAP Phase 4)

4. **Reporting Agent** — read-only; the first agent that *writes to the tool*. Safe way to build partner trust in agents touching the system of record. (This is the roadmap's named "first scheduled agent: weekly pipeline review.")
5. **Pipeline Steward** — first agent that takes *action* on records (flag stale → draft touch). Higher trust bar; comes after Reporting proves the rails.
6. **Client Onboarding** — only matters once deals are closing; lowest near-term value.

---

## Agent specifications

Grounded in the actual data model (`Deal.stage`, `Deal.lastTouchAt`, the `Contact` enrichment fields, etc. — see [../prisma/schema.prisma](../prisma/schema.prisma)). Every agent that produces outreach or records **drafts, never sends/commits without a human** — per the firm-wide no-hallucination rule.

### Persistence rule — every agent round-trips into the ops tool

Every agent below follows the same persistence recipe as Quick Actions (canonical version in [../CLAUDE.md](../CLAUDE.md) "Wire a Quick Action end-to-end"):
1. Save the artifact (if any) to Drive via Drive API
2. Write an `Artifact` row scoped to the relevant Client / Project / Deal (`createdBy: "AGENT · CLAUDE"`, `generatedFromSkill: "<agent-name>"`, `reviewStatus: "draft"`)
3. If the output is outreach (email / re-engage), also write an `Interaction` row tagged `loggedBy: "AGENT · CLAUDE"`
4. Write one `AuditLog` row via `writeAudit(actor, action, target, changes)`

No agent is exempt. The round-trip is the design — without it, agents accumulate work that never appears in the firm's system of record. Full architecture: [ROADMAP.md](ROADMAP.md) "Tracking architecture."

### 1. Research Agent — *build first*
- **Trigger:** new contact created · `daysSince(enrichedAt) > 90` · manual ("research X before my call") · weekly industry sweep
- **Inputs:** contact name + company · the 4 beachhead verticals · web search · Drive · prior interactions
- **Outputs:** contact enrichment (`persona`, `communicationStyle`, `keyFacts`, `background`, `networkAffiliations`, `enrichedAt`) + `news[]` items each with a `why` line
- **Needs:** live today (web + Drive). Pairs with the existing `meeting-prep-jason` skill.

### 2. Lead Scout
- **Trigger:** scheduled weekly · "find prospects in [vertical]" · pipeline volume drops below threshold
- **Inputs:** [../../shiftai-firm/context/icp.md](../../shiftai-firm/context/icp.md) · partner networks · web/news · existing deals (dedupe)
- **Outputs:** new `Deal` at `stage: "lead"` + `Contact` with `source`, each with a one-line "why this fits ICP"
- **Needs:** live today (write to file pre-MCP). **Never auto-advances past `lead`** — a human qualifies.

### 3. Proposal Builder — *wrapper on `/scope`*
- **Trigger:** `deal.stage → "proposal"` · "Draft SOW" button · manual `/scope`
- **Inputs:** deal record · all `interactions` for the contact · [../../shiftai-firm/planning/firm-economics.md](../../shiftai-firm/planning/firm-economics.md) · brand guide
- **Outputs:** draft HTML proposal to `deliverables/`, logged as `AGENT · CLAUDE`; **partner reviews before send** (already the skill's rule)
- **Needs:** capability live today; auto-trigger waits for MCP.

### 4. Reporting Agent — *first safe writer*
- **Trigger:** scheduled weekly (pre-partner-sync)
- **Inputs:** `deals`, `projects`, `invoices`, `milestones`, `activities` (read-only)
- **Outputs:** the `tu-1`-style weekly firm brief — active builds, at-risk flags, pipeline movement, invoices clearing. No record edits.
- **Needs:** MCP server (read paths).

### 5. Pipeline Steward — *Manager + Follow-Up merged*
- **Trigger:** daily — `daysSince(lastTouchAt) > 30 && stage != "signed"` (this exact rule is already computed in the pipeline UI) · `closeTargetDate` approaching · deal stalled in-stage N days
- **Inputs:** deal · contact + `communicationStyle` · interaction history
- **Outputs:** stale flag + a *drafted* re-engagement email matched to the contact's style + a next-action task. **Drafts, never sends.**
- **Needs:** MCP server (read + write).

### 6. Client Onboarding
- **Trigger:** `deal.stage → "signed"` (the `/new-client` trigger already wired into the board)
- **Inputs:** won deal · contact · client metadata
- **Outputs:** new `Client` + `Project` records · Drive folder + `workspacePath` · kickoff checklist · intro-email draft
- **Needs:** MCP server + Drive.

---

## Open decision

Recommended first build is the **Research Agent**. The defensible alternative is **Reporting first** — if the real goal is "prove agents can safely touch the ops tool" over "generate pipeline." But Reporting is blocked until the MCP server exists and Research is not; at pre-revenue stage, hold the line on Research.

---

## Next step

Define the full one-week build spec for the Research Agent: exact tool calls, the dossier output schema, and how it writes back (file-based now, MCP later).
