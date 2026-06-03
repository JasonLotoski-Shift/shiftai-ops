# Lead Generation Agent — Build Plan (`AGENTLEADPLAN.md`)

> **Status:** Design / brainstorming — locked decisions below, open questions at the end.
> **What this is:** the detailed build-out of **Lead Scout** (Agent #2 in [agent-flow-design.md](agent-flow-design.md)), expanded with an ICP foundation (Targeting) and a review surface (AI Found Leads).
> **Persistence rule:** [../CLAUDE.md](../CLAUDE.md) "Wire a Quick Action end-to-end" — every write round-trips into the DB (Artifact + optional Interaction + AuditLog), propose-never-auto-write.
> **Owner cadence:** Jason wants to be hands-on. This doc is the walk-through — **open questions are numbered at the bottom; we resolve them one at a time before building each phase.**

---

## 1. The vision (Jason's words, distilled)

A partner clicks **"Fill Funnel"**, picks which discovery agents to run, and the system **finds** new companies that match our ideal customer, **enriches** them (company + the right people), **rates** each 1–10 for fit, and drops them into a new **"AI Found Leads"** tab on the Pipeline. The partner reviews each, then **Add to funnel** (becomes a Contact + Deal) or **Decline** (goes to a ghost list so agents never re-surface it). Leads that don't pass are still recorded so future searches don't waste effort re-finding them. Before any of this, we **formalize the target client / industry** definitions so the rating agent has something real to score against.

---

## 2. How the design changed (the challenges we worked through)

The original sketch was "3 agents that search and cross-reference each other." We reframed it into something simpler and more robust:

1. **"AI Found Leads" is its own holding model + review queue — not a pipeline stage.** It reuses the exact pattern of your existing `IngestProposal` meeting-review queue (propose-never-auto-write, approve/reject, loose matched-IDs). A found lead has no Contact yet and may be declined, so it never pollutes the Deal board.

2. **Dedup is one registry keyed by normalized domain — no bulk pre-download.** "Already a ghost", "already a pending found-lead", and "already in the pipeline" are the same question: *have we seen this company?* Every source checks one normalized-domain key before writing. The ghost list is simply `ProspectLead.status = ghost`.

3. **"3 agents cross-referencing" → one pipeline with 2 data sources.** Sources → **merge by domain** → enrich each merged candidate → rate against the matched segment. The "cross-referencing" is just the merge + enrich step (Firecrawl found the company, Apollo adds the people/firmographics). Far easier to build and debug than agents negotiating.

4. **Firecrawl *is* a web search.** Its `/search` returns results with full page content; `/scrape` pulls any page. So Firecrawl is both "search for matches" and "scrape the matches." That collapses the three discovery agents into **two data sources**: **Firecrawl** (web discovery + scrape) and **Apollo** (people/firmographics DB). Anthropic's native web search (already wired in `generate()`) is used only *inside* enrichment/rating reasoning — not as a third redundant crawler.

5. **Trigger manually first (server action), schedule later.** "Fill Funnel" is an in-app server action — same architecture as the `ingest` Quick Action — so it writes `ProspectLead` rows directly and is **not gated on the MCP server**. Autonomy/cron is a clean Phase-D follow-on.

---

## 3. Locked decisions

| # | Decision | Choice |
|---|---|---|
| D1 | ICP shape | **Several named `TargetSegment`s**, each with its own full criteria set; full CRUD from the page |
| D2 | Industry classification | **Free-form industry tags** on segments (any label). Legacy 5-value `Industry` enum stays for Contact/Deal/Client; map tags → closest enum on conversion |
| D3 | Targeting home | **New top-level sidebar page: "Targeting"** — segment cards + the "target builder" |
| D4 | Segment = source of truth | Segments are injected into the AI context; they drive **both** discovery queries **and** the rating rubric |
| D5 | Found-lead grain | **Company-centric** `ProspectLead` (firmographics + score + rationale) with **nested candidate people** |
| D6 | Dedup | **Unique normalized-domain key** on `ProspectLead`; every source checks before writing |
| D7 | Score handling | **Hybrid** — ≥ threshold → `pending` in the tab; below → auto-`ghost` but shown in a collapsed "Filtered out (N)" section |
| D8 | Review surface | New **"AI Found Leads" tab** on the Pipeline page (not a Deal column) |
| D9 | Add to funnel | Pick primary person → create `Contact` + `Deal(stage=lead)` via the canonical recipe |
| D10 | Discovery sources | **Two: Firecrawl (web) + Apollo (people DB)**; Anthropic web search assists enrich/rate only |
| D11 | Per-source guidelines | Each source gets its **own `SKILL.md`** defining how a segment compiles into its query format |
| D12 | Trigger | Manual **"Fill Funnel"** server action (capped batch per run); not MCP-gated |
| D13 | Seed segments (Q1) | **Pre-seed the 4 beachhead verticals** (automotive/motorsport/engineering/construction, $25–200M) as fully editable starter segments |
| D14 | People storage (Q7) | **`Json` array** of candidate people on `ProspectLead` (no separate table for v1) |
| D15 | Pipeline dedup (Q8) | **Add a normalized `domain` field to `Contact`** for exact "already in pipeline" checks, alongside the unique key on `ProspectLead` |
| D16 | Execution | **Build A + B now** (no external keys); create Firecrawl + Apollo accounts in parallel; Phase C after keys land |
| D17 | Run targeting (Q4) | **One segment per "Fill Funnel" run**; the segment card shows a **live "searching" indicator** while its run is in flight |
| D18 | Run size (Q2) | **Time-boxed run (~240s budget)**; stop and report how many candidates were evaluated |
| D19 | Threshold (Q3) | **Global score threshold, default 6** (≥6 → pending, <6 → ghost). *Future option: per-segment custom threshold* |
| D20 | People depth (Q6) | **Apollo pulls 3–5 people/company**, filtered by the segment's `buyerPersonas` titles |
| D21 | Run status | A lightweight **`LeadRun`** record (segment, status `running`/`done`, counts, timestamps) powers the live indicator + future run history |
| D22 | Guideline style (Q9) | Each source `SKILL.md` uses **principles + parameterized templates** (segment field → query mapping the model adapts) |

---

## 4. Architecture

### 4.1 Data models (new)

**`TargetSegment`** — the ICP (Phase A)
- `name`, `description`, `active` (bool), `priority` (int/weight)
- `industries` (`String[]` — free-form tags)
- `revenueMin` / `revenueMax`, `employeeMin` / `employeeMax`
- `geographies` (`String[]`)
- `buyerPersonas` (`String[]` — target titles, e.g. "VP Engineering", "COO")
- `buyingSignals` (`String[]`), `disqualifiers` (`String[]`)
- `searchSpec` (`Json` — structured filters + free-text instructions; compiles to per-source queries)
- `anchorCompanies` (`String[]` — known good-fit reference names)
- standard `createdAt` / `updatedAt`

**`ProspectLead`** — a found company (Phase B)
- `companyName`, `domain` (normalized) **`@unique`**, `website`
- firmographics: `industryTags` (`String[]`), `revenueEstimate`, `employeeEstimate`, `headquarters`
- `segmentId` (FK → matched `TargetSegment`), `score` (Int 1–10), `rationale` (String), `disqualified` (bool)
- `status` enum: `pending` | `added` | `ghost`
- `people` — nested candidate contacts (`ProspectPerson[]` or `Json` — **see Open Q7**): name, title, email, linkedin, source
- provenance: `foundBy` (`String[]` — which sources surfaced it), `sources` (`Json` — raw per-source payloads for audit), `createdBy: "AGENT · CLAUDE"`, `generatedFromSkill`
- conversion: `convertedContactId?`, `convertedDealId?`, `reviewedBy?`, `reviewedAt?`
- standard timestamps

### 4.2 The Fill-Funnel pipeline (Phase C)

```
"Fill Funnel" (partner picks segment(s) + sources + count)
   │
   ├─ Firecrawl  /search + /scrape  ──┐
   └─ Apollo     companies + people ──┤
                                      ▼
                        MERGE by normalized domain     ← cross-reference
                                      │
                        DEDUP vs ProspectLead key       ← skip seen/ghost
                                      │
                        ENRICH each candidate           ← Anthropic web search assists
                        (firmographics + people)
                                      │
                        RATE 1–10 vs matched segment    ← generate() + segment rubric
                        (disqualifiers auto-fail)
                                      │
                        WRITE ProspectLead rows
                        (≥ threshold → pending; below → ghost)
                                      │
                        AuditLog + Activity (per recipe)
```

- Runs **synchronously** in a server action, **capped at N candidates per click** (Vercel function limit 300s; see Open Q2 for N).
- Streams progress to the UI (like the existing `generate()` stream).
- Per-source query building is governed by the two source `SKILL.md` guidelines (D11).

### 4.3 Source guidelines (D11)

Two skill files define *how a segment becomes a query*:
- `skills/lead-discovery-firecrawl/SKILL.md` — how to turn a `TargetSegment` into Firecrawl `/search` queries (keywords, site filters, what to scrape, how to extract firmographics + signals).
- `skills/lead-discovery-apollo/SKILL.md` — how to map segment criteria → Apollo filter payload (industry, headcount, revenue, geo, titles), which endpoints, how to page.

---

## 5. UX surfaces

1. **Targeting page** (new sidebar item) — grid of segment cards; "+ New segment" opens the target builder (same fields for every segment); edit/delete/activate.
2. **AI Found Leads tab** (Pipeline) — **"Fill Funnel"** button opens the run menu (pick segment(s), toggle sources, set count). Below: `pending` lead cards (score badge, segment chip, rationale, candidate people, source provenance) with **Add to funnel** / **Decline**; a collapsed **"Filtered out (N)"** section for ghosts.
3. **Add-to-funnel modal** — pick the primary person, confirm mapping (industry tag → enum), set partner lead → creates Contact + Deal.

---

## 6. Phase plan (build order A → D)

- **Phase A — Targeting (ICP).** `TargetSegment` model + migration, `lib/types.ts` type, the Targeting page + target-builder CRUD, and wiring segments into the AI context. *Foundation; ships standalone.*
- **Phase B — AI Found Leads surface.** `ProspectLead` model (+ nested people) + migration, dedup key, the Pipeline tab, Add-to-funnel + Decline actions (canonical recipe). *Testable with seed/manual data — no agent yet.*
- **Phase C — Discovery + rating pipeline.** The two source `SKILL.md` guidelines, Firecrawl + Apollo clients, the merge→enrich→rate orchestration behind "Fill Funnel", the rating rubric + threshold. *The agent comes alive.*
- **Phase D — Autonomy (later).** Scheduled auto-fill via MCP + cron, partner notifications, run history. *Out of scope for v1.*

---

## 7. Setup / credentials checklist (do before Phase C)

- [ ] Create a **Firecrawl** account → `FIRECRAWL_API_KEY` (add to local `.env` **and** Vercel env). Firecrawl has its **own** key, independent of Anthropic.
- [ ] Create an **Apollo** account → `APOLLO_API_KEY` (+ confirm plan/credit limits — see Open Q5). Add to `.env` + Vercel.
- [x] `ANTHROPIC_API_KEY` — already in `.env` (powers `generate()` reasoning + rating).
- [ ] Schema migrations run via the **session pooler** (`DIRECT_URL`, port 5432) — already wired in `prisma.config.ts` for this IPv4 machine.

---

## 8. Open questions — we resolve these one at a time before building each phase

**Phase A (Targeting)**
- ~~**Q1.** Seed content~~ → **RESOLVED (D13):** pre-seed the 4 beachhead verticals as fully editable starter segments.

**Phase C (pipeline) — the meaty ones**
- ~~**Q2.** Batch cap~~ → **RESOLVED (D18):** time-boxed ~240s run, report count.
- ~~**Q3.** Rating threshold~~ → **RESOLVED (D19):** global default 6; per-segment override is a noted future option.
- ~~**Q4.** Per-run targeting~~ → **RESOLVED (D17):** one segment per run + live searching indicator (D21 `LeadRun`).
- **Q5.** Apollo account tier / credit budget — *informational: Jason to report once the Apollo account exists; drives run volume.*
- ~~**Q6.** People depth~~ → **RESOLVED (D20):** 3–5 people/company, filtered by `buyerPersonas`.
- ~~**Q9.** Guideline style~~ → **RESOLVED (D22):** principles + parameterized templates in each source `SKILL.md`.

> **Phase C is now fully designed.** The only outstanding item is **Q5 (Apollo tier — informational)** and the two API keys. Everything else is locked and ready to build once keys land.
- ~~**Q7.** Nested people storage~~ → **RESOLVED (D14):** `Json` array on `ProspectLead`.
- ~~**Q8.** "Already in pipeline" dedup~~ → **RESOLVED (D15):** add a normalized `domain` field to `Contact`.
- **Q9.** Search-guideline detail: how prescriptive should the Firecrawl/Apollo `SKILL.md`s be (exact query templates vs. principles the model adapts)?

**Phase D (later)**
- **Q10.** Autonomy trigger: weekly cron auto-fill? notification surface (the per-partner "Claude" system chat)?

---

## 9. Discipline guardrails (inherited — do not relitigate)

- **Propose-never-auto-write.** Found leads land as `pending`; nothing enters the funnel without a partner click.
- **One capability, built in phases.** This is Lead Scout — A→B→C is incremental, not a fleet of parallel agents.
- **Every write round-trips** — Artifact / Interaction (on convert) / AuditLog, all in one transaction, tagged `AGENT · CLAUDE`.
