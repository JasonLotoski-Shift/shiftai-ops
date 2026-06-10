# Agent & Skills Sweep - Shift AI Partners

> **What this is.** The living registry of every skill and agent in the workspace. One place to learn, for each one: **what it does**, **where it runs**, **how it runs**, what it depends on, and its audit status.
>
> **Built 2026-06-04.** Descriptive records are complete for all in-scope items. Formal audit scores are pending - they get filled by the `skill-audit` skill once the baseline gaps (partner personas, ICP) are closed. See §1.
>
> **Scope of this sweep:** the 28 ops-runtime skills (`shiftai-ops/skills/`), the firm-level `scope` skill (`shiftai-firm/.claude/skills/`), the one client-facing personal skill (`html-brief-jason`), and the 5 planned/partial agents. Internal personal tools (`log`, `code-plan-jason`, `decision-memo-jason`, `doc-review-jason`, `meeting-prep-jason`, `new-workspace-jason`) are out of scope by decision.
>
> **Maintained by `~/.claude/skills/skill-audit/`.** New skills enter via `docs/skill-authoring-pipeline.md` (born-audited). Propose-never-auto-write: every change to this doc is a diff a partner approves.

---

## 0. How to read this doc

**The three planes** (where a thing runs):
- **ops-runtime** - lives in `shiftai-ops/skills/<name>/SKILL.md`. At generate-time the ops tool ([lib/ai.ts](../lib/ai.ts) `buildSystemBlocks`) composes the system prompt as exactly two cached blocks: `skills/_firm/context.md` (the firm brain) + the skill's own `SKILL.md`. Runs as a server-side "Quick Action" in the Next.js ops tool, triggered from a page/button or (for the MCP ones) an event. These skills deliberately don't restate voice - they defer to the firm brain.
- **firm-cc** / **cc** - a Claude Code skill (with YAML frontmatter), dispatched in chat by its `description`. `firm-cc` lives in `shiftai-firm/.claude/skills/`; `cc` is a personal skill in `~/.claude/skills/`. These carry their own voice/brand rules inline (no `_firm/context.md` at runtime).

**Record fields:** `goal` (one sentence) · `audience` · `produces` · `where it works` (the surface/trigger) · `how it works` (the flow) · `inputs` · `dependencies` · `baseline refs` (which yardsticks apply) · `audit` (status · date · score) · `notes`.

**Audit status legend:** `not-audited` · `pass` · `pass-with-notes` · `fail` · `stale` (the baseline moved and the skill didn't follow) · `blocked` (a yardstick it's measured against is incomplete). **Score** is the six-axis rubric `T B A G F H` (Tone · Brand · Audience · Goal · Format · no-Hallucination), each 1–5, `-` if not yet audited. Rubric defined in `~/.claude/skills/skill-audit/SKILL.md`.

---

## 1. Baseline state - the yardsticks the audit measures against

| Yardstick | Source of truth | Status | What depends on it |
|---|---|---|---|
| **Voice / tone** | `shiftai-firm/brand/brand-guide.md` §Voice + `shiftai-ops/skills/_firm/context.md` §Voice | ✅ Complete | Every skill (axis T) |
| **Brand** | `brand/brand-guide.md` (Edition 06, 2026-05-30) | ✅ Complete | HTML skills (axis B): `scope-firm`, `html-prototype`, `proposal-deck` |
| **Audience / ICP** | `shiftai-firm/context/icp.md` | 🟡 Drafted 2026-06-04, has `[NEEDS INPUT]` (disqualifiers grounded; watering holes + some buy signals need Jason) | Audience axis (A) of lead/targeting + client-facing skills |
| **Partner personas** | `shiftai-firm/partners/personas.md` + `_firm/context.md` roster block | 🟡 Drafted 2026-06-04, has `[NEEDS INPUT]` (voice grounded; firm role + signing authority need Jason) | Persona axis of `draft-email`, `discovery-prep`, `cold-outreach`, anything partner-signed |
| **Business Model v2 vocab** | `shiftai-firm/planning/business-model-v2.md` (build + subscription + buy-out; Discovery→Build→**Operate**) | 🟡 Defined, **propagation pending 3-of-3 vote** (`docs/business-model-v2-plan.md` Part A) | Every skill using "Run" or old engagement vocab - flagged as *pending*, not *fail* |

**The audit can't run a meaningful Audience (A) or Persona pass until the two 🟡 baselines are filled.** That's the gate: Jason fills the `[NEEDS INPUT]` markers, then the audit runs in one pass (Phase 3).

---

## 2. Coverage map

37 items: 30 ops-runtime skills · 2 cc/firm-cc skills · 5 agents. **Audited (rubric v1): 18 pass, 14 pass-with-notes, 0 fail/stale/blocked.** Status column: P = pass, PN = pass-with-notes; agents show readiness. Full scores + open fixes in §2a; per-record detail in §3-5.

| # | Name | Plane | Type | What it does (short) | Audit |
|---|---|---|---|---|---|
| | **- Proposals & client docs -** | | | | |
| 1 | scope-ops | ops | md | First-draft proposal from a deal | PN |
| 2 | discussion-doc | ops | md | REMOVED 2026-06-09 — overlapped with discovery-prep (internal meeting prep); skill folder + Quick Action deleted | — |
| 3 | client-survey | ops | md | Tailored client/prospect survey | P |
| 4 | proposal-deck | ops | html | Slide-style HTML proposal deck | PN |
| 31 | discovery-report | ops | html | Client-facing Discovery build-plan deck (light mode + client brand) | P |
| 32 | sow | ops | gdoc | Statement of Work contract draft (counsel-flagged) | P |
| | **- Prototype workflow (3 steps) -** | | | | |
| 5 | prototype-brief | ops | md | Step 1: scope what to prototype | P |
| 6 | prototype-spec | ops | md | Step 2: build-ready blueprint | PN |
| 7 | html-prototype | ops | html | Step 3: the interactive HTML demo | PN |
| | **- Outreach & meetings -** | | | | |
| 8 | draft-email | ops | text | Outreach/follow-up email draft | P |
| 9 | book-meeting | ops | md | Propose/confirm a meeting | P |
| 10 | cold-outreach | ops | json | Cold intro email to a found lead | PN |
| 11 | discovery-prep | ops | md | Internal prep brief for a discovery call | P |
| | **- Ingest & extraction -** | | | | |
| 12 | ingest | ops | json | Master multi-record ingest | P |
| 13 | ingest-meeting | ops | json | Meeting transcript → records | P |
| 14 | ingest-project | ops | json | Project doc/notes → records | P |
| 15 | ingest-scope-pricing | ops | json | Scope doc → pricing breakdown only | P |
| 16 | structure-deal-notes | ops | json | Tidy a raw deal note + lift facts | P |
| | **- Contact / company enrichment -** | | | | |
| 17 | enrich-contact | ops | json | Enrich a contact from the log | P |
| 18 | enrich-contact-web | ops | json | Enrich a contact via web search | PN |
| 19 | enrich-company-web | ops | json | Enrich a company via web search | PN |
| | **- Lead gen / targeting -** | | | | |
| 20 | segment-drafter | ops | json | Brief → structured ICP segment | P |
| 21 | segment-optimizer | ops | json | Run results → segment refinements | PN |
| 22 | lead-discovery-apollo | ops | reference | Segment → Apollo filters (code spec) | PN |
| 23 | lead-discovery-firecrawl | ops | text | Segment → Firecrawl query + domains | PN |
| 24 | lead-rating | ops | json | Score a candidate 1–10 vs segment | PN |
| 25 | contact-scan | ops | json | Batch-score imported contacts | P |
| 26 | import-column-map | ops | json | Map CSV headers to fields | P |
| | **- Workspace automation (MCP) -** | | | | |
| 27 | onboard-client | ops | mcp-writes | Scaffold a client workspace on close | P |
| 28 | harvest-engagement | ops | md | Lift reusable IP when an engagement closes | PN |
| | **- Claude Code skills -** | | | | |
| 29 | scope (firm) | firm-cc | html | Branded client HTML proposal + pricing | PN |
| 30 | html-brief-jason | cc | html | General editorial HTML brief (multi-brand) | PN |
| | **- Agents -** | | | | |
| A1 | Lead Scout | agent | partial | Discover + enrich + rate prospect leads | partial |
| A2 | Harvest Engagement | agent | skill-exists, trigger-missing | IP lift on engagement.closed | blocked |
| A3 | Onboard Client | agent | skill-exists, trigger-missing | Workspace scaffold on engagement.created | blocked |
| A4 | Pipeline Hygiene | agent | sketched | Weekly stale-lead review | sketched |
| A5 | Status Sync | agent | sketched | Daily project-status sync from workspace | sketched |

