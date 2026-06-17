// The LOOP — one Agent SDK query() session that builds prototype.html and improves it
// round after round, bounded by the Gate (score/round cap) and hard SDK backstops
// (maxTurns, maxBudgetUsd). Phase A: local only, no Home/Drive/DB.
import fs from "node:fs";
import path from "node:path";
import { query, type CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./config";
import { RUNS_DIR } from "./paths";
import { buildSystemPrompt } from "./prompt";
import { createEyesServer, closeEyes } from "./tools/eyes";
import { createGateServer, type GateRecord } from "./tools/gate";

export type BuildBrief = {
  client: string;
  industry: string;
  /** The prototype brief markdown: problem, user stories, features, tabs, interaction, sample data, brand direction. */
  brief: string;
};

export type BuildResult = {
  runDir: string;
  prototypePath: string;
  rounds: number;
  finalScore: number | null;
  gateHistory: GateRecord[];
};

// The agent may only touch the files it builds and the three loop tools. A programmatic
// allowlist means the headless loop never blocks on a permission prompt AND can never run
// anything off-list (no Bash, no web, no bypass-everything).
// ToolSearch is allowed as a harmless fallback in case the runtime still defers the MCP
// tools; it only returns tool schemas, and canUseTool still gates actual execution.
const ALLOWED_TOOLS = [
  "Write",
  "Read",
  "Edit",
  "MultiEdit",
  "ToolSearch",
  "mcp__eyes__screenshot",
  "mcp__gate__score",
];

const canUseTool: CanUseTool = async (toolName, input) => {
  if (ALLOWED_TOOLS.includes(toolName)) return { behavior: "allow", updatedInput: input };
  return {
    behavior: "deny",
    message: `Tool ${toolName} is not allowed in the prototype build loop. Use Write/Edit, mcp__eyes__screenshot, and mcp__gate__score only.`,
  };
};

export async function runBuild(input: BuildBrief, runId?: string): Promise<BuildResult> {
  const id = runId || `run-${Date.now()}`;
  const runDir = path.join(RUNS_DIR, id);
  fs.mkdirSync(runDir, { recursive: true });
  console.log(`\n=== prototype run ${id} ===\nclient: ${input.client}\nrunDir: ${runDir}\nmodel: ${config.model}\n`);

  const eyes = createEyesServer(runDir);
  const gate = createGateServer({
    maxIterations: config.maxIterations,
    threshold: config.gateThreshold,
  });

  const userPrompt = [
    "Build an interactive HTML prototype for this opportunity, following your build ⇄ critique loop protocol.",
    "",
    `CLIENT: ${input.client}`,
    `INDUSTRY: ${input.industry}`,
    "",
    "PROTOTYPE BRIEF:",
    input.brief,
    "",
    `Write the prototype to this EXACT file path (this is your working directory): ${path.join(runDir, config.prototypeFile)}`,
    "Begin now: write the first version, call mcp__eyes__screenshot to see it, critique it honestly, score it with mcp__gate__score, and keep improving until the gate tells you to stop. Do not write files anywhere else.",
  ].join("\n");

  try {
    const response = query({
      prompt: userPrompt,
      options: {
        cwd: runDir,
        systemPrompt: buildSystemPrompt(),
        model: config.model,
        mcpServers: { eyes: eyes.server, gate: gate.server },
        allowedTools: ALLOWED_TOOLS,
        // Hard-block tools the loop never needs. Under acceptEdits, read-only built-ins like
        // Bash can otherwise slip past canUseTool; disallowedTools is an explicit block.
        disallowedTools: ["Bash", "WebFetch", "WebSearch", "Task", "Agent", "NotebookEdit", "KillShell"],
        // Auto-accept the agent's own file edits; route every other tool call through
        // canUseTool, which allows only the loop's tools and denies the rest (no prompt, no hang).
        permissionMode: "acceptEdits",
        canUseTool,
        maxTurns: config.maxTurns,
        maxBudgetUsd: config.maxBudgetUsd,
      },
    });

    for await (const msg of response) {
      logMessage(msg);
    }
  } finally {
    await closeEyes();
  }

  const last = gate.history[gate.history.length - 1];
  return {
    runDir,
    prototypePath: path.join(runDir, config.prototypeFile),
    rounds: gate.history.length,
    finalScore: last ? last.overall : null,
    gateHistory: gate.history,
  };
}

// Compact console logging of the SDK message stream (Phase A observability).
function logMessage(msg: any): void {
  try {
    if (msg.type === "system" && msg.subtype === "init") {
      console.log(`[system] session=${msg.session_id} model=${msg.model}`);
    } else if (msg.type === "assistant" && msg.message?.content) {
      for (const block of msg.message.content as any[]) {
        if (block.type === "text" && block.text?.trim()) {
          console.log(`\n[assistant] ${block.text.trim()}`);
        } else if (block.type === "tool_use") {
          const input = JSON.stringify(block.input ?? {});
          console.log(`[tool_use] ${block.name} ${input.length > 240 ? input.slice(0, 240) + "…" : input}`);
        }
      }
    } else if (msg.type === "result") {
      console.log(
        `\n[result] subtype=${msg.subtype} turns=${msg.num_turns} cost=$${msg.total_cost_usd ?? "?"} duration=${msg.duration_ms ?? "?"}ms`
      );
    }
  } catch {
    /* never let logging crash the loop */
  }
}
