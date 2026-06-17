// GATE — decides when the prototype is "satisfied" and caps runaway loops.
// An in-process SDK MCP server with one tool, `score`. The agent submits honest
// self-assessment; the gate returns the round number and a STOP/CONTINUE verdict.
// `history` is exposed so the loop can report the run after it finishes.
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

export type GateRecord = {
  round: number;
  structure: number;
  fidelity: number;
  design: number;
  interactivity: number;
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

// Rubric weights — must sum to 1. Tuned so the prototype is judged first as a
// believable DEMO: the key interaction actually working (interactivity) and matching
// what was discussed (fidelity) carry the most, design is close behind because the
// output is client-facing, and structure is the table-stakes baseline.
const WEIGHTS = {
  structure: 0.2,
  fidelity: 0.3,
  design: 0.25,
  interactivity: 0.25,
} as const;

// Floors that gate "satisfied" independently of the weighted overall. A high
// average must not paper over a fatal weakness: a demo whose key interaction is
// broken, or that ignores the brief, is not done however polished it looks.
// Every dimension must clear DIMENSION_FLOOR, and the two demo-critical dimensions
// must clear the higher CRITICAL_FLOOR, before the gate will STOP on quality.
const DIMENSION_FLOOR = 60;
const CRITICAL_FLOOR = 75; // applies to interactivity + fidelity

export function createGateServer(opts: {
  maxIterations: number;
  threshold: number;
  // Optional: what the agent is currently looking at (Eyes' last screenshot/HTML),
  // captured onto each record so the loop can persist the round afterwards.
  currentArtifacts?: () => { screenshotPath: string | null; htmlPath: string | null };
}) {
  const history: GateRecord[] = [];

  const server = createSdkMcpServer({
    name: "gate",
    version: "1.0.0",
    // Keep the tool in-context (never deferred behind ToolSearch) — there's only one.
    alwaysLoad: true,
    tools: [
      tool(
        "score",
        "Submit an honest self-assessment of the CURRENT prototype after looking at the latest screenshot. Returns the round number and whether to STOP or CONTINUE. The gate enforces a hard cap on rounds, so improve fast.",
        {
          structure: z
            .number()
            .min(0)
            .max(100)
            .describe("are the right tabs/sections present and laid out like a real product?"),
          fidelity: z
            .number()
            .min(0)
            .max(100)
            .describe("how well does it match the brief's features, user stories, and sample-data shape?"),
          design: z
            .number()
            .min(0)
            .max(100)
            .describe("visual quality: hierarchy, spacing, color, density, on-brand"),
          interactivity: z
            .number()
            .min(0)
            .max(100)
            .describe("do the key interaction(s) actually work in the DOM?"),
          summary: z
            .string()
            .describe("one line: the single biggest thing to fix next, or 'done' if finished"),
          remaining_issues: z
            .array(z.string())
            .optional()
            .describe("concrete issues still open"),
        },
        async (args) => {
          const round = history.length + 1;
          const overall = Math.round(
            args.structure * WEIGHTS.structure +
              args.fidelity * WEIGHTS.fidelity +
              args.design * WEIGHTS.design +
              args.interactivity * WEIGHTS.interactivity
          );

          // Identify any floor failures — these block "satisfied" even at a high overall.
          const floorFailures: string[] = [];
          if (args.interactivity < CRITICAL_FLOOR)
            floorFailures.push(`interactivity ${args.interactivity} < ${CRITICAL_FLOOR} (the key interaction must actually work)`);
          if (args.fidelity < CRITICAL_FLOOR)
            floorFailures.push(`fidelity ${args.fidelity} < ${CRITICAL_FLOOR} (it must match the brief)`);
          if (args.structure < DIMENSION_FLOOR)
            floorFailures.push(`structure ${args.structure} < ${DIMENSION_FLOOR}`);
          if (args.design < DIMENSION_FLOOR)
            floorFailures.push(`design ${args.design} < ${DIMENSION_FLOOR}`);

          const satisfied = overall >= opts.threshold && floorFailures.length === 0;
          // The round cap is the HARD backstop — it stops the loop regardless of quality.
          const stop = satisfied || round >= opts.maxIterations;

          const artifacts = opts.currentArtifacts?.() ?? { screenshotPath: null, htmlPath: null };

          history.push({
            round,
            structure: args.structure,
            fidelity: args.fidelity,
            design: args.design,
            interactivity: args.interactivity,
            overall,
            summary: args.summary,
            remainingIssues: args.remaining_issues ?? [],
            satisfied,
            stop,
            screenshotPath: artifacts.screenshotPath,
            htmlPath: artifacts.htmlPath,
          });

          let verdict: string;
          if (stop && satisfied) {
            verdict = `STOP. Overall ${overall} >= ${opts.threshold} and every dimension clears its floor. The prototype is good enough. Take one final screenshot to confirm, ensure no [NEEDS INPUT] markers or banned words remain, then finish without further edits.`;
          } else if (stop) {
            verdict = `STOP. You have reached the round cap (${round}/${opts.maxIterations}). Make no further edits. Leave prototype.html in its best current state and finish.`;
          } else if (floorFailures.length > 0) {
            // Overall may even clear the threshold, but a critical weakness remains.
            verdict = `CONTINUE. Round ${round}/${opts.maxIterations}, overall ${overall}. Not done despite the average — fix these first: ${floorFailures.join("; ")}. Edit prototype.html, screenshot again, then score again.`;
          } else {
            verdict = `CONTINUE. Round ${round}/${opts.maxIterations}, overall ${overall} (need ${opts.threshold}). Address the remaining issues, edit prototype.html, screenshot again, then score again.`;
          }

          return { content: [{ type: "text", text: verdict }] };
        }
      ),
    ],
  });

  return { server, history };
}
