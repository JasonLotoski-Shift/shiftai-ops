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
import { createLibraryServer } from "./tools/library";
import { createPrototypeRun } from "./persistence";
import { makeSessionStore } from "../lib/agent-session-store";

// Stable project key for the prototype-builder's SDK sessions. The SDK derives the
// SessionKey.projectKey from the resolved cwd (it has no explicit projectKey option on
// query()), so build and the later partner-refine pass match because both run with the
// same worker cwd. This constant is the firm-level name for that session namespace and
// is shared with the refine pass / store consumers.
export const PROTOTYPE_PROJECT_KEY = "prototype-builder";

export type BuildBrief = {
  client: string;
  industry: string;
  /** The prototype brief markdown: problem, user stories, features, tabs, interaction, sample data, brand direction. */
  brief: string;
  /** Optional scope FKs — set by the Home kickoff so the run links to its Deal/Client. */
  dealId?: string;
  clientId?: string;
  /** The deal's Drive /Prototype subfolder id — Home resolves it and passes it in. */
  drivePrototypeFolderId?: string;
};

export type BuildResult = {
  runDir: string;
  prototypePath: string;
  rounds: number;
  finalScore: number | null;
  gateHistory: GateRecord[];
  /** The PrototypeRun row id, or null if persistence was unavailable for this run. */
  runId: string | null;
};

// The agent may only touch the files it builds and the loop's MCP tools (eyes, gate,
// library). A programmatic allowlist means the headless loop never blocks on a permission
// prompt AND can never run anything off-list (no Bash, no web, no bypass-everything).
// ToolSearch is allowed as a harmless fallback in case the runtime still defers the MCP
// tools; it only returns tool schemas, and canUseTool still gates actual execution.
// `mcp__library__*` is a wildcard so both library tools (list_projects, get_project)
// are covered without listing each — matched by toolAllowed() below, not String.includes.
const ALLOWED_TOOLS = [
  "Write",
  "Read",
  "Edit",
  "MultiEdit",
  "ToolSearch",
  "mcp__eyes__*",
  "mcp__gate__score",
  "mcp__library__*",
];

// Allow an exact match OR a trailing-`*` prefix match (e.g. "mcp__library__*"
// matches "mcp__library__get_project"). The SDK accepts the same wildcard form in
// allowedTools, so canUseTool agrees with the option it's passed.
function toolAllowed(toolName: string): boolean {
  return ALLOWED_TOOLS.some((pattern) =>
    pattern.endsWith("*") ? toolName.startsWith(pattern.slice(0, -1)) : pattern === toolName,
  );
}

const canUseTool: CanUseTool = async (toolName, input) => {
  if (toolAllowed(toolName)) return { behavior: "allow", updatedInput: input };
  return {
    behavior: "deny",
    message: `Tool ${toolName} is not allowed in the prototype build loop. Use Write/Edit, mcp__eyes__screenshot, mcp__eyes__interact, mcp__gate__score, and mcp__library__* only.`,
  };
};

