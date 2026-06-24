// lib/discovery-research/chain.test.ts
// Mirrors lib/prototype-brief/chain.test.ts. Run: npx tsx lib/discovery-research/chain.test.ts
// Rounds 1-3 share the discovery-research skill, so the fake gen branches on the
// PHASE marker in the intake (not the skill name) to return the right canned JSON.

import assert from "node:assert/strict";
import { runDiscoveryChain } from "@/lib/discovery-research/chain";

type Img = { base64: string; mediaType: string };
type Call = { skill: string; intake: string; model?: string; images?: Img[] };
const calls: Call[] = [];

const gen = async (input: { skill: string; intake: string; model?: string; images?: Img[] }) => {
  calls.push({ skill: input.skill, intake: input.intake, model: input.model, images: input.images });
  if (input.skill === "discovery-research") {
    if (input.intake.includes("PHASE: map")) {
      return JSON.stringify({
        vertical: "fuel distribution",
        companyShape: "CP",
        functions: [{ function: "operations", whatWeKnow: "S", signals: ["sig"], confidence: "high", gaps: ["G"] }],
        discussedOnCall: ["dispatch", "runouts"],
        crossCutting: ["data re-keyed"],
        openGaps: ["[NEEDS INPUT: annual fuel volume]"],
      });
    }
    if (input.intake.includes("PHASE: call-specific")) {
      return JSON.stringify({
        questions: [
          { section: "Dispatch", intent: "i", draftLabel: "Walk us through dispatch", type: "long_text", function: "operations", groundedIn: "dispatch" },
        ],
      });
    }
    // PHASE: whole-company
    return JSON.stringify({
      questions: [
        { section: "The operation", intent: "i", draftLabel: "How many trucks?", type: "number", function: "operations", groundedIn: "gap" },
      ],
    });
  }
  if (input.skill === "discovery-questionnaire") {
    return '[{"type":"long_text","label":"Final Q","section":"The operation today"}]';
  }
  throw new Error("unexpected skill " + input.skill);
};

void (async () => {
  const out = await runDiscoveryChain({
    context: "CTX",
    corpusText: "CORPUS_TEXT",
    images: [{ base64: "x", mediaType: "image/png" }],
    focus: "ops",
    notes: "n",
    gen,
  });

  // 1. returns the round-4 assembled question.
  assert.ok(out.some((q) => q.label === "Final Q"), "returns the round-4 assembled question");
  // 1b. an unresolved [NEEDS INPUT] from the map is propagated so the save-gate fires.
  assert.ok(
    out.some((q) => q.label.includes("[NEEDS INPUT: annual fuel volume]")),
    "propagates an unresolved [NEEDS INPUT] from upstream so the save-gate can't be bypassed",
  );

  // 2. four rounds in order, sharing the research skill for 1-3.
  assert.deepEqual(
    calls.map((c) => c.skill),
    ["discovery-research", "discovery-research", "discovery-research", "discovery-questionnaire"],
    "round order + skills",
  );
  // 2b. PHASE markers thread rounds 1-3; round 4 (the assembler) carries none.
  assert.deepEqual(
    calls.map((c) => c.intake.match(/PHASE: ([a-z-]+)/)?.[1] ?? null),
    ["map", "call-specific", "whole-company", null],
    "PHASE markers",
  );

  // 3. raw corpus + images reach round 1 only.
  assert.ok(calls[0].intake.includes("CORPUS_TEXT"), "round 1 gets the raw corpus");
  assert.ok(calls[0].images && calls[0].images.length === 1, "round 1 gets the images");
  assert.ok(
    !calls[1].intake.includes("CORPUS_TEXT") && !calls[2].intake.includes("CORPUS_TEXT") && !calls[3].intake.includes("CORPUS_TEXT"),
    "rounds 2-4 run on the distilled map, not the raw corpus",
  );
  assert.ok(calls.slice(1).every((c) => !c.images), "rounds 2-4 get no images");

  // 4. round 2 anchors on the call topics.
  assert.ok(calls[1].intake.includes("dispatch") && calls[1].intake.includes("runouts"), "round 2 receives the call topics");

  // 5. round 3 receives the map AND the round-2 questions (dedupe guard).
  assert.ok(
    calls[2].intake.includes("operations") && calls[2].intake.includes("Walk us through dispatch"),
    "round 3 receives the map + round-2 questions to avoid duplicates",
  );

  // 6. round 4 receives both candidate pools.
  assert.ok(
    calls[3].intake.includes("Walk us through dispatch") && calls[3].intake.includes("How many trucks?"),
    "round 4 receives both candidate pools",
  );

  // 7. every round runs on Opus.
  assert.ok(calls.every((c) => c.model === "claude-opus-4-8"), "every round uses Opus");

  console.log("discovery-research/chain.test.ts OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
