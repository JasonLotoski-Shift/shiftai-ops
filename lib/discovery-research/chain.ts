// lib/discovery-research/chain.ts
// The 4-round discovery-questionnaire chain (server-side generate() calls, no
// Railway worker). Mirrors lib/prototype-brief/chain.ts: gen is injected so the
// chain unit-tests with a fake; the raw corpus + screenshots reach ROUND 1 only,
// and rounds 2-4 run on the distilled JSON.
//
//   Round 1  discovery-research (PHASE: map)            research the whole company
//   Round 2  discovery-research (PHASE: call-specific)  5-6 questions on call topics
//   Round 3  discovery-research (PHASE: whole-company)  broad coverage across the map
//   Round 4  discovery-questionnaire                    critique/dedupe/assemble → form
//
// Why a chain: the single-shot version over-indexed on whatever the call covered.
// Splitting research from question-writing lets round 3 deliberately cover the
// functions the call never touched, and round 4 balances the two pools.
//
// Robustness: rounds 1-3 degrade rather than crash (a thin-context deal yields a
// marked questionnaire, matching the single-shot path it replaces). A genuine
// [NEEDS INPUT] raised upstream is force-propagated into the final array so the
// existing save-gate (assertNoNeedsInput) cannot be silently bypassed by the
// dedupe round.

import { parseJsonBlock } from "@/lib/prototype-brief/parse";
import { parseQuestions, type SurveyQuestion } from "@/lib/survey";
import type { BusinessAreaMap, QuestionPool } from "./types";

const OPUS = "claude-opus-4-8";

// Same shape as lib/prototype-brief/chain.ts's GenFn — pass `generate` in prod,
// a fake in the test.
type GenFn = (input: {
  skill: string;
  context?: string;
  intake: string;
  model?: string;
  maxTokens?: number;
  webSearch?: boolean;
  images?: { base64: string; mediaType: string }[];
}) => Promise<string>;

export type DiscoveryChainArgs = {
  context: string; // buildDealContext output — constant across all four rounds
  corpusText: string; // loadDealDriveFiles text — ROUND 1 only
  images?: { base64: string; mediaType: string }[]; // vision — ROUND 1 only
  focus?: string; // partner must-ask areas
  notes?: string; // partner notes
  gen: GenFn;
};

const NEEDS_INPUT_RE = /\[NEEDS INPUT:[^\]]*\]/g;

/** Unique [NEEDS INPUT: …] markers in any intermediate JSON text. */
function collectNeedsInput(text: string): string[] {
  return [...new Set((text.match(NEEDS_INPUT_RE) ?? []).map((s) => s.trim()))];
}

// Marked fallback map for a thin-context deal or a round-1 parse failure, so the
// chain degrades to a [NEEDS INPUT] questionnaire instead of throwing.
function fallbackMap(): BusinessAreaMap {
  return {
    vertical: "[NEEDS INPUT: business vertical]",
    companyShape: "",
    functions: [],
    discussedOnCall: [],
    crossCutting: [],
    openGaps: ["[NEEDS INPUT: discovery-call notes — the research map could not be built]"],
  };
}

// Coerce a possibly-partial model map into a complete one (missing arrays → []).
function normalizeMap(m: Partial<BusinessAreaMap>): BusinessAreaMap {
  return {
    vertical: m.vertical || "[NEEDS INPUT: business vertical]",
    companyShape: m.companyShape || "",
    functions: Array.isArray(m.functions) ? m.functions : [],
    discussedOnCall: Array.isArray(m.discussedOnCall) ? m.discussedOnCall : [],
    crossCutting: Array.isArray(m.crossCutting) ? m.crossCutting : [],
    openGaps: Array.isArray(m.openGaps) ? m.openGaps : [],
  };
}

