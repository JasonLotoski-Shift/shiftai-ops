# Bulk-Write Scan Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make large contact-scan ingests (5k+ rows) finish reliably by replacing per-contact DB writes with set-based writes, adding a recoverable ingest claim, and showing live progress.

**Architecture:** The Anthropic Message Batch path already works; only the result-ingest changes. `ingestScanResults` collects all verdicts in memory then writes them in 500-row chunks (one `createMany` + one raw `UPDATE … FROM jsonb_to_recordset` per chunk), updating `ScanRun.scoredCount` per chunk. A new nullable `ScanRun.ingestClaimedAt` lets `getScanRunStatus` re-claim a run stuck in `scoring` for >5 minutes and re-run the (idempotent) ingest.

**Tech Stack:** Next.js 15 server actions, Prisma 7 + `@prisma/adapter-pg` (Supabase Postgres), Anthropic Message Batches API, tsx assert-style unit tests.

**Spec:** `docs/superpowers/specs/2026-06-11-scan-ingest-bulk-write-design.md`

**Repo facts the engineer needs:**
- DB is LIVE PROD (shared Supabase). Migrations run locally via the session pooler: `prisma.config.ts` already prefers `DIRECT_URL` (port 5432) for CLI; runtime uses `DATABASE_URL` (port 6543). Just run `npx prisma migrate dev` — no env juggling.
- Unit tests are plain top-level-assert scripts run directly with tsx (see `lib/apollo.test.ts`). `lib/contact-scan.ts` imports `lib/prisma.ts`, which throws at import without `DATABASE_URL` — so run its test with `--env-file=.env`.
- Enum values in the DB are the plain underscored identifiers (`scored`, `decision_maker`) — these enums have no `@map`. Table names are `"ImportedContact"`, `"ScanRun"`, `"ScanResult"`.
- Pre-push checklist (CLAUDE.md): `npx tsc --noEmit` + `npm run build` clean, updates.ts entry for partner-visible changes. Push to `main` auto-deploys.

---

### Task 1: Migration — `ScanRun.ingestClaimedAt`

**Files:**
- Modify: `prisma/schema.prisma` (ScanRun model, ~line 1441)

- [ ] **Step 1: Add the field to the schema**

In `prisma/schema.prisma`, inside `model ScanRun`, directly below the `batchApiId` field:

```prisma
  // Anthropic Message Batches API id (the bulk async path). Null on the inline path.
  batchApiId String?

  // When the current ingest attempt claimed this run (submitted→scoring, or a
  // re-claim of a dead attempt). Bulk ingest takes seconds, so a claim older
  // than INGEST_CLAIM_TTL_MS (5 min, lib/contact-scan.ts) means the serverless
  // invocation died mid-write and the run may be re-claimed and resumed.
  ingestClaimedAt DateTime?
```

- [ ] **Step 2: Run the migration**

Run: `npx prisma migrate dev --name scan_run_ingest_claimed_at`
Expected: one new migration `prisma/migrations/<ts>_scan_run_ingest_claimed_at/migration.sql` containing only `ALTER TABLE "ScanRun" ADD COLUMN "ingestClaimedAt" TIMESTAMP(3);`, applied cleanly, Prisma Client regenerated. (Additive nullable column — safe on the live DB.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(import): add ScanRun.ingestClaimedAt for recoverable scan ingest"
```

---

### Task 2: Pure helpers — `toIngestRows` + `claimExpired` (TDD)

**Files:**
- Modify: `lib/contact-scan.ts`
- Create: `lib/contact-scan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/contact-scan.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  toIngestRows,
  claimExpired,
  INGEST_CLAIM_TTL_MS,
  type ScanVerdict,
} from "@/lib/contact-scan";

// ── toIngestRows ────────────────────────────────────────────────────────────

const contactIds = ["c0", "c1", "c2"];
const v = (index: number, over: Partial<ScanVerdict> = {}): ScanVerdict => ({
  index,
  score: 7,
  leadType: "connector",
  rationale: "fits",
  ...over,
});

// Maps global index → contactId.
{
  const seen = new Set<number>();
  const rows = toIngestRows([v(0), v(2)], contactIds, seen);
  assert.deepEqual(
    rows.map((r) => r.contactId),
    ["c0", "c2"],
  );
  assert.equal(rows[0].score, 7);
  assert.equal(rows[0].leadType, "connector");
}

