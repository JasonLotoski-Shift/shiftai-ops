// Tally ingest poll (cron + manual "Check Tally"). The Tally webhook is the
// primary path and delivers questionnaire responses instantly; this is the
// backstop for a missed/failed delivery. Re-pulls submissions for every form we
// have a DiscoverySurvey for and saves any new ones via saveTallySubmission
// (idempotent on the Tally responseId). Propose-never-auto-write doesn't apply —
// a returned questionnaire saves straight to the deal/client, same as the webhook.
//
// Auth: CRON_SECRET. Vercel cron sends "Authorization: Bearer $CRON_SECRET";
// ?secret=<CRON_SECRET> also works for a manual trigger. Schedule: vercel.json.

import { NextResponse } from "next/server";
import { rescanTallyForms } from "@/lib/tally";
import { logOps } from "@/lib/ops";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Pro plan — lists submissions per form

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  return req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const t0 = Date.now();
  if (!process.env.TALLY_API_KEY) {
    return NextResponse.json({ ok: true, created: 0, note: "TALLY_API_KEY not set" });
  }

  try {
    const { scannedForms, created, notes } = await rescanTallyForms();
    void logOps({
      kind: "cron",
      name: "tally-poll",
      status: notes.length > 0 ? "error" : "ok",
      actor: "CRON",
      actorLabel: "CRON",
      durationMs: Date.now() - t0,
      detail: `Scanned ${scannedForms} form(s) — ${created} new`,
      meta: { scannedForms, created, notes },
    });
    return NextResponse.json({ ok: true, scanned: scannedForms, created, notes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "tally poll failed";
    void logOps({ kind: "cron", name: "tally-poll", status: "error", actor: "CRON", actorLabel: "CRON", durationMs: Date.now() - t0, error: msg });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
