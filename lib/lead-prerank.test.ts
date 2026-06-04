import assert from "node:assert/strict";
import { prerankScore, prerank } from "@/lib/lead-prerank";

const bands = { revenueMin: 10_000_000, revenueMax: 100_000_000 };

// Tier ordering: positive growth > neutral (missing) > negative growth.
const pos = prerankScore({ headcountGrowth12mo: 0.07 }, bands);
const neutral = prerankScore({}, bands);
const neg = prerankScore({ headcountGrowth12mo: -0.05 }, bands);
assert.ok(pos > neutral, "positive growth beats neutral");
assert.ok(neutral > neg, "neutral beats negative");

// Missing data is exactly neutral (0), never a penalty.
assert.equal(prerankScore({ revenue: undefined, headcountGrowth12mo: undefined }, bands), 0);

// Revenue band only breaks ties (smaller magnitude than growth).
const inBand = prerankScore({ revenue: 37_200_000 }, bands);
const outBand = prerankScore({ revenue: 5_000 }, bands);
assert.ok(inBand > 0 && inBand > outBand, "in-band revenue boosts above out-of-band");
assert.ok(Math.abs(inBand) < Math.abs(pos), "revenue effect is a tiebreak vs growth");

// prerank() sorts descending and is stable on ties (preserves input order).
const sorted = prerank(
  [
    { domain: "shrink.com", headcountGrowth12mo: -0.1 },
    { domain: "blank.com" },
    { domain: "grow.com", headcountGrowth12mo: 0.2 },
  ],
  bands,
);
assert.deepEqual(sorted.map((c) => c.domain), ["grow.com", "blank.com", "shrink.com"]);

console.log("lead-prerank.test.ts PASS");
