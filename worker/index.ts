// HTTP entrypoint for the prototype-builder worker (the always-on Railway service).
// Phase A: a minimal server proving the shape — POST /build (shared-secret auth) kicks a run.
// Phase C wires this to PrototypeRun rows + Supabase Realtime; for now it just runs the loop.
import "dotenv/config";
import http from "node:http";
import { runBuild, refineBuild, type BuildBrief } from "./loop";

// Railway (and most PaaS) inject the port to bind on as $PORT and route/health-check it —
// prefer that; fall back to WORKER_PORT then 8787 for local dev.
const PORT = Number(process.env.PORT || process.env.WORKER_PORT || 8787);
const SECRET = process.env.WORKER_SHARED_SECRET || "";

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && req.url === "/build") {
    const auth = req.headers["authorization"] || "";
    if (SECRET && auth !== `Bearer ${SECRET}`) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let input: BuildBrief & { runId?: string };
      try {
        input = JSON.parse(body);
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "bad json" }));
        return;
      }
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "started", runId: input.runId ?? null }));
      // Pass runId for BOTH the cwd-derived runDir AND the DB row: the SDK derives the
      // SessionKey.projectKey from the sanitized cwd, so the build's runDir MUST be
      // RUNS_DIR/<PrototypeRun id> to match refineBuild's runDir (also RUNS_DIR/<runId>).
      // Without this the build and refine resolve to different projectKeys, the durable
      // SessionStore.load() returns null on resume, and the partner-refine pass loses all
      // prior context. (existingRunId only attaches the recorder to Home's pre-inserted row.)
      runBuild(input, { runId: input.runId, existingRunId: input.runId })
        .then((r) => console.log(`[build done] ${r.runDir} rounds=${r.rounds} score=${r.finalScore} runId=${r.runId}`))
        .catch((e) => console.error("[build failed]", e));
    });
    return;
  }

  // The single partner-refine pass: resume the run's session, apply ONE partner comment,
  // re-finalize. Mirrors /build — Bearer-secret auth, 202 ACK, runs in the background.
  if (req.method === "POST" && req.url === "/refine") {
    const auth = req.headers["authorization"] || "";
    if (SECRET && auth !== `Bearer ${SECRET}`) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let input: { runId?: string; comment?: string };
      try {
        input = JSON.parse(body);
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "bad json" }));
        return;
      }
      if (!input.runId || !input.comment) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "runId and comment are required" }));
        return;
      }
      const { runId, comment } = input;
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "refining", runId }));
      refineBuild({ runId, comment })
        .then((r) => console.log(`[refine done] ${r.runDir} rounds=${r.rounds} score=${r.finalScore} runId=${r.runId}`))
        .catch((e) => console.error("[refine failed]", e));
    });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

// Bind to 0.0.0.0 explicitly: Node's default (no host) listens on IPv6 `::`, which
// Railway's healthcheck can't always reach → it SIGTERMs the "unhealthy" container and
// crash-loops to a 502. Railway requires 0.0.0.0. (Burned a deploy on this 2026-06-18.)
server.listen(PORT, "0.0.0.0", () => console.log(`prototype worker listening on 0.0.0.0:${PORT}`));

// Graceful shutdown: when Railway stops/redeploys the container it sends SIGTERM. Close the
// HTTP server so in-flight requests drain and the process exits cleanly (no force-kill noise).
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    console.log(`received ${sig}, shutting down`);
    server.close(() => process.exit(0));
  });
}
