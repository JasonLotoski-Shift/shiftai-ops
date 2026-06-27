// Firm Knowledge parse cron (+ manual trigger). The backstop for uploaded
// documents whose inline finalize never ran (tab closed, transient failure):
// parses any KnowledgeItem still stuck at `pending`, bounded per run. The upload
// finalize action is the fast path; this guarantees nothing stays unparsed.
//
// Auth: CRON_SECRET. Vercel cron sends "Authorization: Bearer $CRON_SECRET";
// ?secret=<CRON_SECRET> also works for a manual trigger. Schedule: vercel.json.

import { NextResponse } from "next/server";
import { parsePendingKnowledge } from "@/lib/knowledge-parse";
import { logOps } from "@/lib/ops";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Pro plan — PDF parse + Claude summary per item

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  return req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const t0 = Date.now();
  try {
    const { parsed, failed, empty } = await parsePendingKnowledge(10);
    void logOps({
      kind: "cron",
      name: "knowledge-parse",
      status: failed > 0 ? "error" : "ok",
      actor: "CRON",
      actorLabel: "CRON",
      durationMs: Date.now() - t0,
      detail: `Parsed ${parsed} · empty ${empty} · failed ${failed}`,
      meta: { parsed, failed, empty },
    });
    return NextResponse.json({ ok: true, parsed, empty, failed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "knowledge parse failed";
    void logOps({ kind: "cron", name: "knowledge-parse", status: "error", actor: "CRON", actorLabel: "CRON", durationMs: Date.now() - t0, error: msg });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
