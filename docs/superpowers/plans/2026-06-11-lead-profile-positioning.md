# Lead Company Picture + Positioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give AI Found and Promoted leads a real company picture (deal-style profile, web-enriched) plus a new "how we'd sell to them" positioning section, in one combined Enrich pass.

**Architecture:** Mirror the Deal company-profile fields onto `ProspectLead` plus three new positioning fields. Extend `enrichLead` with two steps: `enrich-company-web` (web search, auto-applied via a pure merge helper with deal-equivalent semantics) and a new `lead-positioning` skill. Lead detail page gains two cards; the grid card gains an indicator; the three lead→Deal creation paths carry the profile over.

**Tech Stack:** Next.js 15 server components/actions, Prisma 7 (additive migration on live prod), `lib/ai.ts` `generate()` with skills, Firecrawl/Apollo via existing `lib/lead-enrich.ts`, tsx assert-style unit tests.

**Spec:** `docs/superpowers/specs/2026-06-11-lead-profile-positioning-design.md`

**Repo facts the engineer needs:**
- DB is LIVE PROD. Migrations: just `npx prisma migrate dev --name <name>` (prisma.config.ts routes the CLI through the session pooler via DIRECT_URL). Only additive DDL is acceptable; if migrate proposes anything else, ABORT and report BLOCKED.
- Unit tests are plain top-level-assert tsx scripts (see `lib/contact-scan.test.ts`); run with `npx tsx --env-file=.env <file>` when the module graph touches `lib/prisma.ts`.
- `npm run build` fails locally at `/api/ingest/tally` page-data (missing `GOOGLE_SERVICE_ACCOUNT_KEY_B64`, present on Vercel) and may need `NODE_OPTIONS=--max-old-space-size=6144`. A build that reaches "✓ Compiled successfully" and fails only at that step counts as green.
- `npx tsc --noEmit` must be clean after every task. Commit after every task; end commit messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Key reference files: `lib/lead-enrich.ts` (the enrich engine), `app/(app)/pipeline/[id]/actions.ts:880–1110` (deal enrichment generate/apply — the semantics to mirror), `skills/enrich-company-web/SKILL.md` (the additions/conflicts contract), `components/deal-enrich-panel.tsx:115–183` (the profile display layout to match), `app/(app)/pipeline/leads/[id]/page.tsx` (the detail page), `app/(app)/pipeline/leads/actions.ts` (addToFunnel ~35, draftLeadEmail ~437, markContactedLeadReplied ~579, sendColdEmail ~878).

---

### Task 1: Migration + types — ProspectLead profile & positioning fields

**Files:**
- Modify: `prisma/schema.prisma` (ProspectLead model, ~line 1232)
- Modify: `lib/types.ts` (ProspectLead type, ~line 461)

- [ ] **Step 1: Add fields to the ProspectLead model**

Inside `model ProspectLead`, after the existing `headquarters` field, insert:

```prisma
  // ── Company picture (mirrors the Deal profile; filled by enrich) ──
  linkedinUrl     String?
  instagramUrl    String?
  companySize     String?
  founded         String?
  ownership       String?
  description     String?
  subIndustry     String?
  currentSystems  String[] @default([])
  painPoints      String[] @default([])
  companyKeyFacts String[] @default([])

  // ── Positioning ("how we'd sell to them"; lead-positioning skill) ──
  fitSummary  String?  // how this company maps to who Shift AI is / what we do
  likelyNeeds String[] @default([]) // grounded "X because Y" needs
  salesAngle  String?  // how to open and position the pitch

  // Stamped when the combined enrich pass last built the picture.
  enrichedAt DateTime?
```

(`website`, `domain`, `headquarters`, `revenueEstimate`, `employeeEstimate` already exist — do NOT duplicate. The deal's `employeeCount` concept maps to the lead's existing `employeeEstimate`.)

- [ ] **Step 2: Run the migration**

Run: `npx prisma migrate dev --name prospect_lead_profile_positioning`
Expected: a single migration with only `ALTER TABLE "ProspectLead" ADD COLUMN ...` lines (text/text[]/timestamp, list columns defaulting to `'{}'`), applied cleanly. ABORT (report BLOCKED) if anything else is proposed.

