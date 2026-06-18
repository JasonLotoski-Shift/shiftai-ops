// Worker config + the runaway-cost guardrails (Gate caps).
// All overridable by env so prod (Railway) can tune without a code change.

export const config = {
  // Build/critique model. Opus by default for client-facing quality; override with PROTOTYPE_MODEL.
  model: process.env.PROTOTYPE_MODEL || "claude-opus-4-8",

  // Gate: stop when the self-score clears the threshold OR we hit the round cap.
  maxIterations: Number(process.env.PROTOTYPE_MAX_ITERATIONS || 5),
  gateThreshold: Number(process.env.PROTOTYPE_GATE_THRESHOLD || 85),

  // Hard SDK backstops (independent of the Gate) so a confused agent can't run away.
  maxTurns: Number(process.env.PROTOTYPE_MAX_TURNS || 80),
  maxBudgetUsd: Number(process.env.PROTOTYPE_MAX_BUDGET_USD || 8),

  // Wall-clock backstop. maxTurns/maxBudgetUsd bound tokens and turns but NOT elapsed
  // time — a stalled stream (e.g. a slow-trickling thinking phase) produces no new turns,
  // so those caps never trip and the run hangs. This aborts the query after the deadline
  // and marks the run errored. Default 20 min; override with PROTOTYPE_MAX_RUN_MS.
  maxRunMs: Number(process.env.PROTOTYPE_MAX_RUN_MS || 20 * 60 * 1000),

  // Extended-thinking budget, in tokens. DEFAULT: undefined = leave the SDK/model default
  // ON — thinking materially helps design quality (proven in a working local run). Set
  // PROTOTYPE_MAX_THINKING_TOKENS to a number to cap it, or 0 to disable, if you hit an
  // environment where the thinking stream trickles (~7 tok/s seen on one machine) and
  // stalls the first turn. The maxRunMs backstop above bounds that stall regardless.
  maxThinkingTokens:
    process.env.PROTOTYPE_MAX_THINKING_TOKENS != null
      ? Number(process.env.PROTOTYPE_MAX_THINKING_TOKENS)
      : undefined,

  // The single file the agent builds and the Eyes tool screenshots.
  prototypeFile: "prototype.html",

  // Proposal-deck builds ride the same worker/loop/gate as the prototype, with
  // their own file name and gate caps. The deck is more templated than a
  // prototype (it renders an approved SOW), so it needs fewer rounds — keep
  // maxIterations low so it doesn't grind. All env-overridable like the rest.
  deck: {
    file: "deck.html",
    maxIterations: Number(process.env.DECK_MAX_ITERATIONS || 3),
    gateThreshold: Number(process.env.DECK_GATE_THRESHOLD || 85),
  },
};

// The build kind a run produces. "prototype" = the interactive HTML demo;
// "deck" = the proposal deck that renders the approved SOW + links the prototype.
export type BuildKind = "prototype" | "deck";
