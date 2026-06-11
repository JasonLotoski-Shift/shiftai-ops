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
