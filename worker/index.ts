// HTTP entrypoint for the prototype-builder worker (the always-on Railway service).
// Phase A: a minimal server proving the shape — POST /build (shared-secret auth) kicks a run.
// Phase C wires this to PrototypeRun rows + Supabase Realtime; for now it just runs the loop.
import "dotenv/config";
import http from "node:http";
import { runBuild, type BuildBrief } from "./loop";

const PORT = Number(process.env.WORKER_PORT || 8787);
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
      runBuild(input, { existingRunId: input.runId })
        .then((r) => console.log(`[build done] ${r.runDir} rounds=${r.rounds} score=${r.finalScore} runId=${r.runId}`))
        .catch((e) => console.error("[build failed]", e));
    });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => console.log(`prototype worker listening on :${PORT}`));
