# Import Contacts — Plan & Build Notes

> **Status: built (2026-06-03).** All six phases implemented; `tsc` + `npm run build` clean; pure-logic helpers unit-tested. DB migrated on the shared Supabase. Code not yet pushed to `main` (you control the deploy).

## Context

Each partner has 5,000+ personal contacts (LinkedIn export, Google Contacts export, etc.). This feature lets a partner upload a CSV, see their contacts in a **private** CRM table, run an AI **scan** that ranks every row 1–10 for fit, then push the qualified ones into a **firm-wide** Pipeline list where the existing Apollo + Firecrawl engine enriches them and the convert-to-Contact/Deal/Client flow takes over.

Constraints honored:
- **Cost.** Free work on upload; a *batched* Sonnet scan with cached system prompts (firm context + scan rubric + active segments are all cached, so a 5,000-row scan is a few dollars, not hundreds, and uses the half-price Message Batches API); Apollo email reveals only on hand-picked leads.
- **Privacy.** Imported contacts + scan results are visible only to the importing partner (`partnerLeadId`-scoped on every read). Promoted leads become firm-wide.
- **Name-list vs full-record.** Rows with no company *and* no title are flagged `needs_identification` and skipped by the scan (no spend), enriched on demand.
- **Two-axis scan.** For each contact: does the **company** fit a Target Segment, and is the person a **decision-maker** (direct target) or a senior **connector** who can intro us to one.

## The funnel

```
Upload CSV ─► parse + AI column-map + clean + dedupe + completeness   [FREE]
   ▼ Private CRM table (this partner only)
   ▼ SCAN  ─► AI rates every complete row, batched ~20/call           [CHEAP]
   ▼ Ranked 1–10 · decision_maker | connector | none · matched segment
   ▼ multi-select + "Add to Pipeline Leads"
   ▼ NEW Pipeline sub-tab "Promoted Leads" (FIRM-WIDE)
   ▼ ENRICH (Apollo + Firecrawl) on hand-picked leads only            [CREDITS]
   ▼ existing convert flow → Contact / Deal / Client
```

## Data model (new)

- **ImportBatch** (private) — one per CSV upload: filename, source, columnMapping, counts.
- **ImportedContact** (private) — one per person: identity + `raw` JSON + `completeness` + `dedupeKey` (`@@unique([partnerLeadId, dedupeKey])`) + scan results (`scanScore`, `leadType`, `matchedSegmentId`, `scanRationale`) + promotion state.
- **ScanRun** (private) — one scan pass: status, `batchApiId`, `contactIds` (result-mapping order), `segmentScope`, counts.
- **ProspectLead** (existing, shared) — added `origin` (`discovery` | `imported`), `promotedBy`, and a per-person `roleType` in the `people` JSON. Promoted leads filter `origin = imported` into the new sub-tab; existing rows backfilled to `discovery`.

Brand-new enums use plain underscored values (no `@map`) so Prisma and `lib/types.ts` agree verbatim.

## How it's wired (key files)

- **Privacy gate:** `lib/import-auth.ts` `requirePartner()` — used on every import/scan/promote read.
- **Pure helpers (shared client+server):** `lib/import-shared.ts` — source detection, heuristic column mapping (name matched *exactly* to avoid grabbing "First Name"), `applyMapping`, completeness, dedupeKey.
- **Upload:** `components/import-upload.tsx` (PapaParse in-browser, AI-assisted mapping with editable confirm, 500-row chunked submit) → `app/(app)/import/actions.ts` (`mapColumns`, `createImportBatch`, `importContactsChunk` via `createMany skipDuplicates`, `finalizeImport`).
- **Table:** `components/imported-contacts-table.tsx` — filterable CRM grid, multi-select (only promotable rows), Scan + "Add to Pipeline Leads" buttons, scan-progress polling.
- **Scan:** `skills/contact-scan/SKILL.md` (two-axis rubric, JSON-array output keyed by `index`) + `lib/contact-scan.ts` (inline path for small lists, Message Batches API for large) + `app/(app)/import/scan-actions.ts` (`startContactScan` submits in `after()`; `getScanRunStatus` polls + ingests the batch exactly once via an atomic `submitted→scoring` flip). `lib/ai.ts` gained `buildSystemBlocks` (3 cached blocks: firm + skill + segments) and `getAnthropicClient`.
- **Promote:** `app/(app)/import/promote-actions.ts` — per-row, upserts a ProspectLead by normalized domain (two contacts at the same company merge into one lead with two people), carries `roleType`, marks the source promoted. Name-only / no-domain rows are not promotable.
- **Pipeline sub-tab + enrich:** `components/promoted-leads.tsx` (reuses `LeadCard` → existing `/pipeline/leads/[id]` detail page) + `pipeline-tabs.tsx` (third "Promoted Leads" tab) + `pipeline/page.tsx` (splits leads by origin). `lib/lead-enrich.ts` enriches one lead (Apollo firmographics + Firecrawl signals + find people + reveal one work email, credit-guarded + re-rate) via `app/(app)/pipeline/promoted/enrich-actions.ts`.
- **Discoverability:** sidebar "Import Contacts" tab; `lib/data/updates.ts` changelog; `components/how-it-works-view.tsx` process map.

## Known follow-ups

- **Connector with no known target company (Case B):** such a contact currently promotes as a company-centric lead on their *own* domain. The "use this person as a bridge to find a decision-maker at a fitting company" enrichment branch is a future refinement.
- **Env vars for prod:** scan needs `ANTHROPIC_API_KEY` (set); enrichment needs `APOLLO_API_KEY` + `FIRECRAWL_API_KEY` (add to Vercel). Enrichment fails gracefully without them.
- **Vercel function time on free tier:** the per-lead enrich (synchronous, includes a Firecrawl scrape) may approach the 60s free-tier cap on a slow site; `maxDuration = 300` is set for Pro.

## Verification

- `npx tsc --noEmit` and `npm run build` — clean.
- Pure helpers (LinkedIn/Google mapping, dedupe, completeness, scan-result parsing) — unit-tested (23/23).
- End-to-end (upload → scan → promote → enrich) needs a running dev session + the external keys — not yet run live.
