# Scan ingest: bulk writes, recoverable claim, live progress

**Date:** 2026-06-11
**Status:** Approved (Jack, 2026-06-11)
**Files:** `lib/contact-scan.ts`, `app/(app)/import/scan-actions.ts`, one additive Prisma migration

## Problem

Large contact scans (Jay's 5,260-row LinkedIn import) never finish. Diagnosis from
prod data (Supabase + Anthropic API, 2026-06-11):

- The Anthropic Message Batch side works perfectly — all of Jay's batches ended
  with 263/263 requests succeeded.
- The failure is **result ingest**: `ingestScanResults` writes results one contact
  at a time (2 sequential queries per contact → ~10,500 cross-region round-trips
  for 5,260 contacts). The server action doing the ingest hits the 300s Vercel
  function limit after ~1,200 contacts. Four of Jay's runs died at 1,141 / 1,144 /
  1,202 / 1,205 ScanResult rows.
- After the timeout the run is **permanently stuck**: the `submitted → scoring`
  claim is one-shot, so re-polls never re-ingest. Status sits at "scoring" with
  `scoredCount: 0` until the stale banner appears; the partner dismisses and
  retries, paying for the same batch again. Jay has paid for 5,260 scores four
  times without ever seeing a report.

Root cause is DB write throughput in ingest, **not** AI runtime. The scoring
pipeline (inline ≤40 / Message Batch above) is unchanged by this design.

## Design

### 1. Bulk-write ingest (core fix)

Rework `ingestScanResults` in `lib/contact-scan.ts`:

- Stream all batch results, parse verdicts, and collect them into one in-memory
  array of `{ contactId, score, leadType, rationale }` (rationale clamped to 400
  chars, as today). 5,260 rows is a few MB — fine in memory.
- Write in chunks of **500 verdicts**. Per chunk, in one transaction:
  - `prisma.scanResult.createMany({ data, skipDuplicates: true })` — idempotent
    via the existing `@@unique([scanRunId, importedContactId])`. Safe on
    re-ingest: a given batch's verdicts never change, so skipping existing rows
    loses nothing.
  - One raw SQL statement to update the denormalized contact fields with
    per-row values (Prisma `updateMany` cannot set per-row values):

    ```sql
    UPDATE "ImportedContact" AS c
    SET "scanStatus" = 'scored'::"ImportScanStatus", "scannedAt" = now(),
        "scanScore" = v.score, "leadType" = v."leadType"::"ImportLeadType",
        "scanRationale" = v.rationale
    FROM jsonb_to_recordset($1::jsonb)
      AS v(id text, score int, "leadType" text, rationale text)
    WHERE c.id = v.id AND c."partnerLeadId" = $2
    ```

    The `partnerLeadId` scope is preserved exactly as today's `updateMany`.
- Net effect: ~10,500 queries → ~25. A 5,260-contact ingest finishes in seconds
  at any list size.
- `finalizeScan` (status → done, audit row) is unchanged.

### 2. Live progress

After each 500-row chunk commits, update `ScanRun.scoredCount` (fire-and-forget,
same `.catch(() => {})` pattern as the inline path). The existing 8-second UI
poll then shows real progress instead of 0. `errorCount` stays computed at
finalize (`total − scored`), unchanged. The in-flight Anthropic-phase estimate
in `getScanRunStatus` (`request_counts × SCAN_CHUNK_SIZE`) is unchanged.

### 3. Recoverable claim (self-heal)

- **Migration:** add `ScanRun.ingestClaimedAt DateTime?` — additive, nullable,
  safe on live prod.
- The existing `submitted → scoring` claim also stamps `ingestClaimedAt = now()`.
- New rule in `getScanRunStatus`: a run in `scoring` with a `batchApiId` whose
  `ingestClaimedAt` is **null or older than 5 minutes** may be re-claimed
  (atomic `updateMany` guard with the staleness condition in the WHERE, same
  pattern as the existing claim) and re-ingested. Bulk ingest takes seconds, so
  a 5-minute-old claim means a dead invocation, not a slow one.
- Re-ingest is fully idempotent (skipDuplicates + per-row UPDATE is repeatable).
  No run can get permanently stuck in `scoring` while its batch results are
  still retrievable from Anthropic (29 days).

### 4. Rescue of existing stuck runs

No manual migration of old data:

- The import page already polls the partner's latest non-terminal run. Jay's
  stuck run (`cmq9x5cho…`, batch `msgbatch_01FaHDzEuNgnVKQ8Jthi9Dqb`, fully
  succeeded) re-claims on his first poll after deploy (its `ingestClaimedAt` is
  null) and ingests to completion. Same for Jason's stuck 1,349-row run.
- Older errored/superseded runs stay as-is; the master contact view already
  carries the latest denormalized scores (3,278 of Jay's contacts are scored).

### Non-changes (deliberate)

- The inline path (≤40 rows) keeps per-row writes — small, working, not worth churn.
- `parseScanResults`, chunk size 20, the submit path, and the UI components are untouched.
- Contacts with missing/unparseable verdicts still land in `errorCount` at finalize.

## Error handling

- Ingest dies mid-way → claim expires after 5 min → next poll resumes from
  wherever `skipDuplicates` left off. No lost work, no double-write.
- Batch retrieve/results API errors → same behavior as today (log, finalize
  with errored remainder, or leave for re-claim if the invocation died).

## Testing

- Unit tests (tsx, like the existing contact-scan design intent): verdict
  collection/chunking, idempotent re-ingest semantics, claim-expiry predicate.
- Manual: run the raw UPDATE against the local DB; end-to-end scan on a small
  batch-path list.
- Pre-push checklist: `npx tsc --noEmit`, `npm run build`, updates.ts entry
  ("large contact scans now finish reliably and show progress"). How-it-works
  flow is unchanged (scan UX is the same, it just works at 5k).
