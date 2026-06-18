// GATE — decides when a build is "satisfied" and caps runaway loops.
// An in-process SDK MCP server with one tool, `score`. The agent submits an honest
// self-assessment; the gate returns the round number and a STOP/CONTINUE verdict.
// `history` is exposed so the loop can report the run after it finishes.
//
// The gate is rubric-driven so prototype and deck builds share it: each kind passes
// its own RUBRIC (dimensions + weights + floors). The prototype rubric is unchanged
// from before this generalization, so the prototype path scores identically.
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

export type GateRecord = {
  round: number;
  // Dimension key -> 0–100 self-score. Keys depend on the rubric (prototype:
  // structure/fidelity/design/interactivity; deck: clarity/completeness/design/onbrand).
  scores: Record<string, number>;
  overall: number;
  summary: string;
  remainingIssues: string[];
  satisfied: boolean;
  stop: boolean;
  // The HTML + screenshot the agent was looking at when it scored this round
  // (from Eyes). Used by the loop to persist each round to Storage + the DB.
  screenshotPath: string | null;
  htmlPath: string | null;
};

export type RubricDimension = {
  key: string;
  weight: number; // weights across a rubric sum to 1
  critical?: boolean; // must clear the rubric's criticalFloor, not just the base floor
  describe: string; // shown to the agent in the score tool's input schema
};

export type Rubric = {
  dimensions: RubricDimension[];
  baseFloor: number; // every dimension must clear this
  criticalFloor: number; // critical dimensions must clear this higher bar
};

// Prototype rubric — judged first as a believable DEMO: the key interaction working
// (interactivity) and matching what was discussed (fidelity) carry the most, design is
// close behind (client-facing), structure is the table-stakes baseline. Weights +
// floors are identical to the pre-generalization gate, so the prototype path is unchanged.
export const PROTOTYPE_RUBRIC: Rubric = {
  dimensions: [
    { key: "structure", weight: 0.2, describe: "are the right tabs/sections present and laid out like a real product?" },
    { key: "fidelity", weight: 0.3, critical: true, describe: "how well does it match the brief's features, user stories, and sample-data shape?" },
    { key: "design", weight: 0.25, describe: "visual quality: hierarchy, spacing, color, density, on-brand" },
    { key: "interactivity", weight: 0.25, critical: true, describe: "do the key interaction(s) actually work in the DOM?" },
  ],
  baseFloor: 60,
  criticalFloor: 75,
};

// Deck rubric — judged as a client-facing proposal. It must read clearly (clarity) and
// carry every scope section including the wired demo link (completeness); design and
// on-brand follow. No interactivity axis — a deck is long-scroll, not an app.
export const DECK_RUBRIC: Rubric = {
  dimensions: [
    { key: "clarity", weight: 0.3, critical: true, describe: "does it read clearly and lead with facts? plain, skimmable, on-voice, no banned words" },
    { key: "completeness", weight: 0.3, critical: true, describe: "are all scope sections present (what we'll build, foundation, ownership, scope in/out, what-we-need, timeline, investment) AND the Demo-prototype button wired to the real URL?" },
    { key: "design", weight: 0.25, describe: "visual quality: hierarchy, spacing, color, density, Edition-06 on-brand" },
    { key: "onbrand", weight: 0.15, describe: "palette, type, and tone match the firm's Edition-06 house style" },
  ],
  baseFloor: 60,
  criticalFloor: 75,
};

