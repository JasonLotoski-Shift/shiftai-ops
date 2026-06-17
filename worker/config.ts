// Worker config + the runaway-cost guardrails (Gate caps).
// All overridable by env so prod (Railway) can tune without a code change.

export const config = {
  // Model for the build/critique reasoning. Default Sonnet for cheap dev runs;
  // the plan recommends an Opus-class model in prod for client-facing quality.
  model: process.env.PROTOTYPE_MODEL || "claude-sonnet-4-6",

  // Gate: stop when the self-score clears the threshold OR we hit the round cap.
  maxIterations: Number(process.env.PROTOTYPE_MAX_ITERATIONS || 5),
  gateThreshold: Number(process.env.PROTOTYPE_GATE_THRESHOLD || 85),

  // Hard SDK backstops (independent of the Gate) so a confused agent can't run away.
  maxTurns: Number(process.env.PROTOTYPE_MAX_TURNS || 80),
  maxBudgetUsd: Number(process.env.PROTOTYPE_MAX_BUDGET_USD || 8),

  // The single file the agent builds and the Eyes tool screenshots.
  prototypeFile: "prototype.html",
};
