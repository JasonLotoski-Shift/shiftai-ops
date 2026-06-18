// lib/prototype-brief/chain.test.ts
import assert from "node:assert/strict";
import { runBriefChain } from "@/lib/prototype-brief/chain";
import type { KickoffSeed } from "@/lib/prototype-brief/types";

const seed: KickoffSeed = {
  candidate: { id: "m1", title: "AI Dispatch", pain: "runouts", rationale: "top pain", rank: 1 },
  steer: "lean into the map",
};

const calls: { skill: string; intake: string; model?: string; webSearch?: boolean }[] = [];
const gen = async (input: { skill: string; intake: string; model?: string; webSearch?: boolean }) => {
  calls.push({ skill: input.skill, intake: input.intake, model: input.model, webSearch: input.webSearch });
  if (input.skill === "prototype-brief-directions") {
    return JSON.stringify({
      signal: "SIGNAL_TEXT",
      directions: [{ title: "D1", magicMoment: "click", visualCenterpiece: "map", whyBuyerLeansIn: "x", tabs: ["a"] }],
    });
  }
  if (input.skill === "prototype-brief-redteam") {
    return "```json\n" + JSON.stringify({
      winnerTitle: "D1",
      scores: { magicMoment: 90, exactlyMyWorld: 85, visualSpectacle: 80 },
      sharpened: { title: "D1", magicMoment: "one click", visualCenterpiece: "live map", whyBuyerLeansIn: "x", tabs: ["a"] },
      killed: [],
    }) + "\n```";
  }
  if (input.skill === "prototype-brief") return "FINAL BRIEF MARKDOWN";
  throw new Error("unexpected skill " + input.skill);
};

// Wrapped in an async IIFE (not top-level await) so the file transforms cleanly
// under the repo's CommonJS default — matches the other lib/*.test.ts. A failed
// assert rejects, and the .catch exits non-zero so the test reports failure.
void (async () => {
  const out = await runBriefChain({ context: "CTX", corpusText: "CORPUS", seed, gen });

  assert.equal(out, "FINAL BRIEF MARKDOWN", "returns the commit-stage brief");
  assert.deepEqual(calls.map((c) => c.skill),
    ["prototype-brief-directions", "prototype-brief-redteam", "prototype-brief"], "stage order");
  assert.ok(calls[0].intake.includes("AI Dispatch") && calls[0].intake.includes("lean into the map"),
    "stage 1 receives the seed");
  assert.ok(calls[1].intake.includes("D1"), "stage 2 receives stage 1 directions");
  assert.ok(calls[2].intake.includes("one click") && calls[2].intake.includes("SIGNAL_TEXT"),
    "stage 3 receives the sharpened winner + signal");
  assert.equal(calls[2].webSearch, true, "stage 3 enables brand web search");
  assert.ok(calls.every((c) => c.model === "claude-opus-4-8"), "reasoning stages use Opus");

  console.log("chain.test.ts OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
