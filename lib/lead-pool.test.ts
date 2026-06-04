import assert from "node:assert/strict";
import { isReadmissible, assemblePool } from "@/lib/lead-pool";

const opt = new Date("2026-06-01T00:00:00Z"); // segment.lastOptimizedAt
const before = new Date("2026-05-01T00:00:00Z");
const after = new Date("2026-06-03T00:00:00Z");

const base = {
  domain: "g.com", origin: "discovery", status: "ghost",
  reviewedBy: null as string | null, segmentId: "seg1",
  createdAt: before, updatedAt: before,
};

// Eligible: discovery ghost, never reviewed, created+updated before optimization.
assert.equal(isReadmissible(base, opt), true);
// Imported lead: never re-admitted.
assert.equal(isReadmissible({ ...base, origin: "imported" }, opt), false);
// Partner-declined (reviewedBy set): never re-admitted.
assert.equal(isReadmissible({ ...base, reviewedBy: "Jack" }, opt), false);
// Good lead (pending): not a ghost, not re-admitted.
assert.equal(isReadmissible({ ...base, status: "pending" }, opt), false);
// Already re-scored since optimization (updatedAt after): one look per optimization.
assert.equal(isReadmissible({ ...base, updatedAt: after }, opt), false);
// No optimization yet: nothing re-admitted.
assert.equal(isReadmissible(base, null), false);

// assemblePool: classify fresh Apollo companies against existing rows.
const fresh = [
  { domain: "new.com" }, { domain: "good.com" }, { domain: "declined.com" },
  { domain: "g.com" }, { domain: "incontacts.com" },
];
const existingLeads = [
  { ...base, domain: "good.com", status: "pending" },
  { ...base, domain: "declined.com", status: "ghost", reviewedBy: "Jack" },
  { ...base, domain: "g.com" }, // eligible ghost
];
const contactDomains = ["incontacts.com"];
const res = assemblePool({
  fresh, existingLeads, contactDomains,
  segmentId: "seg1", lastOptimizedAt: opt,
});
assert.deepEqual(res.freshCompanies.map((c) => c.domain), ["new.com"]);
assert.deepEqual(res.readmitLeads.map((l) => l.domain), ["g.com"]);
// g.com appears in fresh AND as eligible ghost -> folded to readmit only (not double).
assert.ok(!res.freshCompanies.some((c) => c.domain === "g.com"));

console.log("lead-pool.test.ts PASS");