---

## 2a. Audit detail (scores & open fixes, 2026-06-05)

Scores: **T**one · **B**rand · **A**udience · **G**oal · **F**ormat · no-**H**allucination, each 1-5; `n` = n/a. **✓** = a fix from this sweep already applied (2026-06-05). Status: P / PN. Every skill scored H = 5 (the no-hallucination bar); 0 fails.

| Skill | T·B·A·G·F·H | Status | Note / open fix |
|---|---|---|---|
| scope-ops | 5·n·5·5·5·5 | PN | "Run" vocab + IP-ownership framing pending the 3-of-3 vote (flag, not fail) |
| discussion-doc | — | REMOVED | Deleted 2026-06-09 — duplicated discovery-prep's internal-meeting-prep role |
| client-survey | 5·n·5·5·5·5 | P | clean |
| proposal-deck | 5·5·5·5·5·5 | PN | ✓ Edition-06 brand block added (was B 3/5: "serif display" + no tokens) |
| discovery-report | 5·5·5·5·5·5 | P | NEW 2026-06-05: light mode + fuller client-brand match; born-audited via the pipeline |
| sow | 5·n·5·5·5·5 | P | NEW 2026-06-06: contract skill (HTML to Google Doc); v2 IP model + escrow, all counsel-flagged; born-audited |
| prototype-brief | 5·n·5·5·5·5 | P | clean |
| prototype-spec | 5·n·4·5·5·5 | PN | clean (brand lives in the downstream HTML step) |
| html-prototype | 5·4·5·5·5·5 | PN | ✓ Edition-06 brand-floor backstop added |
| draft-email | 5·n·5·5·5·5 | P | clean (zero findings) |
| book-meeting | 5·n·4·5·5·5 | P | clean |
| cold-outreach | 5·n·4·5·5·5 | PN | ✓ "a small senior firm" → "a senior firm" |
| discovery-prep | 5·n·5·5·5·5 | P | clean (zero findings) |
| ingest | 5·n·5·5·5·5 | P | clean |
| ingest-meeting | 5·n·4·5·5·5 | P | clean |
| ingest-project | 5·n·4·5·5·5 | P | clean |
| ingest-scope-pricing | 5·n·4·5·5·5 | P | clean (consultantHint example is a string nit) |
| structure-deal-notes | 5·n·4·5·5·5 | P | clean |
| enrich-contact | 5·n·4·5·5·5 | P | clean |
| enrich-contact-web | 5·n·4·5·5·5 | PN | clean (audience implicit) |
| enrich-company-web | 5·n·4·5·5·5 | PN | clean (audience implicit) |
| segment-drafter | 5·n·5·5·5·5 | P | clean (hard-codes the $25-200M ICP) |
| segment-optimizer | 5·n·5·5·5·5 | PN | cosmetic (doc-fence note) |
| lead-discovery-apollo | n·n·5·5·n·n | PN | ✓ "locked/null" → "withheld/null"; code-spec, T/B/F/H n/a |
| lead-discovery-firecrawl | 5·n·4·5·5·5 | PN | ✓ output contract added (was F 3/5: undeclared snippet shape) |
| lead-rating | 5·n·5·5·5·5 | PN | minor: example JSON shown inside a fence the contract forbids |
| contact-scan | 5·n·5·5·5·5 | P | clean (zero findings) |
| import-column-map | 5·n·4·5·5·5 | P | clean |
| onboard-client | 5·n·5·5·5·5 | P | low: hardcoded Drive/folder names not pinned to a config doc |
| harvest-engagement | 5·n·5·5·5·5 | PN | ✓ final-summary output contract added (was F 4/5) |
| scope (firm) | 4·5·5·5·5·5 | PN | ✓ "locked"→"set", "Shift AI Consulting"→"Shift AI Partners", save path → `shiftai-firm/deliverables/` (confirm). "Run" pending vote. Brand is on Edition 06. |
| html-brief-jason | 5·n·n·5·5·5 | PN | house-style only by design; B/A n/a (multi-brand personal tool) |

**Agents (reviewed, not 6-axis scored):** A1 Lead Scout — strongest design; live discovery gated on Firecrawl + Apollo keys; 240s run may exceed Vercel free-tier. A2 Harvest / A3 Onboard — skills clean, blocked on the unbuilt event bridge (Phase-4 infra); A2 needs an `ipHarvestStatus` re-run guard, A3 needs the `engagementCharterMd` field. A4 Pipeline Hygiene / A5 Status Sync — design-first (no SKILL.md yet); A5's open unknown is the workspace-side status format (couple to A3's scaffold).

---

## 3. Ops-runtime skills

> Live audit scores for every record are in §2a (swept 2026-06-05). The inline `Audit:` lines below are descriptive-era placeholders.

### Proposals & client docs

