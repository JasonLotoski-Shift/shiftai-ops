# Prototype Brief — Staged Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-shot prototype-brief generation with a confidence-aware Stage 0 kickoff plus a three-stage chained engine (interpret&diverge → red-team → commit), so briefs stop coming back bland and surface-level.

**Architecture:** Everything is Home-side (the Vercel app). The build worker is untouched — the brief is still its sole intake, a single markdown string handed to `POST /build`. We add (a) a new Stage 0 server action that reads the deal's discovery report + discussion-call notes and proposes a ranked target with a confidence signal, surfaced as a picker in the existing brief modal; and (b) a rewritten `generatePrototypeBrief` that runs three sequential `generate()` calls, each its own skill with fresh context. Deterministic glue (structured-output parsing, the confidence decision, the chain orchestration) is extracted into pure, unit-tested helpers; the LLM prose quality is covered by an end-to-end eval gate on a real deal.

**Tech Stack:** Next.js 15 App Router server actions, `@/lib/ai` `generate()` (Anthropic SDK), Prisma, repo-versioned skills under `skills/<name>/SKILL.md`, `node:test`-style assertion tests run with `npx tsx`.

**Source spec:** [docs/superpowers/specs/2026-06-17-prototype-brief-staged-engine-design.md](../specs/2026-06-17-prototype-brief-staged-engine-design.md)

## Global Constraints

- **No worker changes.** The brief stays a single markdown string flowing through `savePrototypeBrief` → `startPrototypeBuild` → `POST /build`. Do not touch `worker/` except the one doc-comment edit in Task 7.
- **Skill name `prototype-brief` is preserved** for the final (commit) stage so `Artifact.generatedFromSkill: "prototype-brief"`, the audit action, and `savePrototypeBrief` are unchanged.
- **All three reasoning stages run in one server-action invocation** (3 sequential `generate()` calls). The route already sets `maxDuration` (Vercel Pro, up to 300s); three Opus calls fit.
- **`generate()` signature** (from `lib/ai.ts`): `generate({ skill, context?, intake, model?, maxTokens?, webSearch?, webSearchMaxUses?, images? }): Promise<string>`. Default model is Sonnet 4.6; pass `model: "claude-opus-4-8"` for the reasoning-heavy stages.
- **Weighted quality rubric (verbatim, used by Stage 2 and the eval gate):** (1) **the magic moment** *(leads)* — one interaction where AI visibly does the hard thing the client hates, value in a single click; (2) **"that's exactly my world"** — specifically theirs (roles, data, workflow, words); (3) **visual spectacle** — looks like a premium real product. All three required; weighted in that order. A direction with features but no magic moment fails.
- **Firm writing rules carry into every skill body (copy verbatim from existing skills):** plain language, no banned words; lead with the fact/number; **no negation framing** ("not X, but Y"); no narrative arc / hooks / filler; **no em dashes (—)** anywhere in deliverable text.
- **Never invent facts.** Missing load-bearing facts become a visible `[NEEDS INPUT: <what>]` marker. The server-side `assertNoNeedsInput` gate at save time is the backstop and is unchanged.
- **Visual mandate must align with `skills/_design/principles.md`, not duplicate it.** The brief says *where* visuals carry value per view; principles own *how*. Real Leaflet/OSM maps exist in the build, so a live-map centerpiece is fair game.
- **Tests** are plain `.test.ts` files using `import assert from "node:assert/strict"` with top-level assertions (match `lib/lead-prerank.test.ts`). Run a test with `npx tsx <path>` — it exits non-zero on a failed assert. Typecheck with `npx tsc --noEmit`.

---

## File Structure

