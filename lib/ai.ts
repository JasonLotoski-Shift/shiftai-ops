// generate() — the one helper every Quick Action and agent calls to think.
//
// Composes the call the same way every time:
//   system = skills/_firm/context.md (the firm brain)  +  skills/<skill>/SKILL.md
//   user   = live context (Prisma data)  +  the partner's intake
//
// Then calls the Anthropic API and returns the text. The caller persists the
// result (Artifact [+ Interaction] + AuditLog) per the recipe in
// shiftai-ops/CLAUDE.md "Wire a Quick Action end-to-end".
//
// The two system blocks are stable across calls (the firm brain is shared by
// every skill; a given SKILL.md is identical every time it runs), so both carry
// cache_control — Anthropic prompt caching makes repeat calls cheaper + faster.
//
// Server-only: reads skill files off disk and holds the API key. Never import
// into a client component.

import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { logOps } from "./ops";

// Sonnet by default: these are drafts a partner reviews before sending, volume is
// low (three partners), and Sonnet is the cost/quality sweet spot. Pass model to
// override per call (e.g. "claude-opus-4-8" for a high-stakes proposal).
const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 4096;

const SKILLS_DIR = path.join(process.cwd(), "skills");

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env (dev) and Vercel env (prod).",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

/** The shared Anthropic client — for callers that need the raw API surface the
 *  generate()/generateStream() helpers don't cover (e.g. the Message Batches
 *  API used by the contact scan). Same singleton, same key handling. */
export function getAnthropicClient(): Anthropic {
  return client();
}

/** The default model id, exported so batch callers stamp the same model. */
export const DEFAULT_MODEL_ID = DEFAULT_MODEL;

export type CachedSystemBlock = {
  type: "text";
  text: string;
  cache_control: { type: "ephemeral" };
};

/**
 * Build the cached system prefix used by a Quick Action / scan: the firm brain
 * + a skill's SKILL.md, plus an OPTIONAL third stable block (e.g. the active
 * Target Segments for the contact scan). All three carry cache_control so a
 * fan-out of many requests sharing this prefix pays for it once — the rest read
 * the cache at ~0.1x. The CHANGING per-request data must go in the user message
 * (after this prefix), never inside these blocks, or caching breaks.
 */
export async function buildSystemBlocks(
  skill: string,
  extraCached?: string,
): Promise<CachedSystemBlock[]> {
  const [firmContext, skillContent] = await Promise.all([
    loadFirmContext(),
    loadSkill(skill),
  ]);
  const blocks: CachedSystemBlock[] = [
    { type: "text", text: firmContext, cache_control: { type: "ephemeral" } },
    { type: "text", text: skillContent, cache_control: { type: "ephemeral" } },
  ];
  if (extraCached && extraCached.trim()) {
    blocks.push({ type: "text", text: extraCached, cache_control: { type: "ephemeral" } });
  }
  return blocks;
}

async function loadFirmContext(): Promise<string> {
  return readFile(path.join(SKILLS_DIR, "_firm", "context.md"), "utf8");
}

async function loadSkill(skill: string): Promise<string> {
  // Guard against path traversal — skill names are folder names, nothing else.
  if (!/^[a-z0-9-]+$/.test(skill)) {
    throw new Error(`Invalid skill name: "${skill}"`);
  }
  try {
    return await readFile(path.join(SKILLS_DIR, skill, "SKILL.md"), "utf8");
  } catch {
    throw new Error(`Skill not found: skills/${skill}/SKILL.md`);
  }
}

// Anthropic's native server-side web search tool. When enabled, the model runs
// real web searches mid-turn (billed per search) and returns final text with
// citations — the messages.create call handles the search loop server-side, so
// our text-block extraction below is unchanged. Only the "Enrich from web"
// actions opt in; every existing caller leaves webSearch unset and is untouched.
const WEB_SEARCH_TOOL = { type: "web_search_20250305" as const, name: "web_search" as const };
const DEFAULT_WEB_SEARCH_MAX_USES = 5;