// Out-of-range index is skipped (no contactId to attach to).
{
  const rows = toIngestRows([v(99)], contactIds, new Set());
  assert.equal(rows.length, 0);
}

// Duplicate index is skipped — including across calls sharing one `seen` set
// (the batch-results stream can repeat an index across entries).
{
  const seen = new Set<number>();
  assert.equal(toIngestRows([v(1), v(1)], contactIds, seen).length, 1);
  assert.equal(toIngestRows([v(1)], contactIds, seen).length, 0);
}

// Rationale is clamped to 400 chars (DB denormalized column budget).
{
  const rows = toIngestRows([v(0, { rationale: "x".repeat(900) })], contactIds, new Set());
  assert.equal(rows[0].rationale.length, 400);
}

// ── claimExpired ────────────────────────────────────────────────────────────

const now = new Date("2026-06-11T12:00:00Z");
// Never claimed → expired (claimable).
assert.equal(claimExpired(null, now), true);
// Fresh claim → not expired.
assert.equal(claimExpired(new Date(now.getTime() - 10_000), now), false);
// Older than the TTL → expired.
assert.equal(claimExpired(new Date(now.getTime() - INGEST_CLAIM_TTL_MS - 1), now), true);
// Exactly at the TTL boundary → not yet expired (strict >).
assert.equal(claimExpired(new Date(now.getTime() - INGEST_CLAIM_TTL_MS), now), false);

