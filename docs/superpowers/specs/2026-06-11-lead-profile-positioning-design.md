# Lead company picture + positioning brief

**Date:** 2026-06-11
**Status:** Approved approach (Jack, 2026-06-11) — Option A
**Surfaces:** AI Found Leads tab + Promoted Leads tab (cards and the lead detail page `pipeline/leads/[id]`)

## Problem

Opening a company from the AI Found or Promoted leads tabs shows almost nothing
usable: firmographics, a 1–10 score, the "why they fit our segment" rationale,
and people. There is no company picture (description, systems, pain points, key
facts — the profile deals on the board get via "Build the company picture"),
and nothing anywhere in the system that answers the selling questions: how does
this company map to who Shift AI is, what could they need from us, and how do
we position the pitch. The existing promoted-lead "Enrich" only pulls Apollo
firmographics + a raw 2,000-char Firecrawl snippet that is never structured.

## Design (Option A)

### 1. Schema — mirror the Deal company profile onto ProspectLead

Add to `ProspectLead` (all nullable/empty-default; additive migration):

- **Mirrored deal-profile fields:** `linkedinUrl`, `instagramUrl`,
  `companySize`, `founded`, `ownership`, `description`, `subIndustry`,
  `currentSystems String[]`, `painPoints String[]`,
  `companyKeyFacts String[]`, `enrichedAt DateTime?`.
  (`website`, `domain`, `headquarters`, `revenueEstimate`,
  `employeeEstimate` already exist — reuse, do not duplicate. The deal's
  `employeeCount` maps from the lead's existing `employeeEstimate`.)
- **New positioning fields (new to the whole system):**
  - `fitSummary String?` — how this company maps to who Shift AI is and what
    we do (2–4 sentences).
  - `likelyNeeds String[]` — what they plausibly need from us, each grounded
    in an observed system/pain point/fact ("X because Y").
  - `salesAngle String?` — how to open and position the pitch (1–3 sentences).

`lib/types.ts` ProspectLead type updated in parallel.

### 2. New skill — `skills/lead-positioning/SKILL.md`

Input: the firm brain (`skills/_firm/context.md`, auto-included by
`buildSystemBlocks`), the lead's enriched profile (facts, systems, pain
points), segment name, and the existing fit rationale. Output: strict JSON
`{ "fitSummary": string, "likelyNeeds": string[], "salesAngle": string }`.
Rules: ground every claim in a provided fact (no invention); needs phrased as
"what we'd build/run for them", not generic consulting copy; salesAngle must
reference something specific to this company; obey the firm's em-dash ban and
writing rules for client-facing tone (this text is partner-facing but feeds
outreach). No web search in this skill — it reasons over facts the enrichment
pass already gathered.

### 3. One combined enrich pass

Extend `enrichLead` (`lib/lead-enrich.ts`) — the single "Enrich" action,
now available on BOTH origins (discovery + imported), with two new steps after
the existing Apollo/Firecrawl/people/re-rate steps:

- **Step 6 — company picture:** call the existing `enrich-company-web` skill
  (web search ON, same contract as deals: `additions[]` / `conflicts[]`,
  deal field subset). **Auto-apply** with deal-equivalent merge semantics, no
  review UI: additions fill empty scalars and append-dedupe into lists;
  conflicts are resolved conservatively (keep the existing non-empty value,
  drop the proposal). Strip the `(source: domain)` suffix into the stored
  value the same way the deal apply does.
- **Step 7 — positioning:** call the new `lead-positioning` skill with the
  now-enriched profile; persist `fitSummary` / `likelyNeeds` / `salesAngle`.
- Stamp `enrichedAt`. All persisted in the existing single-transaction update.
- `EnrichSummary` return gains `profile: boolean` and `positioning: boolean`
  flags, surfaced in the existing notes/error reporting on the Enrich button.
- Failure isolation matches the existing steps: a failed step 6 or 7 logs a
  note and the rest still persists.

The old behavior (raw `signalsSnippet` buried in `sources.firecrawl`) stays as
provenance; the new structured fields are what the UI renders.

### 4. UI

- **Lead detail page** (`app/(app)/pipeline/leads/[id]/page.tsx`) gains two
  cards in the main column, between the Fit card and Firmographics:
  - **Company picture** — same content layout as the deal profile display
    (description, website + socials, facts grid, key facts / current systems /
    pain points lists). Empty state: "No profile yet — run Enrich."
  - **How we'd sell to them** — fitSummary paragraph, likelyNeeds list,
    salesAngle callout. Empty state mirrors the above.
- **Enrich button moves up a level in usefulness:** available on the lead
  detail page for both origins (today it's only on promoted-lead cards).
  The promoted-card button stays and now runs the same combined pass.
- **Grid cards** (`lead-card.tsx`): one small "profile" indicator when
  `enrichedAt` is set (no layout change otherwise — cards stay brief).
- The cold-email composer (`draftLeadEmail` context) additionally passes
  `fitSummary` / `likelyNeeds` / `salesAngle` to the `cold-outreach` skill
  when present, so drafts can open with the company-specific angle.

### 5. Convert carry-over

`addToFunnel`, `markContactedLeadReplied`, and `sendColdEmail` (the three
lead→Deal creation paths in `app/(app)/pipeline/leads/actions.ts`) copy the
factual profile onto the new Deal's existing fields (`description`,
`linkedinUrl`, `instagramUrl`, `companySize`, `founded`, `ownership`,
`subIndustry`, `currentSystems`, `painPoints`, `companyKeyFacts`,
`employeeCount` ← `employeeEstimate`, plus `enrichedAt`) so nothing is
re-enriched after conversion. Positioning fields stay on the lead (the deal
has no such fields yet; out of scope here).

### Non-changes (deliberate)

- No review/conflict UI for leads (auto-apply; lead records are agent-authored).
- Deal/client enrichment flows untouched.
- No auto-enrich during discovery runs (cost: web-search generate per lead —
  enrich stays a per-lead manual action).
- Grid card layout unchanged beyond the indicator.

## Error handling

- Missing FIRECRAWL/APOLLO/ANTHROPIC keys, credit exhaustion, unresolved
  domains: same per-step notes mechanism `enrichLead` already has; partial
  enrichment persists what succeeded.
- Skill JSON parse failures: skip that step with a note, never block the rest.

## Testing

- Unit (tsx style): the auto-apply merge (fill-empty scalars, append-dedupe
  lists, conflict-keeps-existing, source-suffix strip) as a pure function;
  positioning JSON parse/validation.
- Manual: enrich one real promoted lead and one AI Found lead; verify detail
  cards, card indicator, and a convert carry-over.
- Pre-push checklist: tsc + build (known local env caveats), updates.ts entry,
  How-it-works update (the lead flow gains a step: "Enrich builds the company
  picture and the selling angle").