async function buildMessageParams(input: GenerateInput) {
  const [firmContext, skillContent] = await Promise.all([
    loadFirmContext(),
    loadSkill(input.skill),
  ]);

  const userText = input.context
    ? `${input.context}\n\n---\n\n${input.intake}`
    : input.intake;

  return {
    model: input.model ?? DEFAULT_MODEL,
    max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
    // Two cached blocks: the firm brain (reused by every skill) and this
    // skill's instructions (reused every time this skill runs).
    system: [
      { type: "text" as const, text: firmContext, cache_control: { type: "ephemeral" as const } },
      { type: "text" as const, text: skillContent, cache_control: { type: "ephemeral" as const } },
    ],
    messages: [{ role: "user" as const, content: userText }],
    ...(input.webSearch
      ? { tools: [{ ...WEB_SEARCH_TOOL, max_uses: input.webSearchMaxUses ?? DEFAULT_WEB_SEARCH_MAX_USES }] }
      : {}),
  };
}

export type GenerateInput = {
  /** Skill folder name under skills/ — also the value to write to Artifact.generatedFromSkill. */
  skill: string;
  /** Live firm data pulled from Prisma (client + interactions + history). Becomes the head of the user message. */
  context?: string;
  /** The partner's request — intake form text, Task.context, etc. */
  intake: string;
  /** Override the model (default: Sonnet 4.6). e.g. "claude-opus-4-8" for high-stakes work. */
  model?: string;
  maxTokens?: number;
  /** Enable Anthropic's native web_search tool (real external lookups, billed per search). Default off. */
  webSearch?: boolean;
  /** Cap web searches per call when webSearch is on (default 5). */
  webSearchMaxUses?: number;
};

/** One-shot generation. Returns the full text. Logs one OpsEvent per call
 *  (fire-and-forget — never blocks the return) with status, latency, and usage. */
export async function generate(input: GenerateInput): Promise<string> {
  const params = await buildMessageParams(input);
  const t0 = Date.now();
  try {
    const res = await client().messages.create(params);
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    void logOps({
      kind: "claude",
      name: input.skill,
      status: "ok",
      actor: "AGENT · CLAUDE",
      actorLabel: "AGENT · CLAUDE",
      durationMs: Date.now() - t0,
      model: params.model,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      cacheReadTokens: res.usage.cache_read_input_tokens ?? undefined,
      cacheWriteTokens: res.usage.cache_creation_input_tokens ?? undefined,
      meta: { webSearch: !!input.webSearch, maxTokens: params.max_tokens },
    });
    return text;
  } catch (e) {
    void logOps({
      kind: "claude",
      name: input.skill,
      status: "error",
      actor: "AGENT · CLAUDE",
      actorLabel: "AGENT · CLAUDE",
      durationMs: Date.now() - t0,
      model: params.model,
      error: e instanceof Error ? e.message : "generate failed",
    });
    throw e;
  }
}

/** Streaming generation. Yields text deltas as they arrive — for streaming UI. */
export async function* generateStream(
  input: GenerateInput,
): AsyncGenerator<string> {
  const params = await buildMessageParams(input);
  const t0 = Date.now();
  const stream = client().messages.stream(params);
  let errored: unknown = null;
  try {
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  } catch (e) {
    errored = e;
    throw e;
  } finally {
    // Usage is only available after the stream is consumed. Guard finalMessage()
    // — a consumer that abandons the generator early can make it reject; skip the
    // row in that case rather than throw out of a finally.
    try {
      const final = await stream.finalMessage();
      void logOps({
        kind: "claude",
        name: input.skill,
        status: errored ? "error" : "ok",
        actor: "AGENT · CLAUDE",
        actorLabel: "AGENT · CLAUDE",
        durationMs: Date.now() - t0,
        model: params.model,
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
        cacheReadTokens: final.usage.cache_read_input_tokens ?? undefined,
        cacheWriteTokens: final.usage.cache_creation_input_tokens ?? undefined,
        error: errored ? (errored instanceof Error ? errored.message : "stream failed") : null,
        meta: { streamed: true },
      });
    } catch {
      /* stream abandoned before finalMessage — skip telemetry */
    }
  }
}