- [ ] **Step 3: Update lib/types.ts**

In the `ProspectLead` type, after the `headquarters` member, add (matching the file's existing optional-property style):

```ts
  // Company picture (mirrors the deal profile; filled by enrich)
  linkedinUrl?: string;
  instagramUrl?: string;
  companySize?: string;
  founded?: string;
  ownership?: string;
  description?: string;
  subIndustry?: string;
  currentSystems?: string[];
  painPoints?: string[];
  companyKeyFacts?: string[];
  // Positioning — how we'd sell to them
  fitSummary?: string;
  likelyNeeds?: string[];
  salesAngle?: string;
  enrichedAt?: string;
```

(Check how the type declares other date fields — match its convention, e.g. `string` ISO vs `Date`.)

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add prisma/schema.prisma prisma/migrations lib/types.ts
git commit -m "feat(leads): ProspectLead company-picture + positioning fields"
```

---

### Task 2: `lead-positioning` skill

**Files:**
- Create: `skills/lead-positioning/SKILL.md`

- [ ] **Step 1: Write the skill**

Create `skills/lead-positioning/SKILL.md` with exactly this content:

```markdown
# Skill — Lead positioning (how we'd sell to them)

Read an enriched prospect-lead company picture, then write the SELLING view:
how this company maps to who Shift AI is and what we do, what they plausibly
need from us, and how to open the pitch. The firm's identity, services, and
hard rules are in the firm context above — ground every claim in it and in the
facts provided. This is partner-facing sales intelligence, and it feeds cold
outreach drafts, so the writing rules apply (bite-sized, fact-based, no em
dashes, no "not X, but Y" phrasing, no storytelling hooks).

## Input you'll get

- **Context block** — the company picture: name, domain/website, industry,
  size/revenue/headcount, headquarters, description, current systems, pain
  points, key facts, the matched target segment (if any), and the existing
  fit rationale ("why they fit our ICP").

## What to produce

Return **only a single JSON object** — no prose, no markdown fences:

```json
{
  "fitSummary": "2–4 sentences: how this company maps to who Shift AI is and what we do. Reference their actual situation (systems, scale, industry), not generic consulting copy.",
  "likelyNeeds": [
    "One plausible need phrased as what we'd build or run for them, each grounded in a provided fact: 'Automated technician scheduling, because dispatch is manual across both facilities.'",
    "2–5 items total."
  ],
  "salesAngle": "1–3 sentences: how to open and position the pitch to THIS company — the specific hook, who it lands with, and the first concrete thing to offer."
}
```

## Hard rules for this task

- **Ground every claim.** Each likelyNeed must trace to a provided fact
  (a system, pain point, key fact, or firmographic). If the picture is thin,
  return fewer items — never invent operations they might have.
- **Shift AI's actual services only.** Propose what the firm context says we
  build and run. No generic strategy-consulting language.
- **Specific beats complete.** One sharp angle beats three vague ones.
- If the picture has too little signal to say anything defensible, return
  `{ "fitSummary": "", "likelyNeeds": [], "salesAngle": "" }`.
```

- [ ] **Step 2: Verify + commit**

Confirm `lib/ai.ts`'s skill loader resolves `skills/<name>/SKILL.md` by name (it does for every other skill — no code change needed). Run `npx tsc --noEmit` (no-op but cheap).

```bash
git add skills/lead-positioning/SKILL.md
git commit -m "feat(skills): lead-positioning — the how-we-sell-to-them brief"
```

---

### Task 3: Pure helpers — `lib/lead-profile.ts` (TDD)

**Files:**
- Create: `lib/lead-profile.ts`
- Create: `lib/lead-profile.test.ts`

This module is the lead-side equivalent of the deal apply logic in
`app/(app)/pipeline/[id]/actions.ts` (read `applyDealCompanyEnrichment` and the
module-private helpers `parseDealEnrichmentJSON`, `coerceEnrichInt`,
`isDealEnrichField` there first — mirror their semantics exactly; copy
`coerceEnrichInt`'s implementation verbatim since it is module-private).

- [ ] **Step 1: Write the failing test** (`lib/lead-profile.test.ts`, tsx assert style)

Cover, with real assertions (write the test FIRST, watch it fail on missing exports):
- `parseEnrichmentJSON`: valid JSON → additions/conflicts arrays; fenced JSON unwraps; junk → empty arrays; non-string/empty values filtered.
- `applyLeadEnrichment(lead, additions)` where `lead` is a plain snapshot object `{website, linkedinUrl, instagramUrl, companySize, headquarters, founded, ownership, description, subIndustry, revenueEstimate, employeeEstimate, currentSystems, painPoints, companyKeyFacts}`:
  - fills an empty scalar (`description`), skips a non-empty one (never overwrite);
  - `employeeCount` addition maps onto `employeeEstimate` (and `revenueEstimate` onto itself), coercing `"220 (source: x)"` → 220 and `"$45M (source: y)"` → 45000000, skipping unparseable values;
  - list additions append with case-insensitive dedupe against existing items;
  - URL fields (`website`, `linkedinUrl`, `instagramUrl`) strip the trailing `(source: ...)` tag;
  - unknown field names are skipped;
  - returns `{data, applied, skipped}` and `data` contains ONLY changed keys (no `domain` key ever — the lead's domain is its unique key and is managed by enrichLead, not the profile apply).
- `parsePositioning`: valid JSON → `{fitSummary, likelyNeeds, salesAngle}` with strings trimmed, likelyNeeds limited to 5 items of non-empty strings; fenced JSON unwraps; junk or all-empty → `null`.

Run: `npx tsx lib/lead-profile.test.ts` → FAIL (module doesn't exist).

- [ ] **Step 2: Implement `lib/lead-profile.ts`**

Pure module (no prisma import — keep it import-light so tests run without env). Export:

```ts
export const LEAD_ENRICH_SCALAR_FIELDS = [
  "website", "companySize", "headquarters", "founded", "ownership",
  "description", "linkedinUrl", "instagramUrl", "subIndustry",
] as const;
export const LEAD_ENRICH_INT_FIELDS = ["revenueEstimate", "employeeCount"] as const;
export const LEAD_ENRICH_LIST_FIELDS = ["companyKeyFacts", "currentSystems", "painPoints"] as const;

export type EnrichAddition = { field: string; value: string };
export type EnrichConflict = { field: string; existing: string; proposed: string; note?: string };
export type LeadProfileSnapshot = { /* the snapshot shape from Step 1 */ };
export type Positioning = { fitSummary: string; likelyNeeds: string[]; salesAngle: string };

export function parseEnrichmentJSON(raw: string): { additions: EnrichAddition[]; conflicts: EnrichConflict[] };
export function applyLeadEnrichment(lead: LeadProfileSnapshot, additions: EnrichAddition[]):
  { data: Record<string, unknown>; applied: number; skipped: number };
export function parsePositioning(raw: string): Positioning | null;
```

Semantics (mirror the deal apply exactly):
- Scalars: set only when currently empty/blank; URL fields strip `\s*\(.*$`.
- Int fields: copy `coerceEnrichInt` from the deal actions verbatim; `employeeCount` writes to the `employeeEstimate` key in `data`; set only when the target is currently null/undefined.
- Lists: case-insensitive dedupe, append; emit the full merged array in `data` only when it grew.
- Never emit a `domain` key.
- JSON parsing: fence-strip then brace-extract then JSON.parse, like `parseRating` in `lib/lead-enrich.ts`.

- [ ] **Step 3: Test passes + tsc + commit**

Run: `npx tsx lib/lead-profile.test.ts` → all assertions pass; `npx tsc --noEmit` → clean.

```bash
git add lib/lead-profile.ts lib/lead-profile.test.ts
git commit -m "feat(leads): pure profile-apply + positioning-parse helpers (TDD)"
```

---

### Task 4: enrichLead — company picture + positioning steps

**Files:**
- Modify: `lib/lead-enrich.ts`

- [ ] **Step 1: Extend `EnrichSummary`**

Add `profile: boolean;` and `positioning: boolean;` members (true when that step produced applied data). Update the early-return object (the unresolved-domain case, ~line 125) with `profile: false, positioning: false`.

- [ ] **Step 2: Add step 6 (company picture) after the re-rate step**

After step 5 (re-rate) and BEFORE the persist transaction, add — using `generate` (already imported), the new `lib/lead-profile` helpers, and the same context shape as `generateDealCompanyEnrichment` (read it at `app/(app)/pipeline/[id]/actions.ts:887` and mirror the ctx lines and intake wording, substituting lead fields; the record framing is "PROSPECT LEAD (pre-pipeline)"):

```ts
  // 6) Company picture: web-search enrichment (deal field subset), auto-applied.
  let profileData: Record<string, unknown> = {};
  let profileApplied = 0;
  try {
    const ctx = buildProfileContext(lead, enrich, domain); // module-private helper, mirrors the deal ctx lines
    const raw = await generate({
      skill: "enrich-company-web",
      context: ctx,
      intake: [
        "Use web search to find public, authoritative facts about this exact company (use the company name, industry tags, and website to disambiguate).",
        "This record is a PROSPECT LEAD (pre-pipeline), so use the deal field set — `field` must be exactly one of:",
        "website, companySize, headquarters, founded, ownership, description, linkedinUrl, instagramUrl, revenueEstimate, employeeCount, subIndustry (single-value); companyKeyFacts, currentSystems, painPoints (lists — one addition per item).",
        "No brandColors. revenueEstimate and employeeCount must be numbers a source actually states.",
        "Propose company-profile additions, citing a source for every fact. Return the JSON object exactly as specified.",
      ].join("\n"),
      webSearch: true,
      maxTokens: 2000,
    });
    const { additions } = parseEnrichmentJSON(raw); // conflicts dropped: keep existing values (conservative)
    const res = applyLeadEnrichment(leadProfileSnapshot(lead), additions);
    profileData = res.data;
    profileApplied = res.applied;
  } catch (err) {
    console.error(`[lead-enrich] company picture failed for ${domain}:`, err);
    notes.push(noteFor("Company picture (web search)", err));
  }
```

`leadProfileSnapshot(lead)` is a small module-private mapper from the Prisma row to `LeadProfileSnapshot`. The conservative conflict rule (keep existing, drop proposal) = simply ignoring `conflicts`.

- [ ] **Step 3: Add step 7 (positioning)**

```ts
  // 7) Positioning — how we'd sell to them. Runs over the now-known picture
  //    (existing fields + this pass's applied additions), no web search.
  let positioning: Positioning | null = null;
  try {
    const ctx = buildPositioningContext(lead, profileData, enrich, signals, segmentName);
    const raw = await generate({
      skill: "lead-positioning",
      context: ctx,
      intake: "Write the selling view for this prospect. Output ONLY the JSON object.",
      maxTokens: 800,
    });
    positioning = parsePositioning(raw);
    if (!positioning) notes.push("Positioning: model returned no usable JSON.");
  } catch (err) {
    console.error(`[lead-enrich] positioning failed for ${domain}:`, err);
    notes.push(noteFor("Positioning (Claude)", err));
  }
```

`buildPositioningContext` assembles: company name/domain, industry tags, firmographics, description/systems/painPoints/keyFacts (existing values overlaid with `profileData`), segment name, and the current fit `rationale`. Reuse the segment already fetched in step 5 where possible (hoist the segment lookup so steps 5 and 7 share it; if no segment, pass "(unmatched)").

- [ ] **Step 4: Persist + summary**

In the existing transaction's `tx.prospectLead.update` data object, spread the new fields:

```ts
        ...profileData,
        ...(positioning && (positioning.fitSummary || positioning.likelyNeeds.length || positioning.salesAngle)
          ? {
              fitSummary: positioning.fitSummary || null,
              likelyNeeds: positioning.likelyNeeds,
              salesAngle: positioning.salesAngle || null,
            }
          : {}),
        enrichedAt: new Date(),
```

Note `website` may be set by BOTH the existing `website: lead.website ?? enrich?.website ?? null` line and `profileData` — keep the existing line and spread `profileData` AFTER it so a web-sourced website wins only when the lead had none (applyLeadEnrichment only fills empty anyway; just ensure the spread order doesn't resurrect `null`). Simplest: spread `...profileData` last among the field lines. Also extend the `writeAudit` changes with `profileApplied` and `positioning: !!positioning`, and return `{ ..., profile: profileApplied > 0, positioning: !!positioning }`.

Update the module header comment: the function now serves BOTH origins (discovery + imported) and builds the company picture + positioning.

- [ ] **Step 5: Verify + commit**

`npx tsc --noEmit` → clean; `npx tsx lib/lead-profile.test.ts` and `npx tsx --env-file=.env lib/contact-scan.test.ts` → pass.

```bash
git add lib/lead-enrich.ts
git commit -m "feat(leads): combined enrich builds the company picture + positioning brief"
```

---

### Task 5: UI — detail-page cards, enrich button, grid indicator

**Files:**
- Create: `components/lead-profile-cards.tsx` (two presentational cards)
- Create: `components/lead-enrich-button.tsx` (client; reuses `enrichPromotedLead`)
- Modify: `app/(app)/pipeline/leads/[id]/page.tsx`
- Modify: `components/lead-card.tsx`
- Possibly modify: whatever type feeds `lead-card.tsx` (add `enrichedAt`)

- [ ] **Step 1: Build the two cards** (`components/lead-profile-cards.tsx`)

Presentational, no state — typed props, rendered from the server page. Match the established Card/Label idiom (`components/ui.tsx`) and mirror the deal profile display layout (`components/deal-enrich-panel.tsx:115–183`): description paragraph; website/LinkedIn/Instagram link row; facts grid (revenue, employees, size, HQ, founded, ownership, sub-industry); three list sections (key facts, current systems, pain points). Export:
- `LeadCompanyPictureCard({ lead })` — empty state: "No company picture yet. Run Enrich to build it from the web."
- `LeadPositioningCard({ lead })` — "How we'd sell to them": fitSummary paragraph; likelyNeeds bullet list; salesAngle in a highlighted callout (Track-Gold accent, consistent with the design tokens). Empty state: "Run Enrich to generate the selling view."

- [ ] **Step 2: Enrich button** (`components/lead-enrich-button.tsx`)

Small client component: button + pending state (`useTransition`), calls `enrichPromotedLead(leadId)` (`app/(app)/pipeline/promoted/enrich-actions.ts` — it already has no origin guard; update its header comment to say it serves both origins). On result, surface `summary.notes` (and the new profile/positioning booleans) the same way the promoted-card enrich does (read `components/promoted-leads.tsx` for the existing result-display pattern and match it). Re-fires `router.refresh()` on success.

- [ ] **Step 3: Wire the detail page**

In `app/(app)/pipeline/leads/[id]/page.tsx`: render `LeadCompanyPictureCard` and `LeadPositioningCard` in the main column between the Fit card and the Firmographics card; put `LeadEnrichButton` in the Company picture card header area (pass it through as a prop or sibling — keep the cards presentational). Ensure the page's Prisma select includes all new fields. Add `export const maxDuration = 300;` to this page if not present (the enrich pass does web-search rounds).

- [ ] **Step 4: Grid-card indicator**

In `components/lead-card.tsx`, next to the sources badges, render a small muted "profile" badge when the lead has `enrichedAt` set. Extend the card's lead prop type with `enrichedAt` and make sure every grid that feeds it (found-leads, promoted-leads, cold-leads — and their server queries) selects/passes it.

- [ ] **Step 5: Verify + commit**

`npx tsc --noEmit` → clean. Visual check is deferred to Task 7's manual verification.

```bash
git add components/lead-profile-cards.tsx components/lead-enrich-button.tsx "app/(app)/pipeline/leads/[id]/page.tsx" components/lead-card.tsx components/found-leads.tsx components/promoted-leads.tsx components/cold-leads.tsx
git commit -m "feat(leads): company-picture + positioning cards, enrich on detail page, grid indicator"
```

(Adjust the `git add` list to the files actually touched.)

---

### Task 6: Convert carry-over + outreach context

**Files:**
- Modify: `app/(app)/pipeline/leads/actions.ts`

- [ ] **Step 1: Shared carry-over helper**

Module-private helper near the top of the file:

```ts
// Profile fields an enriched lead carries onto the Deal it becomes, so the
// deal starts pre-profiled instead of being re-enriched. Positioning fields
// stay on the lead (deals have no positioning fields yet).
function leadProfileDealData(lead: ProspectLeadModel) {
  return {
    website: lead.website ?? undefined,
    domain: lead.domain.includes(".") ? lead.domain : undefined,
    linkedinUrl: lead.linkedinUrl ?? undefined,
    instagramUrl: lead.instagramUrl ?? undefined,
    revenueEstimate: lead.revenueEstimate ?? undefined,
    employeeCount: lead.employeeEstimate ?? undefined,
    companySize: lead.companySize ?? undefined,
    headquarters: lead.headquarters ?? undefined,
    founded: lead.founded ?? undefined,
    ownership: lead.ownership ?? undefined,
    description: lead.description ?? undefined,
    subIndustry: lead.subIndustry ?? undefined,
    companyKeyFacts: lead.companyKeyFacts,
    currentSystems: lead.currentSystems,
    painPoints: lead.painPoints,
    enrichedAt: lead.enrichedAt ?? undefined,
  };
}
```

(Use the Prisma model type the file already uses for leads; match its import convention — `import type { ProspectLead as ProspectLeadModel }` style per CLAUDE.md.)

- [ ] **Step 2: Apply at all three deal-creation sites**

Spread `...leadProfileDealData(lead)` into the `tx.deal.create({ data: { ... } })` calls in `addToFunnel` (~line 89), `markContactedLeadReplied` (~line 579), and `sendColdEmail` (~line 878). Read each site first — the lead variable is in scope in all three; keep explicit fields (company, stage, industry, contactId…) first and the spread after, ensuring no key collision (none of the explicit keys overlap the helper's).

- [ ] **Step 3: Outreach context**

In `draftLeadEmail` (~line 437), extend the `context` array after the rationale block:

```ts
    lead.fitSummary ? `\nHow we fit them (positioning): ${lead.fitSummary}` : null,
    lead.likelyNeeds.length ? `Likely needs: ${lead.likelyNeeds.join("; ")}` : null,
    lead.salesAngle ? `Suggested angle: ${lead.salesAngle}` : null,
```

(Insert as additional array entries — the array already `.filter((l) => l !== null)`s.)

- [ ] **Step 4: Verify + commit**

`npx tsc --noEmit` → clean.

```bash
git add "app/(app)/pipeline/leads/actions.ts"
git commit -m "feat(leads): carry the company picture onto converted deals; positioning feeds cold drafts"
```

---

### Task 7: Docs, verification (NO push — the controller pushes)

**Files:**
- Modify: `lib/data/updates.ts`
- Modify: `components/how-it-works-view.tsx`

- [ ] **Step 1: updates.ts entry** (top of the array, format per the file's docs)

```ts
  {
    date: "2026-06-11",
    tag: "improved",
    title: "Leads now build a real company picture — and tell you how to sell to them",
    detail:
      "Opening an AI Found or Promoted lead used to show a score and a one-line rationale. Enrich now also builds the same company profile deals get (description, systems, pain points, key facts, sourced from the web) plus a new selling view: how they map to what Shift AI does, what they likely need from us, and the angle to open with. Cold email drafts use it, and when a lead joins the pipeline the profile carries onto the deal automatically.",
  },
```

- [ ] **Step 2: How-it-works**

Read `components/how-it-works-view.tsx`, find the lead-flow walkthrough, and update the enrich step to mention: Enrich builds the company picture (web-sourced) and the "how we'd sell to them" view, on both AI Found and Promoted leads; the profile carries to the deal on convert. Match the page's existing tone and structure — small, surgical edit.

- [ ] **Step 3: Full verification**

Run and report exact outcomes:
- `npx tsc --noEmit`
- `NODE_OPTIONS=--max-old-space-size=6144 npm run build` (green = "✓ Compiled successfully"; the `/api/ingest/tally` page-data failure is a known local-env gap)
- `npx tsx lib/lead-profile.test.ts`
- `npx tsx --env-file=.env lib/contact-scan.test.ts`
- `npx tsx lib/apollo.test.ts && npx tsx lib/lead-prerank.test.ts && npx tsx lib/lead-pool.test.ts`

- [ ] **Step 4: Commit (do NOT push)**

```bash
git add lib/data/updates.ts components/how-it-works-view.tsx
git commit -m "docs: lead company picture + positioning in updates and how-it-works"
```

The controller reviews the whole branch state and pushes.