- `lib/prototype-brief/types.ts` *(new)* — shared TypeScript types for the staged pipeline (kickoff, directions, red-team).
- `lib/prototype-brief/parse.ts` *(new)* — `parseJsonBlock` (strip fences + validate a model's JSON) and `decideKickoff` (pure confidence decision). The only deterministic logic; fully unit-tested.
- `lib/prototype-brief/parse.test.ts` *(new)* — unit tests for `parseJsonBlock` and `decideKickoff`.
- `lib/prototype-brief/chain.ts` *(new)* — `runBriefChain({ context, corpusText, images, seed, gen })`: the Stage 1→2→3 orchestration, taking `gen` as an injected function so it is unit-testable.
- `lib/prototype-brief/chain.test.ts` *(new)* — unit test of the chain with a fake `gen` (asserts stage order, data hand-off, final return).
- `skills/prototype-kickoff/SKILL.md` *(new)* — Stage 0: read discovery report modules + discussion-call notes → ranked candidates JSON with a confidence verdict.
- `skills/prototype-brief-directions/SKILL.md` *(new)* — Stage 1: interpret the corpus → signal + 2–3 ambitious directions JSON.
- `skills/prototype-brief-redteam/SKILL.md` *(new)* — Stage 2: score directions against the rubric → sharpened winner JSON.
- `skills/prototype-brief/SKILL.md` *(rewrite)* — Stage 3: commit the final reviewable brief markdown, with the two new sections.
- `skills/html-prototype/SKILL.md` *(edit)* — light touch-up to honor the brief's magic-moment + visual-mandate sections.
- `skills/prototype-spec/` *(delete)* — orphaned.
- `app/(app)/pipeline/[id]/prototype-kickoff.ts` *(new)* — `proposePrototypeKickoff(dealId)` server action (Stage 0).
- `app/(app)/pipeline/[id]/proposal-engine.ts` *(modify)* — `generatePrototypeBrief` becomes the chain; signature changes from `{ focus }` to `{ seed }`.
- `worker/loop.ts` *(modify, doc-only)* — `BuildBrief.brief` JSDoc lists the new sections.
- `components/proposal-engine-modal.tsx` *(modify)* — the prototype path renders the Stage 0 picker instead of the free-text focus box.

---

## Task 1: Pipeline types

**Files:**
- Create: `lib/prototype-brief/types.ts`

**Interfaces:**
- Produces: types `KickoffCandidate`, `KickoffProposal`, `KickoffSeed`, `Direction`, `DirectionSet`, `RedTeamVerdict` — consumed by every later task.

- [ ] **Step 1: Write the types file**

```ts
// lib/prototype-brief/types.ts
// Shared types for the staged prototype-brief engine. Each LLM stage returns
// JSON matching one of these; lib/prototype-brief/parse.ts validates the shape.

/** One candidate target for the prototype — a module from the discovery report. */
export type KickoffCandidate = {
  /** Stable slug, e.g. "module-01-ai-dispatch". */
  id: string;
  /** Human title, e.g. "AI Dispatch + Runout Prediction". */
  title: string;
  /** The pain it solves, one line, grounded in the report. */
  pain: string;
  /** Why it ranks where it does (ROI / urgency), one line. */
  rationale: string;
  /** 1 = strongest. Dense rank over the candidates. */
  rank: number;
};

/** Stage 0 output: the ranked field + a confidence verdict on the winner. */
export type KickoffProposal = {
  /** Ranked candidates, 2–6. */
  candidates: KickoffCandidate[];
  /** The inferred winner's id, or null when genuinely torn. */
  preselectedId: string | null;
  /** "clear" = pre-select preselectedId; "torn" = ask the partner. */
  confidence: "clear" | "torn";
  /** One line: why this winner, or why it's torn. */
  reason: string;
};

/** What the partner confirms in the UI and hands to the chain. */
export type KickoffSeed = {
  candidate: KickoffCandidate;
  /** Optional partner nuance ("lean into X", a constraint). */
  steer?: string;
};

/** One ambitious solution direction (Stage 1). */
export type Direction = {
  title: string;
  /** The ONE interaction where AI does the hated hard thing, value in one click. */
  magicMoment: string;
  /** Where visuals carry the value (a live map / board / animated chart / before-after). */
  visualCenterpiece: string;
  /** Why a buyer leans in. */
  whyBuyerLeansIn: string;
  /** The 2–4 tabs this direction implies. */
  tabs: string[];
};

/** Stage 1 output: the interpreted signal + 2–3 directions. */
export type DirectionSet = {
  /** The interpreted signal sheet (markdown): pain in their words, workflow, user, data shape. */
  signal: string;
  directions: Direction[];
};

/** Stage 2 output: the chosen, sharpened winner + why the rest died. */
export type RedTeamVerdict = {
  winnerTitle: string;
  scores: { magicMoment: number; exactlyMyWorld: number; visualSpectacle: number };
  /** The improved winning direction the commit stage builds from. */
  sharpened: Direction;
  killed: { title: string; why: string }[];
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors from the new file).

- [ ] **Step 3: Commit**

```bash
git add lib/prototype-brief/types.ts
git commit -m "feat(prototype-brief): staged-engine pipeline types"
```

---

## Task 2: Structured-output parsing + confidence decision (pure, TDD)

**Files:**
- Create: `lib/prototype-brief/parse.ts`
- Test: `lib/prototype-brief/parse.test.ts`

**Interfaces:**
- Consumes: types from Task 1.
- Produces:
  - `parseJsonBlock<T>(raw: string, requiredKeys: string[]): T` — strips a ```json fence if present, `JSON.parse`s, asserts every key in `requiredKeys` is present at top level, returns the typed object. Throws `Error` with a clear message on malformed JSON or a missing key.
  - `decideKickoff(p: KickoffProposal): { mode: "preselect" | "ask"; preselected?: KickoffCandidate; options: KickoffCandidate[] }` — `options` is always the candidates sorted by `rank`. `mode` is `"preselect"` only when `confidence === "clear"` AND `preselectedId` resolves to a candidate; otherwise `"ask"`. When `preselect`, `preselected` is that candidate.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx lib/prototype-brief/parse.test.ts`
Expected: FAIL — module `@/lib/prototype-brief/parse` not found (or symbol not exported).

- [ ] **Step 3: Write the implementation**

```ts
// lib/prototype-brief/parse.ts
import type { KickoffProposal, KickoffCandidate } from "@/lib/prototype-brief/types";

/** Strip an optional ```json … ``` fence, parse, and assert required top-level keys. */
export function parseJsonBlock<T>(raw: string, requiredKeys: string[]): T {
  const t = raw.trim();
  const m = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  const body = (m ? m[1] : t).trim();
  let obj: unknown;
  try {
    obj = JSON.parse(body);
  } catch (e) {
    throw new Error(`could not parse model JSON: ${e instanceof Error ? e.message : "unknown"}`);
  }
  if (obj === null || typeof obj !== "object") {
    throw new Error("model JSON is not an object");
  }
  for (const k of requiredKeys) {
    if (!(k in (obj as Record<string, unknown>))) {
      throw new Error(`model JSON missing key: ${k}`);
    }
  }
  return obj as T;
}

/** Decide whether to pre-select the inferred winner or ask the partner. */
export function decideKickoff(
  p: KickoffProposal,
): { mode: "preselect" | "ask"; preselected?: KickoffCandidate; options: KickoffCandidate[] } {
  const options = [...p.candidates].sort((a, b) => a.rank - b.rank);
  const preselected = p.preselectedId
    ? options.find((c) => c.id === p.preselectedId)
    : undefined;
  if (p.confidence === "clear" && preselected) {
    return { mode: "preselect", preselected, options };
  }
  return { mode: "ask", options };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx lib/prototype-brief/parse.test.ts`
Expected: PASS — prints `parse.test.ts OK`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add lib/prototype-brief/parse.ts lib/prototype-brief/parse.test.ts
git commit -m "feat(prototype-brief): structured-output parsing + confidence decision"
```

---

## Task 3: Stage 1 skill — interpret & diverge (`prototype-brief-directions`)

**Files:**
- Create: `skills/prototype-brief-directions/SKILL.md`

**Interfaces:**
- Consumes (at runtime, from the chain): `context` (deal Prisma context), `intake` = the confirmed `KickoffSeed` (target + steer) + the full corpus text, `images` = corpus screenshots.
- Produces: a JSON object matching `DirectionSet` (`{ signal: string, directions: Direction[] }`), 2–3 directions. **Return ONLY the JSON** (a ```json fence is acceptable; `parseJsonBlock` strips it).

> **Authoring note (applies to Tasks 3–5):** these skill bodies are prompt prose, not code, so they are not unit-tested here — Task 9 is their eval gate. Use the existing `skills/prototype-brief/SKILL.md` as the style and voice model. Each skill MUST contain: a one-line role, an "Input you'll get" section, a "What to produce" section that pins the **exact output contract** below, the firm writing rules (copy verbatim from the existing skill's "Writing rules" block), and the never-invent rule.

- [ ] **Step 1: Write the skill**

Author `skills/prototype-brief-directions/SKILL.md` so it instructs the model to:

1. **Interpret first.** From the corpus + screenshots, build a `signal` (markdown string): the target pain in the client's **exact words** (quote), the real day-to-day workflow step by step, who the primary user is, the data shape visible in the screenshots, and where the client themselves said AI fits. The chosen target is the seed's `candidate`; the optional `steer` adjusts emphasis only.
2. **Then diverge** into **2–3 ambitious directions** for that target. Each direction MUST name: `magicMoment` (the ONE interaction where AI does the hated hard thing, value in one click), `visualCenterpiece` (where visuals carry the value — a live map / routing board / animated chart / before-after; maps are buildable), `whyBuyerLeansIn`, and `tabs` (2–4). A direction that is a feature list with no magic moment is disallowed — do not emit it.

**Exact output contract** (state this verbatim in the skill's "What to produce"):

> Return ONLY a JSON object, no prose around it:
> ```json
> {
>   "signal": "<markdown: pain in their words (quoted), workflow, primary user, data shape, where they said AI fits>",
>   "directions": [
>     {
>       "title": "<short name>",
>       "magicMoment": "<the one interaction, value in one click>",
>       "visualCenterpiece": "<which view is visually rich and why>",
>       "whyBuyerLeansIn": "<one line>",
>       "tabs": ["<tab>", "<tab>"]
>     }
>   ]
> }
> ```
> 2–3 directions. No banned words, no em dashes, never invent a metric or fact (use `[NEEDS INPUT: …]` inside a string if a load-bearing fact is missing).

- [ ] **Step 2: Verify it parses against the contract**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('skills/prototype-brief-directions/SKILL.md','utf8');if(!/\"signal\"/.test(s)||!/\"directions\"/.test(s)||!/magicMoment/.test(s))throw new Error('skill missing output contract keys');console.log('contract keys present')"`
Expected: prints `contract keys present`.

- [ ] **Step 3: Commit**

```bash
git add skills/prototype-brief-directions/SKILL.md
git commit -m "feat(prototype-brief): Stage 1 skill — interpret & diverge"
```

---

## Task 4: Stage 2 skill — red-team & select (`prototype-brief-redteam`)

**Files:**
- Create: `skills/prototype-brief-redteam/SKILL.md`

**Interfaces:**
- Consumes (from the chain): `intake` = the Stage 1 `DirectionSet` JSON (signal + directions) + the weighted rubric text.
- Produces: a JSON object matching `RedTeamVerdict`. **Return ONLY the JSON.**

- [ ] **Step 1: Write the skill**

Author `skills/prototype-brief-redteam/SKILL.md` so it instructs the model to act as a fresh-context adversary (not invested in defending the draft): score EACH direction against the weighted rubric — **magic moment (lead) → "exactly my world" → visual spectacle**, 0–100 each — and **kill** any that is generic, safe, or has no visual payoff. Pick the survivor, then **sharpen** it: tighten the magic moment to one concrete click, name the exact visual, ground it harder in the client's world. Copy the rubric (from Global Constraints) verbatim into the skill body as the scoring standard.

**Exact output contract** (verbatim in "What to produce"):

> Return ONLY a JSON object:
> ```json
> {
>   "winnerTitle": "<title of the chosen direction>",
>   "scores": { "magicMoment": 0, "exactlyMyWorld": 0, "visualSpectacle": 0 },
>   "sharpened": {
>     "title": "<winner title>",
>     "magicMoment": "<tightened to one concrete click>",
>     "visualCenterpiece": "<the exact visual>",
>     "whyBuyerLeansIn": "<one line>",
>     "tabs": ["<tab>", "<tab>"]
>   },
>   "killed": [{ "title": "<dropped direction>", "why": "<generic/safe/flat>" }]
> }
> ```
> `scores` are the winner's. No banned words, no em dashes.

- [ ] **Step 2: Verify contract keys present**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('skills/prototype-brief-redteam/SKILL.md','utf8');for(const k of ['winnerTitle','sharpened','killed','magicMoment'])if(!s.includes(k))throw new Error('missing '+k);console.log('contract keys present')"`
Expected: prints `contract keys present`.

- [ ] **Step 3: Commit**

```bash
git add skills/prototype-brief-redteam/SKILL.md
git commit -m "feat(prototype-brief): Stage 2 skill — red-team & select"
```

---

## Task 5: Stage 3 skill — commit the brief (rewrite `prototype-brief`)

**Files:**
- Modify: `skills/prototype-brief/SKILL.md` (rewrite)

**Interfaces:**
- Consumes (from the chain): `context` (deal context), `intake` = the Stage 2 `sharpened` winner + the Stage 1 `signal`. `webSearch` is ON for brand colors.
- Produces: the final reviewable **brief markdown** (not JSON) the partner reviews/edits/approves.

- [ ] **Step 1: Rewrite the skill**

Rewrite `skills/prototype-brief/SKILL.md` keeping the existing voice and the firm writing-rules block, but changing its job from "read corpus → brief" to "commit the chosen, sharpened direction into the final brief." It receives the winner + signal, not raw corpus, so it does not re-derive the solution — it writes it up. Keep the existing **Brand direction** resolution (web-search the company's brand colors, primary-first hex with a source note, or `[Shift Edition-06 fallback]` if not confident) and the never-invent / `[NEEDS INPUT]` rule.

The brief sections, in this exact order (the first is **new and leads**, the seventh is **new**):

1. **The magic moment** *(new, leads)* — the ONE interaction where AI does the hated hard thing, value in a single click. State it as the build's primary target. Verbatim guidance to include:
   > Lead the brief with the single interaction that makes the value land: what the user clicks, what AI does, what visibly changes, in one step. This is the #1 thing the build must make work.
2. **The problem** — in the client's own terms, 2–3 sentences, grounded in the signal, quote where it lands.
3. **User stories** — 3–6 lines, `As a <role>, I want <action> so that <outcome>.`
4. **Key features discussed** — short bulleted list, each tied to a user story; mark anything proposed-but-unconfirmed.
5. **Tabs / sections** — the 2–4 views, named, in order; for each, what it shows and why it matters.
6. **Sample data** — realistic, generic-but-plausible shape for this industry; never real client data.
7. **Visual mandate** *(new)* — where visuals carry the value, per view: which view is a live map / routing board / animated chart / before-after, vs. a plain table. Verbatim guidance to include:
   > Name, per view, where visuals do the heavy lifting and which view is a flat table. The build honors design principles for the how; this section decides the where. A live map is buildable when the problem is spatial.
8. **The "after" picture** — the single outcome the prototype makes obvious, and the one screen state that makes the buyer say "yes, that."
9. **Brand direction** — as today.
10. **Rubric self-check** *(new, one line)* — confirm the brief clears all three pillars: magic moment, exactly-my-world, visual spectacle.

Aim ~450–650 words. End the "What to produce" with: return the brief markdown only, no preamble, no code fence.

- [ ] **Step 2: Verify the new sections and order are present**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('skills/prototype-brief/SKILL.md','utf8');for(const k of ['magic moment','Visual mandate','Rubric self-check','Brand direction'])if(!new RegExp(k,'i').test(s))throw new Error('missing section: '+k);if(!/no em dashes/i.test(s))throw new Error('missing writing rules');console.log('brief sections present')"`
Expected: prints `brief sections present`.

- [ ] **Step 3: Commit**

```bash
git add skills/prototype-brief/SKILL.md
git commit -m "feat(prototype-brief): Stage 3 commit skill + magic-moment & visual-mandate sections"
```

---

## Task 6: Stage 0 skill — kickoff proposal (`prototype-kickoff`)

**Files:**
- Create: `skills/prototype-kickoff/SKILL.md`

**Interfaces:**
- Consumes (from the action): `context` (deal context), `intake` = the corpus text (discovery report + discussion-call notes are the load-bearing parts).
- Produces: a JSON object matching `KickoffProposal`. **Return ONLY the JSON.**

- [ ] **Step 1: Write the skill**

Author `skills/prototype-kickoff/SKILL.md` so it instructs the model to: read the discovery report's candidate modules (its "Our thinking" section lists them, each with a pain + rationale) and the discussion-call meeting notes, then reconcile the two. The notes rarely tag a winner in those words, but it is usually obvious — infer it from the report's own lean (cover headline, day-one metric, most-quoted pain) plus where the discussion call spent its weight. If the field is genuinely torn between 2–3 close candidates, set `confidence: "torn"` and `preselectedId: null` — do not fake a pick. Emit ALL candidate modules, ranked.

**Exact output contract** (verbatim in "What to produce"):

> Return ONLY a JSON object:
> ```json
> {
>   "candidates": [
>     { "id": "module-01-...", "title": "...", "pain": "...", "rationale": "...", "rank": 1 }
>   ],
>   "preselectedId": "module-01-..." ,
>   "confidence": "clear",
>   "reason": "<one line: why this winner, or why torn>"
> }
> ```
> `id` is a stable kebab slug. `rank` is dense from 1 (strongest). `preselectedId` is null when `confidence` is "torn". No em dashes. If the deal has no discovery report in the corpus, return a single best-guess candidate built from the call notes with `confidence: "torn"` and a `reason` that says the discovery report was missing.

- [ ] **Step 2: Verify contract keys present**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('skills/prototype-kickoff/SKILL.md','utf8');for(const k of ['candidates','preselectedId','confidence','rank'])if(!s.includes(k))throw new Error('missing '+k);console.log('contract keys present')"`
Expected: prints `contract keys present`.

- [ ] **Step 3: Commit**

```bash
git add skills/prototype-kickoff/SKILL.md
git commit -m "feat(prototype-brief): Stage 0 skill — kickoff proposal"
```

---

## Task 7: Cleanup — html-prototype touch-up, delete prototype-spec, worker doc comment

**Files:**
- Modify: `skills/html-prototype/SKILL.md`
- Delete: `skills/prototype-spec/`
- Modify: `worker/loop.ts` (JSDoc only)

**Interfaces:** none (prose + doc only).

- [ ] **Step 1: Touch up `skills/html-prototype/SKILL.md`**

In the "Input you'll get" / "Intake" description, add two sentences so the build consumes the new brief sections explicitly (keep aligned with `_design/principles.md`, do not restate design rules):
> The brief leads with **the magic moment** — that is the interaction you must make genuinely work and verify with `mcp__eyes__interact`. The brief's **visual mandate** names which views must be visually rich (a live map, board, or animated chart) versus a plain table; honor it, and apply the design principles above for the how.

- [ ] **Step 2: Delete the orphaned spec skill**

Run: `git rm -r skills/prototype-spec`
Expected: removes `skills/prototype-spec/SKILL.md`.

- [ ] **Step 3: Update the worker BuildBrief doc comment**

In `worker/loop.ts`, update the `BuildBrief.brief` JSDoc (currently `problem, user stories, features, tabs, interaction, sample data, brand direction`) to:
```ts
  /** The prototype brief markdown: the magic moment, problem, user stories, features, tabs,
   *  sample data, visual mandate, the "after" picture, brand direction. */
  brief: string;
```

- [ ] **Step 4: Verify**

Run: `node -e "const fs=require('fs');if(fs.existsSync('skills/prototype-spec'))throw new Error('prototype-spec still present');if(!/magic moment/i.test(fs.readFileSync('skills/html-prototype/SKILL.md','utf8')))throw new Error('html-prototype not updated');console.log('cleanup ok')"` then `npx tsc --noEmit`
Expected: prints `cleanup ok`; typecheck passes.

- [ ] **Step 5: Commit**

```bash
git add skills/html-prototype/SKILL.md worker/loop.ts
git rm -r skills/prototype-spec 2>/dev/null; git add -A skills/prototype-spec 2>/dev/null
git commit -m "chore(prototype): html-prototype honors new brief sections; retire prototype-spec"
```

---

## Task 8: Chain orchestration (`runBriefChain`, TDD with injected `gen`)

**Files:**
- Create: `lib/prototype-brief/chain.ts`
- Test: `lib/prototype-brief/chain.test.ts`

**Interfaces:**
- Consumes: types from Task 1, `parseJsonBlock` from Task 2.
- Produces: `runBriefChain(args): Promise<string>` where
  ```ts
  type GenFn = (input: {
    skill: string; context?: string; intake: string;
    model?: string; maxTokens?: number; webSearch?: boolean;
    images?: { base64: string; mediaType: string }[];
  }) => Promise<string>;
  type ChainArgs = {
    context: string;
    corpusText: string;
    images?: { base64: string; mediaType: string }[];
    seed: KickoffSeed;
    gen: GenFn;
  };
  ```
  Runs Stage 1 (`prototype-brief-directions`, Opus, images) → parse `DirectionSet`; Stage 2 (`prototype-brief-redteam`, Opus) with the directions JSON + rubric → parse `RedTeamVerdict`; Stage 3 (`prototype-brief`, Opus, `webSearch:true`) with the winner + signal → return the trimmed brief markdown.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx lib/prototype-brief/chain.test.ts`
Expected: FAIL — `runBriefChain` not found.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx lib/prototype-brief/chain.test.ts`
Expected: PASS — prints `chain.test.ts OK`.

- [ ] **Step 5: Commit**

```bash
git add lib/prototype-brief/chain.ts lib/prototype-brief/chain.test.ts
git commit -m "feat(prototype-brief): Stage 1->2->3 chain orchestration"
```

---

## Task 9: Stage 0 server action (`proposePrototypeKickoff`)

**Files:**
- Create: `app/(app)/pipeline/[id]/prototype-kickoff.ts`

**Interfaces:**
- Consumes: `buildDealContext`, `loadDealDriveFiles` (both already used by `proposal-engine.ts`), `generate`, `parseJsonBlock`, `decideKickoff`, types.
- Produces: `proposePrototypeKickoff(dealId: string): Promise<{ mode: "preselect" | "ask"; preselected?: KickoffCandidate; options: KickoffCandidate[]; reason: string }>`.

- [ ] **Step 1: Write the action**

```ts
// app/(app)/pipeline/[id]/prototype-kickoff.ts
"use server";
// Stage 0 of the staged prototype-brief engine: read the deal's discovery report
// modules + discussion-call notes and propose a ranked target with a confidence
// verdict. The modal pre-selects the winner when obvious, or asks when torn.
import { auth } from "@/auth";
import { generate } from "@/lib/ai";
import { buildDealContext } from "@/lib/deal-context";
import { loadDealDriveFiles } from "@/lib/deal-drive-context";
import { parseJsonBlock, decideKickoff } from "@/lib/prototype-brief/parse";
import type { KickoffProposal, KickoffCandidate } from "@/lib/prototype-brief/types";

export async function proposePrototypeKickoff(
  dealId: string,
): Promise<{
  mode: "preselect" | "ask";
  preselected?: KickoffCandidate;
  options: KickoffCandidate[];
  reason: string;
}> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const { context } = await buildDealContext(dealId);
  const corpus = await loadDealDriveFiles(dealId);

  const intake = [
    "## Deal corpus (discovery report + discussion-call notes are load-bearing)",
    corpus.text || "No readable client files found in the deal's Drive folder.",
  ].join("\n");

  const raw = await generate({ skill: "prototype-kickoff", context, intake, maxTokens: 1500 });
  const proposal = parseJsonBlock<KickoffProposal>(raw, [
    "candidates",
    "preselectedId",
    "confidence",
    "reason",
  ]);

  const decision = decideKickoff(proposal);
  return { ...decision, reason: proposal.reason };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/pipeline/[id]/prototype-kickoff.ts"
git commit -m "feat(prototype-brief): Stage 0 kickoff server action"
```

---

## Task 10: Rewire `generatePrototypeBrief` to the chain

**Files:**
- Modify: `app/(app)/pipeline/[id]/proposal-engine.ts`

**Interfaces:**
- Consumes: `runBriefChain` (Task 8), `KickoffSeed` (Task 1).
- Produces: `generatePrototypeBrief(dealId, { seed: KickoffSeed }): Promise<{ brief: string; manifest: DealDriveManifestEntry[] }>` — same return shape, new input (`seed` instead of `focus`).

- [ ] **Step 1: Replace the function body**

Replace the existing `generatePrototypeBrief` (the block from `export async function generatePrototypeBrief(` through its closing `}`) with:

```ts
// ── 1a. Prototype brief — staged engine: Stage 1->2->3 over the deal corpus ──
// Stage 0 (proposePrototypeKickoff) runs first in the UI and hands back the seed.
export async function generatePrototypeBrief(
  dealId: string,
  input: { seed: KickoffSeed },
): Promise<{ brief: string; manifest: DealDriveManifestEntry[] }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  if (!input.seed?.candidate?.title) throw new Error("Confirm a prototype target first");

  const { context } = await buildDealContext(dealId);
  const corpus = await loadDealDriveFiles(dealId);

  const brief = await runBriefChain({
    context,
    corpusText: corpus.text,
    images: corpus.images.length ? corpus.images : undefined,
    seed: input.seed,
    gen: generate,
  });

  return { brief: brief.trim(), manifest: corpus.manifest };
}
```

- [ ] **Step 2: Add the imports**

At the top of `proposal-engine.ts`, add:
```ts
import { runBriefChain } from "@/lib/prototype-brief/chain";
import type { KickoffSeed } from "@/lib/prototype-brief/types";
```

- [ ] **Step 3: Update the header comment**

Update the file-top comment's "Stage 1 (brief)" description to: `Stage 1 (brief): a Stage 0 kickoff picks the target from the discovery report + discussion notes, then a three-stage chain (interpret&diverge -> red-team -> commit) writes the reviewable brief.`

- [ ] **Step 4: Typecheck (expect the modal to be the only remaining error)**

Run: `npx tsc --noEmit`
Expected: the only errors are in `components/proposal-engine-modal.tsx` (it still calls the old `{ focus }` signature). Those are fixed in Task 11. If any error appears in `proposal-engine.ts` itself, fix it before continuing.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/pipeline/[id]/proposal-engine.ts"
git commit -m "feat(prototype-brief): generatePrototypeBrief runs the staged chain"
```

---

## Task 11: Modal UI — Stage 0 picker (prototype path)

**Files:**
- Modify: `components/proposal-engine-modal.tsx`

**Interfaces:**
- Consumes: `proposePrototypeKickoff` (Task 9), `generatePrototypeBrief` new `{ seed }` signature (Task 10), `KickoffCandidate`/`KickoffSeed` types.

> **Context for the implementer:** this modal serves two flows (`prototype` and `deck`), switched by a `cfg`/`mode`. Only the **prototype** flow changes; the **deck** flow keeps its free-text `focus` box untouched. The modal currently has a `focus` string state and an inputs step that calls `generatePrototypeBrief(dealId, { focus })`. Read the file first; follow its existing component patterns (the `Button`, `Label`, `Textarea`, `useState`, `useTransition` already imported).

- [ ] **Step 1: Add kickoff state and a loader**

Add state near the existing `focus` state:
```tsx
import { proposePrototypeKickoff } from "@/app/(app)/pipeline/[id]/prototype-kickoff";
import type { KickoffCandidate } from "@/lib/prototype-brief/types";
// ...
const [kickoff, setKickoff] = useState<{
  mode: "preselect" | "ask";
  preselected?: KickoffCandidate;
  options: KickoffCandidate[];
  reason: string;
} | null>(null);
const [chosenId, setChosenId] = useState<string | null>(null);
const [steer, setSteer] = useState("");
const [loadingKickoff, setLoadingKickoff] = useState(false);
```

When the modal opens in `prototype` mode, fetch the kickoff once:
```tsx
useEffect(() => {
  if (mode !== "prototype" || kickoff) return;
  setLoadingKickoff(true);
  proposePrototypeKickoff(dealId)
    .then((k) => { setKickoff(k); setChosenId(k.preselected?.id ?? null); })
    .catch(() => setKickoff({ mode: "ask", options: [], reason: "Could not read the discovery report." }))
    .finally(() => setLoadingKickoff(false));
}, [mode, dealId, kickoff]);
```
(Use the modal's actual `mode` variable name; if it is derived from `cfg`, adapt accordingly.)

- [ ] **Step 2: Render the picker (prototype mode only)**

In the inputs step, for `prototype` mode, replace the free-text focus `Textarea` with the picker. Each option is a selectable row showing `title` + `pain` + `rationale`; the pre-selected one is highlighted; when `mode === "ask"` show the `reason` as a prompt ("Two close candidates — pick where to start"). Keep an optional steer `Textarea` (`value={steer}`). Follow the file's existing class conventions:
```tsx
{mode === "prototype" ? (
  <div className="flex flex-col gap-2">
    <Label>Where should the prototype start?{kickoff?.mode === "ask" ? " (pick one)" : ""}</Label>
    {loadingKickoff && <p className="text-[12px] text-bone-mute">Reading the discovery report…</p>}
    {kickoff?.reason && <p className="text-[12px] text-bone-mute">{kickoff.reason}</p>}
    <div className="flex flex-col gap-1.5">
      {kickoff?.options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setChosenId(o.id)}
          className={`rounded-[var(--radius-sm)] border px-2.5 py-2 text-left text-[12px] ${
            chosenId === o.id ? "border-track-gold/70 bg-asphalt" : "border-graphite bg-asphalt/40"
          }`}
        >
          <div className="font-medium text-bone">{o.title}</div>
          <div className="text-bone-mute">{o.pain}</div>
        </button>
      ))}
    </div>
    <Label className="mt-1">Optional steer</Label>
    <Textarea rows={2} placeholder="e.g. lean into the live routing map" value={steer} onChange={(e) => setSteer(e.target.value)} disabled={isGenerating} />
  </div>
) : (
  // existing deck focus box, unchanged
  <>
    <Label>{cfg.focusLabel} <span className="text-flag-red">*</span></Label>
    <Textarea rows={3} placeholder={cfg.focusPlaceholder} value={focus} onChange={(e) => setFocus(e.target.value)} disabled={isGenerating} />
  </>
)}
```

- [ ] **Step 3: Pass the seed to generation**

Where the prototype path calls `generatePrototypeBrief(dealId, { focus })` (two call sites — the inline `runFromInputs` and any retry), replace with the seed built from the chosen candidate:
```tsx
const chosen = kickoff?.options.find((o) => o.id === chosenId);
if (!chosen) throw new Error("Pick where the prototype should start");
const seed = { candidate: chosen, steer: steer.trim() || undefined };
const { brief: out } = await generatePrototypeBrief(dealId, { seed });
```
Update the generate button's disabled guard for the prototype path from `!focus.trim()` to `!chosenId`.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS (no remaining `{ focus }` errors for the prototype path).

- [ ] **Step 5: Commit**

```bash
git add components/proposal-engine-modal.tsx
git commit -m "feat(prototype-brief): Stage 0 kickoff picker in the brief modal"
```

---

## Task 12: End-to-end eval gate (manual verification on a real deal)

**Files:** none (verification only).

> **Why manual:** Tasks 1–11 unit-test the deterministic glue, but the brief's *quality* is an LLM property. This task is the eval that proves the engine actually fixes blandness. Run it against the Pilot Petroleum deal (its discovery report lists Module 01 AI Dispatch as the obvious winner) or any deal with a discovery report + notes in its Drive folder.

- [ ] **Step 1: Build and start**

Run: `npm run build` then `npm run dev`
Expected: clean build; dev server on :3030. (Local build may fail on heap / missing Drive key per the known local quirk; if so, verify against a Vercel preview deploy instead.)

- [ ] **Step 2: Run Stage 0 in the UI**

Open the Pilot deal → Proposal stage → Build prototype. Confirm the picker loads candidate modules, pre-selects the obvious winner (AI Dispatch / Runout) with a `reason`, and that a torn deal would instead ask. Pick the winner, optionally add a steer.

- [ ] **Step 3: Generate and inspect the brief**

Generate. Confirm the returned brief:
  - leads with **The magic moment** (one click, AI does the hated thing),
  - has a **Visual mandate** naming where visuals carry value (a live map is plausible for dispatch),
  - quotes the client's own words in the problem,
  - ends with a **Rubric self-check**,
  - contains no em dashes, no banned words, no leftover `[NEEDS INPUT]` unless a fact is genuinely missing,
  - reads as specifically Pilot's world, not generic.

- [ ] **Step 4: Confirm the save + build handoff still work**

Approve/save the brief. Confirm `savePrototypeBrief` writes the Drive file + Artifact (`generatedFromSkill: "prototype-brief"`) as before, and that starting the build POSTs the brief markdown to the worker unchanged.

- [ ] **Step 5: Record the result**

If the brief is materially sharper than the old one-shot output (magic moment present, visuals specified, tailored), the engine is verified. If it is still bland, note which stage underperformed (directions too safe → tighten Stage 1's ambition prompt; winner weak → tighten Stage 2's kill criteria; brief flat → tighten Stage 3) and iterate the relevant skill body. No code change needed for prose iteration.

---

## Self-Review

**Spec coverage:**
- Stage 0 kickoff (confidence-aware, discovery-report + notes, pre-select/ask) → Tasks 6, 9, 11. ✓
- Three chained stages with fresh context → Tasks 3, 4, 5, 8. ✓
- Weighted rubric (magic moment lead) → Global Constraints + Task 4 + Task 8 `RUBRIC`. ✓
- New brief sections (magic moment leads, visual mandate, rubric self-check) → Task 5. ✓
- Internal-only intermediates (directions/red-team not surfaced) → chain returns only the final brief; nothing persists the intermediates. ✓
- No worker changes; brief stays a single string → Task 10 keeps the return shape; `savePrototypeBrief`/`startPrototypeBuild`/`/build` untouched. ✓
- Align visual mandate with `_design/principles.md`; html-prototype honors new sections → Tasks 5, 7. ✓
- `/refine` not reinvented → not touched anywhere. ✓
- Retire `prototype-spec` → Task 7. ✓
- Doc comments updated → Tasks 7, 10. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; skill-prose tasks carry exact output contracts + verbatim guidance, with Task 12 as their eval (a deliberate, stated adaptation for LLM-prose deliverables, not a placeholder).

**Type consistency:** `KickoffCandidate/KickoffProposal/KickoffSeed/Direction/DirectionSet/RedTeamVerdict` defined in Task 1 and used identically in Tasks 2, 8, 9, 10, 11. `runBriefChain` signature in Task 8 matches its call in Task 10. `proposePrototypeKickoff` return type in Task 9 matches the modal's state shape in Task 11. `parseJsonBlock` required-keys match each skill's emitted top-level keys (Tasks 3/4/6 contracts ↔ Tasks 8/9 parse calls). ✓
