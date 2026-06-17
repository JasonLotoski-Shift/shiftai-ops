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
};

export function createGateServer(opts: { maxIterations: number; threshold: number }) {
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
            args.structure * 0.25 +
              args.fidelity * 0.3 +
              args.design * 0.3 +
              args.interactivity * 0.15
          );
          const satisfied = overall >= opts.threshold;
          const stop = satisfied || round >= opts.maxIterations;

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
          });

          let verdict: string;
          if (stop && satisfied) {
            verdict = `STOP. Overall ${overall} >= ${opts.threshold}. The prototype is good enough. Take one final screenshot to confirm, ensure no [NEEDS INPUT] markers or banned words remain, then finish without further edits.`;
          } else if (stop) {
            verdict = `STOP. You have reached the round cap (${round}/${opts.maxIterations}). Make no further edits. Leave prototype.html in its best current state and finish.`;
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