export function createGateServer(opts: {
  rubric: Rubric;
  maxIterations: number;
  threshold: number;
  // Optional: where this run's round numbering should start. A partner-refine pass
  // resumes the session and continues from the auto-loop's last round, so it passes
  // the prior max round here (the refine round becomes maxRound + 1, not 1).
  roundOffset?: number;
  // Optional: what the agent is currently looking at (Eyes' last screenshot/HTML),
  // captured onto each record so the loop can persist the round afterwards.
  currentArtifacts?: () => { screenshotPath: string | null; htmlPath: string | null };
  // Optional: fires inside the score handler after the record is built, so each
  // round's iteration is written live as it scores (not batched post-loop).
  onRound?: (rec: GateRecord) => Promise<void>;
}) {
  const history: GateRecord[] = [];
  const { rubric } = opts;

  // Build the score tool's input schema from the rubric: one 0–100 number per
  // dimension, plus the summary + open-issues fields every kind shares. Typed as a
  // mutable Record (ZodRawShape is read-only) so the dimension keys can be added.
  const shape: Record<string, z.ZodTypeAny> = {
    summary: z.string().describe("one line: the single biggest thing to fix next, or 'done' if finished"),
    remaining_issues: z.array(z.string()).optional().describe("concrete issues still open"),
  };
  for (const d of rubric.dimensions) {
    shape[d.key] = z.number().min(0).max(100).describe(d.describe);
  }

  const server = createSdkMcpServer({
    name: "gate",
    version: "1.0.0",
    // Keep the tool in-context (never deferred behind ToolSearch) — there's only one.
    alwaysLoad: true,
    tools: [
      tool(
        "score",
        "Submit an honest self-assessment of the CURRENT build after looking at the latest screenshot. Returns the round number and whether to STOP or CONTINUE. The gate enforces a hard cap on rounds, so improve fast.",
        shape,
        async (rawArgs) => {
          const args = rawArgs as unknown as Record<string, number> & { summary: string; remaining_issues?: string[] };
          const round = (opts.roundOffset ?? 0) + history.length + 1;

          const scores: Record<string, number> = {};
          let overallRaw = 0;
          for (const d of rubric.dimensions) {
            const v = Number(args[d.key] ?? 0);
            scores[d.key] = v;
            overallRaw += v * d.weight;
          }
          const overall = Math.round(overallRaw);

          // Floor failures block "satisfied" even at a high overall — a high average
          // must not paper over a fatal weakness in a critical dimension.
          const floorFailures: string[] = [];
          for (const d of rubric.dimensions) {
            const floor = d.critical ? rubric.criticalFloor : rubric.baseFloor;
            if (scores[d.key] < floor) {
              floorFailures.push(
                d.critical
                  ? `${d.key} ${scores[d.key]} < ${floor} (a critical dimension — it must actually clear this)`
                  : `${d.key} ${scores[d.key]} < ${floor}`,
              );
            }
          }

          const satisfied = overall >= opts.threshold && floorFailures.length === 0;
          // The round cap is the HARD backstop — it stops the loop regardless of quality.
          const stop = satisfied || round >= opts.maxIterations;

          const artifacts = opts.currentArtifacts?.() ?? { screenshotPath: null, htmlPath: null };

          history.push({
            round,
            scores,
            overall,
            summary: args.summary,
            remainingIssues: args.remaining_issues ?? [],
            satisfied,
            stop,
            screenshotPath: artifacts.screenshotPath,
            htmlPath: artifacts.htmlPath,
          });

          if (opts.onRound) {
            try {
              await opts.onRound(history[history.length - 1]);
            } catch (e) {
              console.warn("[gate] onRound failed:", e instanceof Error ? e.message : e);
            }
          }

          let verdict: string;
          if (stop && satisfied) {
            verdict = `STOP. Overall ${overall} >= ${opts.threshold} and every dimension clears its floor. It is good enough. Take one final screenshot to confirm, ensure no [NEEDS INPUT] markers or banned words remain, then finish without further edits.`;
          } else if (stop) {
            verdict = `STOP. You have reached the round cap (${round}/${opts.maxIterations}). Make no further edits. Leave the file in its best current state and finish.`;
          } else if (floorFailures.length > 0) {
            // Overall may even clear the threshold, but a critical weakness remains.
            verdict = `CONTINUE. Round ${round}/${opts.maxIterations}, overall ${overall}. Not done despite the average — fix these first: ${floorFailures.join("; ")}. Edit the file, screenshot again, then score again.`;
          } else {
            verdict = `CONTINUE. Round ${round}/${opts.maxIterations}, overall ${overall} (need ${opts.threshold}). Address the remaining issues, edit the file, screenshot again, then score again.`;
          }

          return { content: [{ type: "text", text: verdict }] };
        },
      ),
    ],
  });

  return { server, history };
}