export async function runBuild(
  input: BuildBrief,
  opts: { runId?: string; existingRunId?: string } = {},
): Promise<BuildResult> {
  const id = opts.runId || `run-${Date.now()}`;
  const runDir = path.join(RUNS_DIR, id);
  fs.mkdirSync(runDir, { recursive: true });
  console.log(`\n=== prototype run ${id} ===\nclient: ${input.client}\nrunDir: ${runDir}\nmodel: ${config.model}\n`);

  const eyes = createEyesServer(runDir);
  const gate = createGateServer({
    maxIterations: config.maxIterations,
    threshold: config.gateThreshold,
    // Tag each score with the screenshot/HTML the agent was looking at, so the
    // loop can persist each round's artifacts to Storage afterwards.
    currentArtifacts: () => eyes.getLastArtifacts(),
    onRound: (rec) => recorder.recordIteration(rec),
  });
  const library = createLibraryServer();

  // Open the run row (status=running). No-ops gracefully if the tables aren't
  // migrated yet — the build loop still runs and returns its result.
  const recorder = await createPrototypeRun(
    {
      clientName: input.client,
      industry: input.industry,
      model: config.model,
      dealId: input.dealId,
      clientId: input.clientId,
      brief: input.brief,
    },
    { existingRunId: opts.existingRunId },
  );

  // Wall-clock backstop: abort the query if the run exceeds maxRunMs. The SDK's
  // maxTurns/maxBudgetUsd don't bound elapsed time, so a stalled stream (e.g. a slow
  // thinking phase) would otherwise hang forever. On fire, the for-await throws and the
  // catch marks the run errored.
  const abortController = new AbortController();
  const runTimeout = setTimeout(() => abortController.abort(), config.maxRunMs);

  const prototypePath = path.join(runDir, config.prototypeFile);
  const userPrompt = [
    "Build an interactive HTML prototype for this opportunity, following your build ⇄ critique loop protocol.",
    "",
    `CLIENT: ${input.client}`,
    `INDUSTRY: ${input.industry}`,
    "",
    "PROTOTYPE BRIEF:",
    input.brief,
    "",
    // Be explicit about the EXACT path and that it's a brand-new file. The agent's cwd is
    // this dir, but it tends to guess repo-root paths; pinning the absolute path (and saying
    // it doesn't exist yet) avoids writing to the wrong place and the "must Read before Write"
    // stumble on a stale file. The screenshot tool reads this same path.
    `Write the prototype to EXACTLY this path — your working directory — creating it directly with the Write tool (it does not exist yet, no need to read it first): ${prototypePath}`,
    "Do not write it anywhere else, and do not read or modify any other files in the repository.",
    "Begin now: write the first version, call mcp__eyes__screenshot to see it, critique it honestly, score it with mcp__gate__score, and keep improving until the gate tells you to stop.",
  ].join("\n");

  try {
    const response = query({
      prompt: userPrompt,
      options: {
        cwd: runDir,
        systemPrompt: buildSystemPrompt(),
        model: config.model,
        // SDK isolation: load no filesystem settings, so the worker NEVER picks up the
        // user's global ~/.claude MCP servers / hooks / CLAUDE.md — only eyes/gate/library.
        settingSources: [],
        // Durable session persistence so a later partner-refine pass can resume this build.
        sessionStore: makeSessionStore(),
        mcpServers: { eyes: eyes.server, gate: gate.server, library: library.server },
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
        abortController,
        // Cap extended thinking only when configured (default: leave it on — it helps
        // design quality). See config.maxThinkingTokens; maxRunMs bounds any stall.
        ...(config.maxThinkingTokens != null
          ? { maxThinkingTokens: config.maxThinkingTokens }
          : {}),
        // WORKER_DEBUG surfaces the SDK subprocess's own stderr + debug stream so a
        // stalled run can be diagnosed (the structured message stream alone hides it).
        ...(process.env.WORKER_DEBUG
          ? { debug: true, stderr: (d: string) => process.stderr.write(`[sdk] ${d}`) }
          : {}),
      },
    });

    for await (const msg of response) {
      logMessage(msg);
      // Capture the SDK session id onto the run row as soon as it's known.
      const m = msg as any;
      if (m.type === "system" && m.subtype === "init" && m.session_id) {
        await recorder.setSession(m.session_id);
      }
    }

    // Each round was already persisted live via the gate's onRound hook (recordIteration
    // fires as each score lands). Here we only finalize the run.
    const last = gate.history[gate.history.length - 1];
    await recorder.finish({
      status: "done",
      rounds: gate.history.length,
      finalScore: last ? last.overall : null,
      finalHtmlPath: fs.existsSync(prototypePath) ? prototypePath : undefined,
    });

    // Persist the final deliverable (Drive + Artifact) when this is a real, deal-scoped run.
    if (input.dealId && input.drivePrototypeFolderId && fs.existsSync(prototypePath)) {
      await recorder.recordArtifact({
        dealId: input.dealId,
        company: input.client,
        folderId: input.drivePrototypeFolderId,
        htmlPath: prototypePath,
      });
    }

    return {
      runDir,
      prototypePath,
      rounds: gate.history.length,
      finalScore: last ? last.overall : null,
      gateHistory: gate.history,
      runId: recorder.runId,
    };
  } catch (err) {
    // Distinguish a wall-clock abort from a genuine error so the row says why.
    const message = abortController.signal.aborted
      ? `run aborted: exceeded wall-clock limit of ${config.maxRunMs}ms (likely a stalled stream — see PROTOTYPE_MAX_RUN_MS / WORKER_DEBUG)`
      : err instanceof Error
        ? err.message
        : String(err);
    // Mark the run errored (best-effort) before propagating to the caller.
    await recorder.finish({
      status: "error",
      rounds: gate.history.length,
      finalScore: gate.history[gate.history.length - 1]?.overall ?? null,
      error: message,
    });
    throw new Error(message);
  } finally {
    clearTimeout(runTimeout);
    await closeEyes();
  }
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