export async function runDiscoveryChain(args: DiscoveryChainArgs): Promise<SurveyQuestion[]> {
  const { context, corpusText, images, focus, notes, gen } = args;
  const focusLine = focus?.trim() || "(none)";
  const notesLine = notes?.trim() || "(none)";

  // ── Round 1 — RESEARCH the whole company (the only round that reads the raw
  //    corpus + screenshots). Required keys relaxed to vertical+functions; a
  //    parse failure degrades to a marked map rather than aborting the chain. ──
  const r1Intake = [
    "PHASE: map",
    "## Partner focus / must-ask areas",
    focusLine,
    `Notes: ${notesLine}`,
    "",
    "## Files from the deal's Drive folder (call transcripts, notes, docs)",
    corpusText ||
      "No readable client files found — research from the deal context + industry reasoning, and mark anything you cannot ground.",
  ].join("\n");
  let map: BusinessAreaMap;
  try {
    const r1 = await gen({
      skill: "discovery-research",
      context,
      intake: r1Intake,
      model: OPUS,
      maxTokens: 6000,
      images: images && images.length ? images : undefined,
    });
    map = normalizeMap(parseJsonBlock<Partial<BusinessAreaMap>>(r1, ["vertical", "functions"]));
  } catch {
    map = fallbackMap();
  }

  // ── Round 2 — 5-6 questions anchored ONLY to what was discussed on the call ──
  const r2Intake = [
    "PHASE: call-specific",
    "## Partner focus / must-ask areas",
    focusLine,
    "",
    "## Discussed on the call (anchor every question to exactly these)",
    JSON.stringify(map.discussedOnCall, null, 2),
    "",
    "## Relevant function detail from the research map",
    JSON.stringify(map.functions, null, 2),
  ].join("\n");
  let callQs: QuestionPool;
  try {
    const r2 = await gen({ skill: "discovery-research", context, intake: r2Intake, model: OPUS, maxTokens: 3000 });
    callQs = parseJsonBlock<QuestionPool>(r2, ["questions"]);
  } catch {
    callQs = { questions: [] };
  }

  // ── Round 3 — BROAD whole-company coverage across the round-1 map ──
  const r3Intake = [
    "PHASE: whole-company",
    "## Partner focus / must-ask areas",
    focusLine,
    "",
    "## Business-area map (cover the WHOLE company across every function)",
    JSON.stringify(map, null, 2),
    "",
    "## Already covered by the call-specific round (do NOT duplicate these)",
    JSON.stringify(callQs.questions, null, 2),
  ].join("\n");
  let broadQs: QuestionPool;
  try {
    const r3 = await gen({ skill: "discovery-research", context, intake: r3Intake, model: OPUS, maxTokens: 4500 });
    broadQs = parseJsonBlock<QuestionPool>(r3, ["questions"]);
  } catch {
    broadQs = { questions: [] };
  }

  // ── Round 4 — CRITIQUE / DEDUPE / BALANCE / ASSEMBLE → final SurveyQuestion[] ──
  const r4Intake = [
    "## Partner focus / must-ask areas",
    focusLine,
    `Notes: ${notesLine}`,
    "",
    "## Call-specific candidates (round 2 — keep roughly 5-6 of these)",
    JSON.stringify(callQs.questions, null, 2),
    "",
    "## Whole-company candidates (round 3 — the broad coverage; do not let the call crowd these out)",
    JSON.stringify(broadQs.questions, null, 2),
    "",
    "## Business-area map (ground truth for sections + grounding — anything not supported here is invented; cut it)",
    JSON.stringify(map, null, 2),
  ].join("\n");
  const r4 = await gen({ skill: "discovery-questionnaire", context, intake: r4Intake, model: OPUS, maxTokens: 8000 });
  const questions = parseQuestions(r4);

  // ── No-hallucination backstop. The dedupe round can silently drop an upstream
  //    [NEEDS INPUT] rather than faithfully surface it, and the save-gate only
  //    inspects the FINAL labels/options. So any marker the research rounds
  //    raised (in a candidate question or a headline open gap) that did not reach
  //    the final form is appended as a long_text the partner must resolve before
  //    createDiscoveryQuestionnaireForm will create the Tally form. ──
  const upstream =
    JSON.stringify(callQs.questions) + JSON.stringify(broadQs.questions) + JSON.stringify(map.openGaps);
  const finalText = questions.map((q) => `${q.label} ${(q.options ?? []).join(" ")}`).join("\n");
  const unresolved = collectNeedsInput(upstream).filter((m) => !finalText.includes(m));
  for (const marker of unresolved.slice(0, 8)) {
    questions.push({ type: "long_text", label: marker, required: false, section: "To confirm" });
  }

  return questions;
}
