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
};

/** One-shot generation. Returns the full text. */
export async function generate(input: GenerateInput): Promise<string> {
  const params = await buildMessageParams(input);
  const res = await client().messages.create(params);
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Streaming generation. Yields text deltas as they arrive — for streaming UI. */
export async function* generateStream(
  input: GenerateInput,
): AsyncGenerator<string> {
  const params = await buildMessageParams(input);
  const stream = client().messages.stream(params);
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}
