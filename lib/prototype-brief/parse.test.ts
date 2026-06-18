// lib/prototype-brief/parse.test.ts
import assert from "node:assert/strict";
import { parseJsonBlock, decideKickoff } from "@/lib/prototype-brief/parse";
import type { KickoffProposal } from "@/lib/prototype-brief/types";

// parseJsonBlock: bare JSON
const bare = parseJsonBlock<{ a: number }>(`{"a":1}`, ["a"]);
assert.equal(bare.a, 1, "parses bare json");

// parseJsonBlock: fenced JSON
const fenced = parseJsonBlock<{ a: number }>("```json\n{\"a\":2}\n```", ["a"]);
assert.equal(fenced.a, 2, "strips a json fence");

// parseJsonBlock: missing key throws
assert.throws(() => parseJsonBlock(`{"a":1}`, ["b"]), /missing key: b/i, "throws on missing key");

// parseJsonBlock: malformed throws
assert.throws(() => parseJsonBlock(`not json`, ["a"]), /parse/i, "throws on malformed json");

const cand = (id: string, rank: number): KickoffProposal["candidates"][number] => ({
  id, title: id, pain: "p", rationale: "r", rank,
});

// decideKickoff: clear winner → preselect
const clear: KickoffProposal = {
  candidates: [cand("m2", 2), cand("m1", 1)],
  preselectedId: "m1", confidence: "clear", reason: "obvious",
};
const dClear = decideKickoff(clear);
assert.equal(dClear.mode, "preselect", "clear → preselect");
assert.equal(dClear.preselected?.id, "m1", "preselected is the winner");
assert.deepEqual(dClear.options.map((c) => c.id), ["m1", "m2"], "options sorted by rank");

// decideKickoff: torn → ask
const torn: KickoffProposal = {
  candidates: [cand("m1", 1), cand("m2", 1)],
  preselectedId: null, confidence: "torn", reason: "two close",
};
assert.equal(decideKickoff(torn).mode, "ask", "torn → ask");

// decideKickoff: clear but dangling preselectedId → ask (defensive)
const dangling: KickoffProposal = {
  candidates: [cand("m1", 1)], preselectedId: "ghost", confidence: "clear", reason: "x",
};
assert.equal(decideKickoff(dangling).mode, "ask", "clear+dangling id → ask");

console.log("parse.test.ts OK");
