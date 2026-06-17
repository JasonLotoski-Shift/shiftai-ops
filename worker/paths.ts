// Filesystem anchors for the prototype-builder worker.
// REPO_ROOT is resolved from this module's location so the worker can be run
// from any cwd (tsx, Docker, Railway) and still find skills/ and write runs.
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(here, "..");
export const SKILLS_DIR = path.join(REPO_ROOT, "skills");
// Per-run working dirs (the agent's cwd + screenshots) live here. Gitignored.
export const RUNS_DIR = path.join(REPO_ROOT, "worker", ".runs");
