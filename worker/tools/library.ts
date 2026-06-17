// LIBRARY — the agent's memory of past work. An in-process SDK MCP server exposing
// two tools over the Drive prototype library (see lib/drive-library.ts):
//   • list_projects — cheap: names + folder IDs of every project in the library
//   • get_project   — lazy: ONE project's overview.md + why.md + ui/*.png screenshots,
//                     screenshots returned as image content blocks so the agent SEES them
//
// Set alwaysLoad:true so the agent doesn't have to ToolSearch to find these (same
// reasoning as eyes/gate). Fetching is one project at a time — never a whole-folder
// scan — so a large library stays cheap until the agent actually reaches for a project.
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// NOTE: lib/drive-library is imported LAZILY (dynamic import inside the handlers),
// not at the top. lib/drive.ts constructs the service-account client at module-load
// and throws if GOOGLE_SERVICE_ACCOUNT_KEY_B64 is unset — a top-level import would
// crash the whole worker at startup on any box without the Drive key (e.g. the local
// dev-run). Deferring the import means the client is only built when a library tool
// actually runs, by which point (prod) the key is present.

/**
 * Build the Library MCP server. Reads PROTOTYPE_LIBRARY_FOLDER_ID at call time so a
 * run without the env var (e.g. the local dev-run) still works — the tools just
 * report the library is unavailable instead of crashing the loop.
 */
export function createLibraryServer() {
  const server = createSdkMcpServer({
    name: "library",
    version: "1.0.0",
    alwaysLoad: true,
    tools: [
      tool(
        "list_projects",
        "List the past prototype projects available in the firm's prototype library (name + id for each). Call this first to see what proven work you can borrow structure, copy, and UI ideas from. Then call get_project on the most relevant one.",
        // A non-empty schema on purpose: a parameterless in-process MCP tool ({}) wedges
        // the SDK's tool roundtrip. `looking_for` is optional and unused — it just gives
        // the tool a real input shape (same reason eyes' screenshot takes an optional note).
        {
          looking_for: z
            .string()
            .optional()
            .describe("optional: the kind of prototype you're about to build, for your own reference"),
        },
        async () => {
          const libFolderId = process.env.PROTOTYPE_LIBRARY_FOLDER_ID;
          if (!libFolderId) {
            return {
              content: [
                {
                  type: "text",
                  text: "The prototype library is not configured for this run (PROTOTYPE_LIBRARY_FOLDER_ID is unset). Proceed from the brief and the skill alone.",
                },
              ],
            };
          }
          try {
            const { listProjectFolders } = await import("../../lib/drive-library");
            const projects = await listProjectFolders(libFolderId);
            if (projects.length === 0) {
              return {
                content: [{ type: "text", text: "The prototype library is empty. Proceed from the brief alone." }],
              };
            }
            const lines = projects.map((p) => `- ${p.name} — id: ${p.id}`).join("\n");
            return {
              content: [
                {
                  type: "text",
                  text: `Prototype library — ${projects.length} project(s). Call get_project with the id of the most relevant one to see its overview, reuse notes, and screenshots:\n\n${lines}`,
                },
              ],
            };
          } catch (err) {
            return libraryError("list the library projects", err);
          }
        },
      ),
      tool(
        "get_project",
        "Load one past project from the prototype library by its folder id: its overview, the reuse notes (why it worked / what to lift), and screenshots of the finished UI so you can SEE it. Use it for structure, layout, and copy ideas — never copy a different client's data. Fetch only the project(s) you actually need.",
        {
          folderId: z.string().describe("the project's Drive folder id, from list_projects"),
        },
        async (args) => {
          const libFolderId = process.env.PROTOTYPE_LIBRARY_FOLDER_ID;
          if (!libFolderId) {
            return {
              content: [
                {
                  type: "text",
                  text: "The prototype library is not configured for this run (PROTOTYPE_LIBRARY_FOLDER_ID is unset). Proceed from the brief alone.",
                },
              ],
            };
          }
          try {
            const { loadProjectMetadata } = await import("../../lib/drive-library");
            const { overview, whyNotes, screenshots } = await loadProjectMetadata(args.folderId);

            const text = [
              "## Overview",
              overview || "_(no overview.md in this project)_",
              "",
              "## Why it worked / what to lift",
              whyNotes || "_(no why.md in this project)_",
              "",
              screenshots.length
                ? `${screenshots.length} screenshot(s) of the finished UI follow — study the structure, layout, and density, then adapt (don't copy) for the current brief.`
                : "_(no screenshots in this project's ui/ folder)_",
            ].join("\n");

            return {
              content: [
                { type: "text", text },
                ...screenshots.map((s) => ({
                  type: "image" as const,
                  data: s.base64,
                  mimeType: s.mediaType,
                })),
              ],
            };
          } catch (err) {
            return libraryError(`load project ${args.folderId}`, err);
          }
        },
      ),
    ],
  });

  return { server };
}

// A Drive read failed — tell the agent so it carries on from the brief rather than
// stalling. Library access is a nice-to-have, never a hard dependency of the loop.
function libraryError(what: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[library] failed to ${what}:`, err);
  return {
    content: [
      {
        type: "text" as const,
        text: `Could not ${what} from the prototype library (${msg}). Proceed from the brief and the skill alone.`,
      },
    ],
    isError: true,
  };
}