console.log("contact-scan.test.ts: all assertions passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --env-file=.env lib/contact-scan.test.ts`
Expected: FAIL — `toIngestRows`, `claimExpired`, `INGEST_CLAIM_TTL_MS` are not exported.

- [ ] **Step 3: Implement the helpers**

In `lib/contact-scan.ts`, below the existing `SCAN_MAX_TOKENS` constant (~line 29), add:

```ts
// Bulk-ingest writes go in chunks of this many verdicts (one createMany + one
// raw UPDATE per chunk; ~25 queries total for a 5k scan instead of ~10,500).
export const INGEST_WRITE_CHUNK = 500;
// A "scoring" claim older than this is a dead invocation (bulk ingest takes
// seconds) — the run may be re-claimed and the idempotent ingest re-run.
export const INGEST_CLAIM_TTL_MS = 5 * 60 * 1000;
```

Below the `ScanVerdict` type (~line 46), add:

```ts
// One verdict resolved to its ImportedContact id, ready to write.
export type IngestRow = {
  contactId: string;
  score: number;
  leadType: ScanVerdict["leadType"];
  rationale: string;
};
```

Below `toScanContacts` (~line 152), add:

```ts
// Resolve batch verdicts (global `index`) to contact ids. `seen` is shared
// across the whole results stream so a repeated index never writes twice.
export function toIngestRows(
  verdicts: ScanVerdict[],
  contactIds: string[],
  seen: Set<number>,
): IngestRow[] {
  const out: IngestRow[] = [];
  for (const v of verdicts) {
    const contactId = contactIds[v.index];
    if (!contactId || seen.has(v.index)) continue;
    seen.add(v.index);
    out.push({
      contactId,
      score: v.score,
      leadType: v.leadType,
      rationale: v.rationale.slice(0, 400),
    });
  }
  return out;
}

export function claimExpired(ingestClaimedAt: Date | null, now = new Date()): boolean {
  return (
    !ingestClaimedAt || now.getTime() - ingestClaimedAt.getTime() > INGEST_CLAIM_TTL_MS
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --env-file=.env lib/contact-scan.test.ts`
Expected: `contact-scan.test.ts: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add lib/contact-scan.ts lib/contact-scan.test.ts
git commit -m "feat(import): pure helpers for bulk scan ingest (toIngestRows, claimExpired)"
```

---

### Task 3: Bulk-write ingest

**Files:**
- Modify: `lib/contact-scan.ts` (`ingestScanResults`, ~lines 248–283)

- [ ] **Step 1: Add `writeResultsBulk`**

In `lib/contact-scan.ts`, directly above `ingestScanResults`, add:

```ts
// Set-based result writes: per 500-row chunk, one createMany (idempotent via
// the (scanRunId, importedContactId) unique key — a batch's verdicts never
// change, so skipping existing rows on re-ingest loses nothing) + one raw
// UPDATE with per-row values (Prisma updateMany can't do that). scoredCount is
// bumped per chunk so the UI poll shows live progress.
async function writeResultsBulk(
  scanRunId: string,
  partnerId: string,
  rows: IngestRow[],
): Promise<number> {
  let written = 0;
  for (const ch of chunk(rows, INGEST_WRITE_CHUNK)) {
    const recordset = JSON.stringify(
      ch.map((r) => ({
        id: r.contactId,
        score: r.score,
        leadType: r.leadType,
        rationale: r.rationale,
      })),
    );
    await prisma.$transaction([
      prisma.scanResult.createMany({
        data: ch.map((r) => ({
          scanRunId,
          importedContactId: r.contactId,
          partnerLeadId: partnerId,
          score: r.score,
          leadType: r.leadType,
          rationale: r.rationale,
        })),
        skipDuplicates: true,
      }),
      prisma.$executeRaw`
        UPDATE "ImportedContact" AS c
        SET "scanStatus"    = 'scored'::"ImportScanStatus",
            "scannedAt"     = now(),
            "scanScore"     = v.score,
            "leadType"      = v."leadType"::"ImportLeadType",
            "scanRationale" = v.rationale
        FROM jsonb_to_recordset(${recordset}::jsonb)
          AS v(id text, score int, "leadType" text, rationale text)
        WHERE c.id = v.id AND c."partnerLeadId" = ${partnerId}`,
    ]);
    written += ch.length;
    await prisma.scanRun
      .update({ where: { id: scanRunId }, data: { scoredCount: written } })
      .catch(() => {});
  }
  return written;
}
```

- [ ] **Step 2: Rework `ingestScanResults` to collect-then-bulk-write**

Replace the body of `ingestScanResults` (keep the signature and doc comment; update the comment to mention re-claim):

```ts
/**
 * Retrieve a finished batch's results and write the report rows. Idempotent:
 * createMany skipDuplicates + the repeatable per-row UPDATE mean a re-claimed
 * run (dead prior attempt) can safely re-ingest from the top.
 */
export async function ingestScanResults(opts: {
  scanRunId: string;
  partnerId: string;
  batchApiId: string;
  contactIds: string[];
}): Promise<void> {
  const { scanRunId, partnerId, batchApiId, contactIds } = opts;
  const client = getAnthropicClient();

  // Collect everything first (a few MB at 5k rows), then write set-based.
  const rows: IngestRow[] = [];
  const seen = new Set<number>();
  try {
    for await (const entry of await client.messages.batches.results(batchApiId)) {
      const result = entry.result;
      if (result.type !== "succeeded") continue;
      rows.push(
        ...toIngestRows(parseScanResults(extractText(result.message)), contactIds, seen),
      );
    }
  } catch (err) {
    console.error(`[contact-scan] batch results read failed for ${batchApiId}:`, err);
  }

  const scored = await writeResultsBulk(scanRunId, partnerId, rows);
  const errored = Math.max(0, contactIds.length - scored);
  await finalizeScan(scanRunId, partnerId, scored, errored, "batch");
}
```

Note: the old per-row `writeResult` stays — the inline path (≤40 rows) still uses it, deliberately unchanged.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Smoke-test the raw SQL against the DB (no-op scope)**

The local `.env` points at the LIVE shared DB — verify the SQL executes (syntax, enum casts, jsonb shape) using a partner id that matches no rows, so nothing mutates:

```bash
cat > /tmp/sql-smoke.ts <<'EOF'
import { prisma } from "/Users/jack/shiftai-ops/lib/prisma";
async function main() {
  const recordset = JSON.stringify([
    { id: "no-such-contact", score: 5, leadType: "connector", rationale: "smoke" },
  ]);
  const n = await prisma.$executeRaw`
    UPDATE "ImportedContact" AS c
    SET "scanStatus"    = 'scored'::"ImportScanStatus",
        "scannedAt"     = now(),
        "scanScore"     = v.score,
        "leadType"      = v."leadType"::"ImportLeadType",
        "scanRationale" = v.rationale
    FROM jsonb_to_recordset(${recordset}::jsonb)
      AS v(id text, score int, "leadType" text, rationale text)
    WHERE c.id = v.id AND c."partnerLeadId" = ${"no-such-partner"}`;
  console.log("rows affected (expect 0):", n);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx --env-file=.env /tmp/sql-smoke.ts
```

Expected: `rows affected (expect 0): 0` — no error, no mutation.

- [ ] **Step 5: Commit**

```bash
git add lib/contact-scan.ts
git commit -m "feat(import): bulk-write batch scan ingest with live scoredCount progress"
```

---

### Task 4: Recoverable claim in `getScanRunStatus`

**Files:**
- Modify: `app/(app)/import/scan-actions.ts`

- [ ] **Step 1: Import the new helpers**

Extend the existing `@/lib/contact-scan` import with `claimExpired` and `INGEST_CLAIM_TTL_MS`:

```ts
import {
  runInlineScan,
  submitBatchScan,
  ingestScanResults,
  claimExpired,
  INLINE_SCAN_THRESHOLD,
  INGEST_CLAIM_TTL_MS,
  SCAN_CHUNK_SIZE,
  type ScanRow,
} from "@/lib/contact-scan";
```

- [ ] **Step 2: Select `ingestClaimedAt` in the run lookup**

In `getScanRunStatus`, add `ingestClaimedAt: true` to the `findFirst` select (alongside `batchApiId`).

- [ ] **Step 3: Add the re-claim branch**

Directly BEFORE the existing early-return
`if (run.status !== "submitted" || !run.batchApiId) { … }`, insert:

```ts
  // Self-heal: a run stuck in "scoring" with an expired (or never-stamped)
  // claim means the prior ingest invocation died mid-write. Re-claim it
  // atomically and re-run the idempotent ingest. On failure we log and leave
  // it in "scoring" — a later poll retries after the TTL; the stale banner
  // (1h) remains the user-facing escape hatch.
  if (run.status === "scoring" && run.batchApiId && claimExpired(run.ingestClaimedAt)) {
    const cutoff = new Date(Date.now() - INGEST_CLAIM_TTL_MS);
    const reclaim = await prisma.scanRun.updateMany({
      where: {
        id: run.id,
        status: "scoring",
        OR: [{ ingestClaimedAt: null }, { ingestClaimedAt: { lt: cutoff } }],
      },
      data: { ingestClaimedAt: new Date() },
    });
    if (reclaim.count === 1) {
      try {
        await ingestScanResults({
          scanRunId: run.id,
          partnerId,
          batchApiId: run.batchApiId,
          contactIds: run.contactIds,
        });
      } catch (err) {
        console.error("[scan-actions] re-claimed ingest failed:", err);
      }
    }
    const fresh = await prisma.scanRun.findFirst({
      where: { id: run.id, partnerLeadId: partnerId },
      select: { status: true, scoredCount: true, errorCount: true },
    });
    return payload(fresh?.status ?? "scoring", (fresh?.scoredCount ?? 0) + (fresh?.errorCount ?? 0));
  }
```

- [ ] **Step 4: Stamp the claim on submitted→scoring, and stop dead-ending on throw**

In the existing claim further down, change the `data` to also stamp the claim time:

```ts
  const claim = await prisma.scanRun.updateMany({
    where: { id: run.id, status: "submitted" },
    data: { status: "scoring", ingestClaimedAt: new Date() },
  });
```

And in its `catch (err)` block, REMOVE the `prisma.scanRun.update(... status: "error" ...)` call, leaving only the log:

```ts
    } catch (err) {
      // Leave the run in "scoring" — the claim expires after the TTL and a
      // later poll re-claims and resumes (the writes are idempotent). The
      // stale banner is the user-facing escape hatch for persistent failure.
      console.error("[scan-actions] ingest failed:", err);
    }
```

(Terminal `error` is still set where it belongs: a failed SUBMIT in `startContactScan`'s `after()` — nothing to resume there.)

- [ ] **Step 5: Type-check + unit tests**

Run: `npx tsc --noEmit && npx tsx --env-file=.env lib/contact-scan.test.ts`
Expected: both clean/pass.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/import/scan-actions.ts"
git commit -m "feat(import): recoverable ingest claim — stuck scans self-heal on poll"
```

---

### Task 5: Updates entry, full verification, push

**Files:**
- Modify: `lib/data/updates.ts`

- [ ] **Step 1: Add the changelog entry**

At the TOP of the `updates` array in `lib/data/updates.ts`:

```ts
  {
    date: "2026-06-11",
    tag: "fixed",
    title: "Big contact scans now finish — and show live progress",
    detail:
      "Scanning a large import (thousands of contacts) used to stall at “scoring” and never produce a report. The results step is now fast and self-healing: if anything interrupts it, the next progress check picks up where it left off. The progress bar also shows real counts while results land. Stuck scans from before this fix will complete on their own the next time you open the Import page.",
  },
```

(How-it-works page: no change — the scan flow partners follow is identical, it just works at scale.)

- [ ] **Step 2: Full pre-push verification**

Run: `npx tsc --noEmit && npm run build && npx tsx --env-file=.env lib/contact-scan.test.ts && npx tsx lib/apollo.test.ts && npx tsx lib/lead-prerank.test.ts && npx tsx lib/lead-pool.test.ts`
Expected: all clean/pass. (If lead-*.test.ts need env, add `--env-file=.env`.)

- [ ] **Step 3: Commit and push**

```bash
git add lib/data/updates.ts
git commit -m "docs(updates): large contact scans finish reliably with live progress"
git push
```

Note: pushes 403 as `nyroseja` — use the Shift-Jack gh token (inline credential helper) per memory. Push to `main` auto-deploys to prod.

- [ ] **Step 4: Confirm deploy**

Watch the Vercel deployment for this commit until it's READY (e.g. `mcp__claude_ai_Vercel__list_deployments` or the dashboard). Expected: build succeeds.

---

### Task 6: Rescue Jay's stuck run (prod, idempotent)

Jay's latest run `cmq9x5cho000704k4irganhwy` (batch `msgbatch_01FaHDzEuNgnVKQ8Jthi9Dqb`, 263/263 succeeded, 1,141/5,260 rows ingested) is stuck in `scoring`. It would self-heal next time Jay opens /import; rescue it now from local so his report is ready. The local `.env` hits the same DB + Anthropic key, and every write is idempotent.

- [ ] **Step 1: Run the rescue script**

```bash
cat > /tmp/rescue-jay.ts <<'EOF'
import { prisma } from "/Users/jack/shiftai-ops/lib/prisma";
import { ingestScanResults, claimExpired, INGEST_CLAIM_TTL_MS } from "/Users/jack/shiftai-ops/lib/contact-scan";

const RUN_ID = "cmq9x5cho000704k4irganhwy";

async function main() {
  const run = await prisma.scanRun.findUnique({
    where: { id: RUN_ID },
    select: { id: true, status: true, batchApiId: true, contactIds: true, partnerLeadId: true, ingestClaimedAt: true, totalCount: true },
  });
  if (!run) throw new Error("run not found");
  if (run.status !== "scoring" || !run.batchApiId) throw new Error(`not rescuable: status=${run.status}`);
  if (!claimExpired(run.ingestClaimedAt)) throw new Error("claim is fresh — another ingest may be live");

  const cutoff = new Date(Date.now() - INGEST_CLAIM_TTL_MS);
  const claim = await prisma.scanRun.updateMany({
    where: { id: run.id, status: "scoring", OR: [{ ingestClaimedAt: null }, { ingestClaimedAt: { lt: cutoff } }] },
    data: { ingestClaimedAt: new Date() },
  });
  if (claim.count !== 1) throw new Error("claim lost the race");

  console.log(`re-ingesting ${run.totalCount} contacts from ${run.batchApiId}…`);
  await ingestScanResults({
    scanRunId: run.id,
    partnerId: run.partnerLeadId,
    batchApiId: run.batchApiId,
    contactIds: run.contactIds,
  });

  const after = await prisma.scanRun.findUnique({
    where: { id: RUN_ID },
    select: { status: true, scoredCount: true, errorCount: true, finishedAt: true },
  });
  console.log("after:", JSON.stringify(after));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx --env-file=.env /tmp/rescue-jay.ts
```

Expected: `after: {"status":"done","scoredCount":<~5260>,"errorCount":<small>,…}` in well under a minute.

- [ ] **Step 2: Verify the report rows**

```bash
cat > /tmp/verify-jay.ts <<'EOF'
import { prisma } from "/Users/jack/shiftai-ops/lib/prisma";
async function main() {
  const results = await prisma.scanResult.count({ where: { scanRunId: "cmq9x5cho000704k4irganhwy" } });
  const scored = await prisma.importedContact.count({
    where: { partnerLeadId: "cmprjyx45000170w8jwpn8v5z", scanStatus: "scored" },
  });
  console.log({ scanResultRows: results, jayScoredContacts: scored });
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx --env-file=.env /tmp/verify-jay.ts
```

Expected: `scanResultRows` ≈ 5,260 (was 1,141); `jayScoredContacts` ≈ 5,260 (was 3,278).

(Jason's stuck 1,349-row run from June 4 self-heals when he next opens /import — no action needed; rescue it the same way only if asked.)