#### 1. scope-ops · ops-runtime · markdown-draft
- **Goal:** Turn a pipeline opportunity into a structured first-draft proposal a partner can refine before sending.
- **Audience:** Partner (internal - edited before it reaches a client). **Produces:** proposal Markdown, fixed 8-section spine (situation → what we'll build → Discovery/Build/Run → success → IP ownership → investment → next step).
- **Where it works:** ops Quick Action on a Deal page. **How it works:** partner gives an intake (focus, any known fee/timeline, preparer); the tool supplies a deal context block; returns proposal Markdown only, saved as a draft Artifact.
- **Inputs:** deal context (company, industry, stage, value, close, notes, interactions) + intake. **Dependencies:** `_firm/context.md`, Prisma Deal/Contact, server-side `[NEEDS INPUT]` save gate.
- **Baseline refs:** voice · brand · audience · bmv2-vocab. **Audit:** not-audited · - · -.
- **Notes:** Uses old Discovery/Build/**Run** vocab - intentionally pending the 3-of-3 vote. Two scope skills exist; this is the lighter ops-runtime one (the firm-cc `scope` is the full branded HTML version).

#### 2. discussion-doc · REMOVED 2026-06-09
- Deleted: it duplicated `discovery-prep`'s role (internal prep for a client meeting) under a name that collided with the "discussion call" pipeline stage. The skill folder and its client-page Quick Action / dashboard tile were removed; existing Artifact rows keep `generatedFromSkill: "discussion-doc"` as a historical label. Internal meeting prep lives in `discovery-prep` (to be broadened with real call transcripts).

#### 3. client-survey · ops-runtime · markdown-draft
- **Goal:** Draft a short, engagement-anchored survey to measure how the work is landing and surface what to adjust.
- **Audience:** partner (refines before sending). **Produces:** 8–12 question Markdown survey in 2–4 sections with question-type annotations.
- **Where it works:** ops Quick Action on a Client or Deal page. **How it works:** two modes (signed client mid/post-engagement, or prospect post-discovery); grounds questions in the engagement context; `[NEEDS INPUT]` markers; save gate blocks unresolved markers.
- **Inputs:** company/industry/status/what's-being-built/interactions + intake. **Dependencies:** `_firm/context.md`, Prisma Client/Deal/Interaction, save gate.
- **Baseline refs:** voice · audience · bmv2-vocab. **Audit:** not-audited · - · -.

#### 4. proposal-deck · ops-runtime · html
- **Goal:** Generate a self-contained HTML proposal deck (problem → solution → scope → timeline → deliverables → investment), linked to the interactive prototype.
- **Audience:** partner (reviews) → prospect (reads). **Produces:** single-file scrollable slide-style HTML, 8 sections (Cover→Next Step), prototype CTA, visible red `[NEEDS INPUT]` markers.
- **Where it works:** ops Quick Action on a deal page. **How it works:** context block + intake (emphasis notes + `PROTOTYPE_URL`) → raw HTML only; fixed-fee framing; save gate blocks unresolved markers.
- **Inputs:** opportunity context + intake (emphasis, PROTOTYPE_URL). **Dependencies:** `_firm/context.md`, PROTOTYPE_URL supplied at call time.
- **Baseline refs:** voice · **brand** · audience · bmv2-vocab. **Audit:** not-audited · - · -.
- **Notes:** Brand axis applies (HTML output). Pairs downstream of the prototype workflow.

#### 31. discovery-report · ops-runtime · html
- **Goal:** Turn discovery findings into a client-facing Discovery build-plan deck that confirms value, with no pricing.
- **Audience:** the client (receives it); the partner refines first. **Produces:** a branded HTML deck (light mode), 10 full-viewport sections.
- **Where it works:** ops Quick Action on the Client actions panel (wired 2026-06-05). **How it works:** context (client + 10 discovery interactions + saved brand colors) + intake (findings, the new insight, the time-back number, the X/Y outcomes) → HTML only; partner previews + refines before saving to Drive.
- **Inputs:** client context + discovery interactions + client brand colors (when captured) + partner intake. **Dependencies:** `_firm/context.md`; Prisma Client/Deal/Interaction; client brand from enrichment (the brand chain); pairs with `ingest-meeting` upstream and `scope-ops`/SOW downstream.
- **Baseline refs:** voice · **brand** · audience. **Audit:** pass 2026-06-05 · T5 B5 A5 G5 F5 H5 (born-audited via the pipeline).
- **Notes:** New 2026-06-05, fully wired (Gate 6 done). Light mode + fuller client-brand match (their colors, Shift fonts/layout, wordmark AI stays gold), falls back to Shift light. No pricing (proposal/SOW carry it). Distinctive: the value-confirmation close. Wiring: `generateDiscoveryReport`/`saveDiscoveryReport` in `clients/[id]/actions.ts` + `DiscoveryReportModal` (preview + source editor) on the Client actions panel. Brand-capture chain live: `enrich-company-web` now proposes `brandColors` (stored on `Client.brandColors`), which the deck reads as its accent.

#### 32. sow · ops-runtime · gdoc (HTML to Google Doc)
- **Goal:** Turn an accepted engagement into a contract-grade Statement of Work draft (scope, terms, IP, schedule) for partner + counsel review.
- **Audience:** the client (signs), the partner (drafts/refines), counsel (reviews). **Produces:** semantic HTML rendered to a native Google Doc in the client's Drive folder, with a visible "DRAFT, not for signature" banner.
- **Where it works:** ops Quick Action on the Client page (wiring is Gate 6). **How it works:** context (client + project scope/value/schedule/modules) + intake (final agreed terms: parties, build fee, subscription, buy-out, milestones, deployment) returns semantic HTML; partner + counsel redline the resulting Google Doc.
- **Inputs:** client + project context + partner intake of the agreed terms. **Dependencies:** `_firm/context.md`; the v2 commercial + IP model (inlined from `business-model-v2.md`); Prisma Client/Project; a Drive HTML-to-Google-Doc save helper (Gate 6); pairs downstream of `scope`.
- **Baseline refs:** voice · audience · business-model-v2 (commercial + IP). **Audit:** pass 2026-06-06 · T5 B(n/a) A5 G5 F5 H5 (born-audited).
- **Notes:** New 2026-06-06. Contract skill: drafts the v2 three-layer IP model + source escrow + per-deal buy-out; every output is flagged "DRAFT, for partner + counsel, not for signature" with `[for counsel]` markers on the binding wording. Brand is intentionally minimal (plain contract for clean Doc conversion, not a branded deck), so B is n/a. The inlined IP/commercial terms are a deploy-time copy of business-model-v2.md; keep in sync if the model changes.

### Prototype workflow (brief → spec → HTML)

#### 5. prototype-brief · ops-runtime · markdown-draft
- **Goal:** Turn deal context + a partner note into a tight brief scoping what an interactive prototype should demonstrate.
- **Audience:** partner / the next workflow step. **Produces:** ~200-word Markdown, 4 sections (Problem, What to Show, Who Uses It, After Picture).
- **Where it works:** ops Quick Action on a deal page (step 1 of 3). **How it works:** deal context + intake → scoping brief, no building; `[NEEDS INPUT]` for missing load-bearing facts.
- **Inputs:** deal context + partner note. **Dependencies:** `_firm/context.md`; feeds prototype-spec.
- **Baseline refs:** voice · audience · bmv2-vocab. **Audit:** not-audited · - · -.

#### 6. prototype-spec · ops-runtime · markdown-draft
- **Goal:** Turn the brief into a concrete, build-ready blueprint the HTML step can implement directly.
- **Audience:** the HTML build step / partner. **Produces:** ~250–350-word Markdown (screens, one interaction, sample data, the "wow" moment, visual direction).
- **Where it works:** ops Quick Action (step 2 of 3). **How it works:** opportunity context + the brief → blueprint constrained to one self-contained HTML file (inline CSS + vanilla JS, no backend).
- **Inputs:** opportunity context + prototype-brief output. **Dependencies:** `_firm/context.md`; chained from prototype-brief.
- **Baseline refs:** voice · brand · audience. **Audit:** not-audited · - · -.

#### 7. html-prototype · ops-runtime · html
- **Goal:** Turn the spec into one self-contained, interactive HTML prototype that demonstrates the proposed solution.
- **Audience:** partner (reviews) → prospect. **Produces:** standalone HTML (inline CSS + vanilla JS, sample data, working interactions, on-brand).
- **Where it works:** ops Quick Action (step 3 of 3). **How it works:** opportunity context + build spec → HTML only (from DOCTYPE); missing facts render as visible on-page markers; save gate enforces.
- **Inputs:** opportunity context + build spec. **Dependencies:** `_firm/context.md`; one file, no CDNs/frameworks, Google Fonts only.
- **Baseline refs:** voice · **brand** · audience. **Audit:** not-audited · - · -.

### Outreach & meetings

#### 8. draft-email · ops-runtime · plain-text
- **Goal:** Draft a short, ready-to-edit outreach/follow-up email from a partner to a contact.
- **Audience:** the partner (reviews, fills markers, sends). **Produces:** plain email body (+ optional `Subject:` line), no commentary.
- **Where it works:** ops Quick Action on a Contact/Deal page. **How it works:** intake (goal, tone, points) + contact context (role, interactions, last-touch, stage) → email calibrated to relationship warmth; `[NEEDS INPUT]` inline; save gate.
- **Inputs:** contact context + partner intake. **Dependencies:** `_firm/context.md`, Prisma Contact/Interaction, save gate.
- **Baseline refs:** voice · audience · **personas** (sender sign-off). **Audit:** not-audited · - · -.
- **Notes:** Persona-dependent (routes tone/sign-off by sending partner) - audit's persona check unblocks once `personas.md` markers are filled.

#### 9. book-meeting · ops-runtime · markdown-draft
- **Goal:** Draft a short message proposing or confirming a meeting with a contact.
- **Audience:** partner (sends) → contact. **Produces:** 3–4 sentence message body (+ optional Subject), one clear ask, time windows from intake only, first-name sign-off.
- **Where it works:** ops Quick Action on a Contact/Pipeline page. **How it works:** context block + intake (purpose, times, attendees) → message body; save gate blocks unresolved `[NEEDS INPUT]`.
- **Inputs:** contact/deal context + intake. **Dependencies:** `_firm/context.md`, Prisma Contact/Interaction, save gate.
- **Baseline refs:** voice · brand · audience. **Audit:** not-audited · - · -.

#### 10. cold-outreach · ops-runtime · json
- **Goal:** Draft a ready-to-edit cold intro email to a never-contacted lead the Lead Scout surfaced.
- **Audience:** partner (reviews, sends). **Produces:** JSON `{subject, body}` with inline `[NEEDS INPUT]` placeholders.
- **Where it works:** ops Quick Action on a lead detail page (downstream of Lead Scout). **How it works:** lead context (company, why-it-fits, person, segment) + intake → subject + body; sign-off degrades to `[NEEDS INPUT: partner name]` if absent.
- **Inputs:** company/fit/contact/segment context + intake. **Dependencies:** `_firm/context.md`; Lead Scout upstream.
- **Baseline refs:** voice · audience · **personas**. **Audit:** not-audited · - · -.

#### 11. discovery-prep · ops-runtime · markdown-draft
- **Goal:** Generate a tight internal prep brief before a partner runs a first discovery call.
- **Audience:** the partner - **internal only**, never sent to the prospect. **Produces:** 5-section Markdown (Quick read, Agenda, Questions that qualify, How to run it, Win the next call).
- **Where it works:** ops Quick Action on a Deal/Contact page. **How it works:** prospect context + optional intake → grounded brief (generic advice = failure mode); `[NEEDS INPUT]`; save gate.
- **Inputs:** company/industry/stage/value/contact/lead-source/interactions + intake. **Dependencies:** `_firm/context.md`, Prisma deal/contact/interaction.
- **Baseline refs:** voice · audience · **personas**. **Audit:** not-audited · - · -.

### Ingest & extraction

#### 12. ingest · ops-runtime · json
- **Goal:** Parse raw pasted content against one-or-more known records and propose field changes, interactions, tasks, milestones, and a stage signal for review.
- **Audience:** the ops server action (writes after approval) + partner (reviews). **Produces:** one JSON object (ingestType, summary, keyPoints, per-record proposals, tasks).
- **Where it works:** ops Quick Action (the master ingest). **How it works:** context block (ingest type, target records + current values + open tasks, partner roster) + raw paste → proposals across records; floated numbers stay soft; partner approves before any write.
- **Inputs:** target records context + raw content. **Dependencies:** `_firm/context.md`, Prisma Contact/Client/Project/Deal, the server action.
- **Baseline refs:** voice · bmv2-vocab. **Audit:** not-audited · - · -.
- **Notes:** Per-record field allowlists; deal records restricted to stageSignal; `reassignTaskId` avoids duplicate tasks.

#### 13. ingest-meeting · ops-runtime · json
- **Goal:** Parse a meeting transcript into summary, key points, action items, enrichment, and a stage signal - for review.
- **Audience:** partner (approves). **Produces:** JSON (summary, keyPoints, actionItems, enrichment{contact,client}, stageSignal|null).
- **Where it works:** ops Quick Action where a transcript is pasted. **How it works:** matched-entity context + transcript → traceable extractions only; soft claims downgraded to keyPoints, never asserted as facts/dates.
- **Inputs:** matched Contact/Client/Deal + transcript. **Dependencies:** `_firm/context.md`, Prisma Contact/Client.
- **Baseline refs:** voice · bmv2-vocab. **Audit:** not-audited · - · -.

#### 14. ingest-project · ops-runtime · json
- **Goal:** Extract project records (milestones, tasks, interactions, contact facts, notes) from dropped content in the context of a known project.
- **Audience:** partner (approves) → ops system. **Produces:** JSON (summary, projectNotes, contactKeyFacts[], milestones[], tasks[], interactions[]).
- **Where it works:** ops Quick Action on a Project page. **How it works:** project context + raw drop → defensibly-stated items only; dates only when named; partner approves before writes.
- **Inputs:** project/client/contact context + raw content. **Dependencies:** `_firm/context.md`, Prisma Milestone/Task/Interaction.
- **Baseline refs:** voice · bmv2-vocab. **Audit:** not-audited · - · -.

#### 15. ingest-scope-pricing · ops-runtime · json
- **Goal:** Extract only the pricing breakdown (roles, hours, pay/bill rates, total) from a scoping doc.
- **Audience:** partner (reviews economics). **Produces:** JSON (total, lines[{role, consultantHint, hours, payRateCents, billRateCents, isExtra}], notes[]).
- **Where it works:** ops Quick Action on a Project page, fed a pasted scope doc. **How it works:** project + consultant-roster context + doc → pricing lines only (narrative ignored); unknown pay rates → null, server fills roster default.
- **Inputs:** project value + roster context + raw doc. **Dependencies:** `_firm/context.md`, server-supplied roster (Prisma).
- **Baseline refs:** voice · bmv2-vocab (economics). **Audit:** not-audited · - · -.
- **Notes:** `isExtra` flags change-order lines. Narrow by design (pricing only; a sibling ingest handles narrative).

#### 16. structure-deal-notes · ops-runtime · json
- **Goal:** Rewrite a partner's raw deal note into a clean summary and lift durable contact facts (append-only).
- **Audience:** ops system (persists) + partner. **Produces:** JSON `{structuredNote, contactKeyFacts[]}`.
- **Where it works:** ops Quick Action when a partner saves a raw deal note. **How it works:** contact context + raw note → cleaned note (every concrete fact preserved) + durable facts for `keyFacts` enrichment; never invents.
- **Inputs:** contact record + raw note. **Dependencies:** `_firm/context.md` (no Prisma reads inside the skill - context passed in).
- **Baseline refs:** voice · bmv2-vocab. **Audit:** not-audited · - · -.

### Contact / company enrichment

#### 17. enrich-contact · ops-runtime · json
- **Goal:** Propose profile additions + flag conflicts for a contact, inferring **only** from the existing record + logged interactions (no web).
- **Audience:** partner (accepts/rejects). **Produces:** JSON `{additions[], conflicts[]}` across 6 fields (persona, communicationStyle, background, keyFacts, hobbies, networkAffiliations).
- **Where it works:** ops Quick Action on a Contact page. **How it works:** contact + interaction context → log-only inferences; thin log → empty object; single-value changes surface as conflicts, never silent overwrites.
- **Inputs:** contact record + logged interactions. **Dependencies:** `_firm/context.md`, Prisma Contact/Interaction.
- **Baseline refs:** voice · bmv2-vocab. **Audit:** not-audited · - · -.

#### 18. enrich-contact-web · ops-runtime · json
- **Goal:** Same as enrich-contact but sourced from authoritative public web (with citations).
- **Audience:** ops system → partner. **Produces:** JSON `{additions[] (field+sourced value), conflicts[]}`, same 6-field allowlist.
- **Where it works:** ops Quick Action on a Contact page (web counterpart). **How it works:** name+title+company web search → professional sources only, every value cited; inconclusive → empty.
- **Inputs:** contact record. **Dependencies:** `_firm/context.md`, web search, Prisma Contact.
- **Baseline refs:** voice · no-hallucination. **Audit:** not-audited · - · -.

#### 19. enrich-company-web · ops-runtime · json
- **Goal:** Find public, authoritative company facts via web search and propose profile additions/conflicts.
- **Audience:** ops system/partner. **Produces:** JSON `{additions[] (cited), conflicts[]}` (companySize, headquarters, founded, website, ownership, description, companyKeyFacts).
- **Where it works:** ops Quick Action on a Company/Client page. **How it works:** name+industry(+domain) web search → cited facts; append-only (never overwrites); `website` stored as bare domain; can't resolve → empty.
- **Inputs:** company record. **Dependencies:** `_firm/context.md`, web search.
- **Baseline refs:** voice · audience · bmv2-vocab. **Audit:** not-audited · - · -.

### Lead gen / targeting

#### 20. segment-drafter · ops-runtime · json
- **Goal:** Turn a partner's segment name + brief into a complete structured ICP segment that pre-fills the Targeting builder.
- **Audience:** partner (reviews in the builder, clicks Save). **Produces:** JSON segment (description, industries, revenue/headcount bands, geographies, priorityLocation, personas{dept,seniority}, buyingSignals, disqualifiers, anchor companies + verified domains).
- **Where it works:** ops Quick Action on the Targeting builder. **How it works:** fresh (build) or refine (extend) mode; injected persona vocab + geography rules; web-verifies anchor companies; writes nothing to DB.
- **Inputs:** controlled vocab + mode flag + intake brief. **Dependencies:** `_firm/context.md`, web search, runtime vocab lists.
- **Baseline refs:** voice · **audience (ICP)** · no-hallucination. **Audit:** not-audited · - · - (audience axis blocked on icp.md).

#### 21. segment-optimizer · ops-runtime · json
- **Goal:** Read a segment's spec + actual run performance and propose evidence-driven refinements.
- **Audience:** partner (reviews, Applies). **Produces:** JSON (summary, labeled per-field suggestions with reasons, a fully merged proposed spec).
- **Where it works:** ops Quick Action on a segment with run history. **How it works:** current spec + results summary (counts, score histogram, ghosted/disqualified traits, conversion signal) → refinements; sparse results → conservative hygiene only; web-verifies any anchor companies; no DB writes.
- **Inputs:** spec + run-results summary + vocab. **Dependencies:** `_firm/context.md`, web search, Prisma segment/run data.
- **Baseline refs:** voice · **audience (ICP)** · bmv2-vocab. **Audit:** not-audited · - · - (audience axis blocked on icp.md).

#### 22. lead-discovery-apollo · ops-runtime · reference
- **Goal:** Define the deterministic TargetSegment→Apollo-filter mapping so the discovery pipeline stays consistent and reviewable.
- **Audience:** the pipeline code + any dev/partner auditing it (not end-user output). **Produces:** a canonical reference spec (Markdown tables) - **read by code, not invoked via `generate()`**.
- **Where it works:** referenced by [lib/lead-discovery.ts](../lib/lead-discovery.ts) at build/review time. **How it works:** no runtime call; the code encodes the spec (company filters, people filters seniority+dept→title seeds, primary-person ranking, credit policy 1 reveal/company).
- **Inputs:** conceptually a TargetSegment; consumed by code. **Dependencies:** Apollo API, `lib/data/apollo-taxonomy.ts`, `lib/lead-discovery.ts`. **Does NOT use `_firm/context.md`** (code spec, not an LLM prompt).
- **Baseline refs:** **audience (ICP)**. **Audit:** not-audited · - · -.
- **Notes:** The one "skill" that's really a code-spec doc. Audit it for ICP-encoding correctness, not voice/format.

#### 23. lead-discovery-firecrawl · ops-runtime · plain-text
- **Goal:** Convert a TargetSegment into a compact Firecrawl search query and parse results into candidate company domains.
- **Audience:** the lead pipeline → partners reviewing leads. **Produces:** a single query string (crafting mode) / a bare root domain (reading mode); no prose.
- **Where it works:** ops lead pipeline, server-side via `generate({skill:"lead-discovery-firecrawl"})`. **How it works:** segment → <~12-word query → Firecrawl /search → extract+filter domains (drop aggregators/social); optional /scrape to confirm firmographics when Apollo is thin.
- **Inputs:** TargetSegment spec. **Dependencies:** `_firm/context.md`, Firecrawl /search + /scrape, Apollo (primary source it widens).
- **Baseline refs:** voice · audience · bmv2-vocab. **Audit:** not-audited · - · -.

#### 24. lead-rating · ops-runtime · json
- **Goal:** Score a candidate company 1–10 vs a TargetSegment's fit criteria and flag hard disqualifiers.
- **Audience:** ops system (routes the lead) → partner. **Produces:** JSON `{score 1–10, rationale, disqualified}`.
- **Where it works:** ops pipeline, scoring candidates before they hit the partner queue. **How it works:** segment spec + enriched candidate → 4-factor weighting (industry, size, geography, buying signals) + disqualifiers; unknowns don't inflate; raw JSON only.
- **Inputs:** segment spec + enriched candidate. **Dependencies:** `_firm/context.md`, Prisma TargetSegment, upstream scrape/enrich.
- **Baseline refs:** **audience (ICP)** · bmv2-vocab. **Audit:** not-audited · - · - (audience axis blocked on icp.md).
- **Notes:** References `LeadStatus` values "pending"/"ghost" - must match the enum.

#### 25. contact-scan · ops-runtime · json
- **Goal:** Batch-score imported contacts on company fit (Axis A) + person role (Axis B) → a 1–10 BD relevance score.
- **Audience:** partners (decide who to promote) + ops system (persists scores). **Produces:** JSON array `[{index, score 1–10, leadType: decision_maker|connector|none, rationale}]`.
- **Where it works:** ops Quick Action on the Contacts import/scan page (batch). **How it works:** injected scan-criteria block (the per-scan ICP) + contact array → two-axis rubric; blank company → score 1/none; decision-maker at a non-fitting company capped ~4.
- **Inputs:** scan-criteria block + contact array. **Dependencies:** `_firm/context.md`, runtime scan-criteria (ops UI/DB).
- **Baseline refs:** **audience (ICP)** · voice · bmv2-vocab. **Audit:** not-audited · - · -.
- **Notes:** ICP is configurable per scan (injected above the skill), so the audience axis checks the *mechanism*, not a hardcoded ICP.

#### 26. import-column-map · ops-runtime · json
- **Goal:** Map an uploaded contact CSV's headers to the canonical field keys for ingestion.
- **Audience:** the import pipeline (not a human reader). **Produces:** JSON of up to 9 keys (name, firstName, lastName, title, company, email, phone, linkedin, companyDomain) → verbatim header strings.
- **Where it works:** ops Quick Action in the contact-import flow. **How it works:** headers + sample rows → resolve ambiguity (work vs personal email, LinkedIn vs domain) → mapping object; omit any field with no confident match.
- **Inputs:** headers + sampleRows. **Dependencies:** `_firm/context.md` only (no APIs/Prisma).
- **Baseline refs:** voice (no-hallucination). **Audit:** not-audited · - · -.

### Workspace automation (MCP-driven)

#### 27. onboard-client · ops-runtime · mcp-writes
- **Goal:** Scaffold a new client's three surfaces (Drive folder, local folder, per-client CLAUDE.md) when a deal converts, and write handles + charter back.
- **Audience:** the ops system (MCP/DB) + the partner who opens the workspace. **Produces:** Drive folder tree, local folder, per-client CLAUDE.md, engagement charter (draft Artifact), updated Client (driveFolderUrl, workspacePath).
- **Where it works:** **fires on `engagement.created`**; runs from Claude Code with the ops MCP server registered (not a web-UI button). **How it works:** `get_client(clientId)` → create folders + CLAUDE.md from template + draft charter → write back via MCP; idempotent (stops if handles already set).
- **Inputs:** clientId + full Client record. **Dependencies:** `_firm/context.md`, MCP `get_client`/`create_artifact`, Drive API, Drive-for-Desktop, AuditLog.
- **Baseline refs:** voice · bmv2-vocab. **Audit:** not-audited · - · -.
- **Notes:** This skill is the operating instructions for the **Onboard Client agent (A3)** - see §5. Charter lands `reviewStatus: draft`.

#### 28. harvest-engagement · ops-runtime · markdown-draft
- **Goal:** When an engagement closes, walk the workspace and propose sanitized reusable IP into the firm template library (propose-never-auto-write).
- **Audience:** partner (approves every lift). **Produces:** sanitized template drafts in `00-Firm/_Templates/`, one draft Artifact each, a partner summary (found / sanitized / proposed / omitted).
- **Where it works:** **fires on `engagement.closed`**; runs from Claude Code in the closed client's workspace with MCP registered. **How it works:** confirm closed via `get_client` → inventory via `list_artifacts` + local folders → strip client-identifying content → write sanitized drafts + register via `create_artifact` → summarize.
- **Inputs:** clientId + read access to the workspace. **Dependencies:** `_firm/context.md`, MCP `get_client`/`list_artifacts`/`create_artifact`, local FS, Drive API.
- **Baseline refs:** voice · bmv2-vocab. **Audit:** not-audited · - · -.
- **Notes:** Operating instructions for the **Harvest Engagement agent (A2)** - see §5. The firm's "skills get smarter from real work" mechanism. Harvests shape (how), not content (what).

---

## 4. Claude Code skills

#### 29. scope (firm) · firm-cc · html
- **Goal:** Turn a discovery conversation into a complete, branded, client-facing HTML proposal - scope + bottom-up pricing + weekly timeline + risks + next steps.
- **Audience:** prospect/client (the HTML) + the partner (confirms pricing first). **Produces:** a single branded `.html` proposal saved to a deliverables path.
- **Where it works:** Claude Code chat in `shiftai-firm` ("scope this", "draft a proposal", "SOW"). **How it works:** 5-step flow - read source in full → ask only missing intake (≤2 rounds) → apply the pricing formula (hours×bill rate + direct costs, no markup) and confirm → draft HTML only after sign-off → save + report path.
- **Inputs:** discovery material + intake (client, problem, engagement shape, risks, lead partner). **Dependencies:** `firm-economics.md` (rates), `business-model-v2.md` (model), `brand-guide.md` (voice/brand), Google Fonts. **Does NOT use `_firm/context.md`** (rules inline).
- **Baseline refs:** voice · **brand** · audience · bmv2-vocab. **Audit:** not-audited · - · -.
- **Notes:** **Edition-06 sharp-corner spec FIXED 2026-06-04** (now 10px radius + subtle shadow). **Two open items remain:** (a) save path still points at the legacy `…\Desktop\ABC\deliverables\` (pre-migration) - needs a `shiftai-firm` path; (b) ownership/subscription language pending the 3-of-3 vote. Carries the full banned-word list inline. Pairs with html-brief-jason (it handles non-commercial editorial docs).

#### 30. html-brief-jason · cc · html
- **Goal:** Produce a single-file, browser-rendered editorial HTML brief (pitches, proposals, pilot plans, acquisition memos, one-pagers).
- **Audience:** Jason builds them; clients/prospects/stakeholders open them. **Produces:** a self-contained `.html` (embedded CSS, Google Fonts, no JS).
- **Where it works:** Claude Code chat ("HTML brief", "one-pager", "turn this into a web doc"). **How it works:** detect Mode A (style supplied content) vs Mode B (generate + style); pick a brand preset (JIRAH / listingbox / client-matched); build a freeform long-scroll doc whose sections follow the content.
- **Inputs:** pasted content (Mode A) or intent + audience (Mode B); client brand context when client-facing. **Dependencies:** Google Fonts only (no MCP/Prisma/APIs); voice rules inline.
- **Baseline refs:** **voice · brand only** (general-purpose, multi-brand - NOT audited on Shift-specific brand/persona/bmv2). **Audit:** not-audited · - · -.
- **Notes:** Out-of-scope drifts to flag, not "fix to Shift": (a) output path `/mnt/user-data/outputs/` is Linux-style - needs a Windows path; (b) presets are JIRAH/listingbox (legacy client brands), by design since this is Jason's general multi-brand tool. Audit only on house-style voice, goal clarity, format, no-hallucination.

---

## 5. Agents

> "Skills" are instructions; "agents" are a skill (or pipeline of skills) plus a **trigger** and **persistence**. Today only Lead Scout is partly built; the rest are skill-ready or sketched, all blocked on the same missing infrastructure (event bridge / scheduled-agent runtime / MCP transport+auth). All agent writes follow the recipe in [CLAUDE.md](../CLAUDE.md) "Wire a Quick Action end-to-end": Artifact + optional Interaction + AuditLog, one transaction, `reviewStatus: draft`.

#### A1. Lead Scout · **partial** (Phase A built on a local branch)
- **Goal:** Discover, enrich, and rate prospect companies against the firm's ICP segments, then surface them in the "AI Found Leads" tab for partner approval before any contact.
- **Audience:** partners filling the top of the funnel (Jason owns the build). **Produces:** ProspectLead rows (company + nested people, score 1–10, rationale, source, status pending/ghost), a LeadRun per execution, AuditLog rows, optional cold-outreach draft Artifacts.
- **Where it works:** manual "Fill Funnel" server action on the Targeting page (same architecture as the ingest Quick Action). **Phase A** (Targeting + segment-drafter) built, not yet merged/live. **Phase B** (ProspectLead model, AI Found Leads tab, add/decline UI) is next. **Phase C** (Firecrawl+Apollo discovery + live rating) fully designed, **blocked on API keys** (FIRECRAWL_API_KEY, APOLLO_API_KEY). **Phase D** (scheduled cron auto-fill via MCP + notifications) is post-v1.
- **How it works:** partner picks a segment → "Fill Funnel" → query Firecrawl (/search+/scrape) + Apollo (companies+people) → merge by normalized domain → dedup vs existing leads/contacts → enrich (firmographics + 3–5 buyer-persona people) → rate 1–10 vs the segment rubric → ≥6 = pending, <6 = auto-ghost (collapsed). Partner adds-to-funnel (creates Contact + Deal at stage=lead) or declines (status=ghost). "Draft cold email" on a lead runs cold-outreach and logs Interaction + Artifact on send.
- **Skills used:** segment-drafter, lead-discovery-firecrawl, lead-discovery-apollo, lead-rating, segment-optimizer, cold-outreach.
- **Dependencies:** Prisma TargetSegment/ProspectLead/LeadRun/Contact/Deal/AuditLog; Firecrawl + Apollo (keys not yet provisioned); Anthropic API (present). Manual trigger (no event in A–C).
- **Baseline refs:** `docs/AGENTLEADPLAN.md` (full design, decisions D1–D39), the persistence recipe, propose-never-auto-write. **Audit:** reviewed 2026-06-05 · partial build. ICP now filled (the segment is the ICP). Gated on Firecrawl + Apollo keys; the ~240s run may exceed Vercel free-tier.

#### A2. Harvest Engagement · **skill exists, trigger missing**
- **Goal:** When an engagement closes, lift sanitized reusable IP from the client workspace into the firm template library.
- **Audience:** partners post-engagement (approve every lift). **Produces:** sanitized template drafts in `00-Firm/_Templates/`, one draft Artifact each, an AuditLog row, a partner summary.
- **Where it works:** designed to fire on **`engagement.closed`**; the event bridge is **not wired** (MCP server is live, shipped 2026-05-29; the status-change→agent hookup is missing). Runs manually today from Claude Code in the closed client's workspace.
- **How it works:** `get_client` (confirm closed) → `list_artifacts` + local folder pass → strip client-identifying content (`[CLIENT]`/`[METRIC]`/`[DATE]`) → write drafts + `create_artifact` → summarize. Idempotent (stops if not closed).
- **Skills used:** harvest-engagement (§3 #28). **Dependencies:** MCP `get_client`/`list_artifacts`/`create_artifact`; Prisma Client/Artifact/AuditLog; `engagement.closed` event (unwired); local FS + Drive API.
- **Baseline refs:** `skills/harvest-engagement/SKILL.md`, `docs/mcp-contract.md`, ops-roadmap-state. **Audit:** reviewed 2026-06-05 · skill clean, blocked on the event bridge. Add an `ipHarvestStatus` re-run guard.
- **Notes:** SKILL.md is complete. Blocker is the event bridge + the unresolved mcp-contract open questions (webhooks vs polling, remote MCP transport, auth).

#### A3. Onboard Client · **skill exists, trigger missing**
- **Goal:** When a deal converts to a Client, scaffold the three-surface workspace and write handles + charter back to the ops tool.
- **Audience:** partners (the charter is a draft for review). **Produces:** Drive folder + standard subfolders, local folder, per-client CLAUDE.md, engagement charter, Client update (driveFolderUrl, workspacePath), draft Artifact, AuditLog row.
- **Where it works:** designed to fire on **`engagement.created`**; same unwired event bridge as A2. Runs manually from Claude Code with MCP registered.
- **How it works:** `get_client` → if handles already set, stop (idempotent) → create Drive + local folders → per-client CLAUDE.md from template (gaps `[NEEDS INPUT]`) → draft charter from deal notes → `update_project_status`/`create_artifact` write-back.
- **Skills used:** onboard-client (§3 #27). **Dependencies:** MCP `get_client`/`create_artifact` + a Client-field write; Prisma Client (`engagementCharterMd` listed as "still to add Phase 4")/Artifact/AuditLog; `engagement.created` event (unwired); Drive API + local FS.
- **Baseline refs:** `skills/onboard-client/SKILL.md`, `docs/mcp-contract.md`. **Audit:** reviewed 2026-06-05 · skill clean, blocked on the event bridge + the `engagementCharterMd` field.

#### A4. Pipeline Hygiene · **sketched**
- **Goal:** Weekly review of stale leads/deals - surface contacts untouched past a threshold and prompt action.
- **Audience:** partners (a notification/report). **Produces:** undocumented - likely a prioritized stale-deal report (artifact type, persistence, surface all unspecified).
- **Where it works:** sketched as a weekly cron; the scheduled-agent runtime is **not built**. No SKILL.md exists.
- **How it works:** not specified. Inferred shape: `list_pipeline` with stale-date filters → identify untouched deals → hygiene report. Staleness threshold, scoring, output format all open.
- **Skills used:** none (a skill must be written first). **Dependencies:** MCP `list_pipeline`; Prisma Deal/Contact/Partner; scheduled-agent runtime (missing); MCP transport+auth (open).
- **Baseline refs:** ops-roadmap-state, `docs/mcp-contract.md`. **Audit:** reviewed 2026-06-05 · design-first (no SKILL.md). Author via the pipeline; decide the staleness threshold + read-only-vs-write.

#### A5. Status Sync · **sketched**
- **Goal:** Daily sync of project status from a client's local workspace back to the ops tool's Project records.
- **Audience:** partners + the ops dashboard. **Produces:** undocumented - likely `update_project_status` writes (status, notes, `lastClaudeSyncAt` - field "still to add").
- **Where it works:** sketched as a daily cron; scheduled-agent runtime **not built**. No SKILL.md.
- **How it works:** not specified. Inferred: `list_active_engagements` → read workspace-side status notes (file convention unspecified) → `update_project_status`. The workspace-side status format is undefined.
- **Skills used:** none. **Dependencies:** MCP `list_active_engagements`/`update_project_status`; Prisma Project (`lastClaudeSyncAt` to add)/Client.workspacePath; scheduled-agent runtime (missing); MCP transport+auth (open).
- **Baseline refs:** `docs/mcp-contract.md`, ops-roadmap-state. **Audit:** reviewed 2026-06-05 · design-first (no SKILL.md). Open: the workspace-side status format (couple to A3) + add `lastClaudeSyncAt`.

---

## 6. Audit log (append-only)

| Date | What swept | Rubric | Headline |
|---|---|---|---|
| 2026-06-04 | Registry built - descriptive records for all 30 skills + 5 agents. Baseline gaps (personas, ICP) drafted. `scope` (firm) Edition-06 corners fixed. | - | No formal scores yet; first scored audit gated on Jason filling the persona + ICP `[NEEDS INPUT]` markers. |
| 2026-06-05 | Full sweep: all 30 skills scored on rubric v1; 5 agents reviewed. Baselines filled (personas + ICP). 7 fixes applied + AGENTLEADPLAN "locked" cleanup. | v1 | 16 pass · 14 pass-with-notes · 0 fail/stale/blocked. H = 5 on every skill. Only open drift is the vote-gated Run→Operate rename. |
| 2026-06-05 | New skill `discovery-report` authored via the pipeline (Gate 0-5): client-facing Discovery build-plan deck, light mode + client-brand match. | v1 | pass · T5 B5 A5 G5 F5 H5. Gate 6 (wiring) + the brand-capture chain pending. |
| 2026-06-06 | New skill `sow` authored via the pipeline (Gate 0-5): contract-grade Statement of Work draft, HTML to Google Doc, v2 IP model + escrow, counsel-flagged. | v1 | pass · T5 B(n/a) A5 G5 F5 H5. Gate 6 (wiring + Google-Doc save helper) next. |

---

## 7. Cross-skill open decisions & backlog

Findings that span many skills, or need a partner decision:

1. **Run → Operate vocabulary (vote-gated, OPEN).** `scope-ops`, `scope` (firm), `discussion-doc`, the ingest stage signals, and `_firm/context.md` still use Discovery/Build/**Run** + old engagement words, **intentionally pending the 3-of-3 partner vote** (`docs/business-model-v2-plan.md` Part A). The audit flags these as *pending*, not *fail*. When the vote passes, apply Part A in lockstep. Decision owner: partners.
2. **Partner personas - filled 2026-06-05.** Roles set to Managing Partner and signing authority drafted in `personas.md`; the audience/persona axis is no longer blocked. Consistency note: the doc header still calls the signing matrix `[NEEDS INPUT]` while the per-partner fields are filled - reconcile the header at ratification.
3. **ICP - filled 2026-06-05.** `icp.md` disqualifiers, watering holes, and buy signals are in (a few items still "candidates to confirm"). Audience axis unblocked.
4. **Skill fixes applied 2026-06-05 (this sweep).** proposal-deck (Edition-06 brand block), `scope` (firm) ("locked"→"set", "Shift AI Consulting"→"Shift AI Partners", save path → `shiftai-firm/deliverables/` - **confirm the folder**), cold-outreach ("small" dropped), lead-discovery-firecrawl (output contract), lead-discovery-apollo ("locked"→"withheld"), html-prototype (brand-floor backstop), harvest-engagement (summary contract); AGENTLEADPLAN "locked"→"set".
5. **`html-brief-jason` portability (low, by design).** Linux output path `/mnt/user-data/outputs/` won't resolve on Windows; presets are legacy JIRAH/listingbox. It's a general multi-brand personal tool - audited on house-style only.
6. **Agent infrastructure (A2–A5, OPEN).** The event bridge (status-change → agent), the scheduled-agent runtime, and MCP remote transport+auth are unbuilt and block every autonomous agent. A2 needs an `ipHarvestStatus` re-run guard; A3 needs the `engagementCharterMd` field; A4/A5 need a SKILL.md authored via the pipeline (A5's open unknown: the workspace-side status format - couple to A3's scaffold). Decision owner: Jason (Phase 4–5 sequencing).
