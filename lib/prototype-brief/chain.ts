// lib/prototype-brief/chain.ts
import { parseJsonBlock } from "@/lib/prototype-brief/parse";
import type { DirectionSet, RedTeamVerdict, KickoffSeed } from "@/lib/prototype-brief/types";

const OPUS = "claude-opus-4-8";

const RUBRIC = [
  "Weighted rubric, in priority order:",
  "1. The magic moment (leads): one interaction where AI does the hated hard thing, value in one click.",
  "2. That's exactly my world: specifically theirs (roles, data, workflow, words).",
  "3. Visual spectacle: looks like a premium real product.",
  "All three required; a direction with features but no magic moment fails.",
].join("\n");

type GenFn = (input: {
  skill: string;
  context?: string;
  intake: string;
  model?: string;
  maxTokens?: number;
  webSearch?: boolean;
  images?: { base64: string; mediaType: string }[];
}) => Promise<string>;

export type ChainArgs = {
  context: string;
  corpusText: string;
  images?: { base64: string; mediaType: string }[];
  seed: KickoffSeed;
  gen: GenFn;
};

export async function runBriefChain(args: ChainArgs): Promise<string> {
  const { context, corpusText, images, seed, gen } = args;

  // Stage 1 — interpret & diverge.
  const s1Intake = [
    "## Target (chosen in discovery + discussion)",
    `${seed.candidate.title} — ${seed.candidate.pain}`,
    seed.steer ? `Partner steer: ${seed.steer}` : "",
    "",
    "## Client files (the deal's Drive corpus)",
    corpusText || "No readable client files found.",
  ].filter(Boolean).join("\n");

  const s1Raw = await gen({
    skill: "prototype-brief-directions",
    context,
    intake: s1Intake,
    model: OPUS,
    maxTokens: 3000,
    images: images && images.length ? images : undefined,
  });
  const directions = parseJsonBlock<DirectionSet>(s1Raw, ["signal", "directions"]);

  // Stage 2 — red-team & select (fresh context).
  const s2Intake = [
    RUBRIC,
    "",
    "## Signal",
    directions.signal,
    "",
    "## Directions to judge",
    JSON.stringify(directions.directions, null, 2),
  ].join("\n");

  const s2Raw = await gen({
    skill: "prototype-brief-redteam",
    context,
    intake: s2Intake,
    model: OPUS,
    maxTokens: 2500,
  });
  const verdict = parseJsonBlock<RedTeamVerdict>(s2Raw, ["winnerTitle", "sharpened", "killed"]);

  // Stage 3 — commit the brief (brand web search on).
  const s3Intake = [
    "## Winning direction (sharpened)",
    JSON.stringify(verdict.sharpened, null, 2),
    "",
    "## Signal",
    directions.signal,
  ].join("\n");

  const brief = await gen({
    skill: "prototype-brief",
    context,
    intake: s3Intake,
    model: OPUS,
    maxTokens: 4000,
    webSearch: true,
  });

  return brief.trim();
}
