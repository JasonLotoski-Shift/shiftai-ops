// Fireflies ingest poll (cron). Sweeps recent Fireflies meetings and ingests any
// that NOW match the title gate and haven't been ingested yet — so a meeting you
// rename to include "Shift" AFTER the call (when the one-shot webhook already
// skipped it) still lands on /ingest on the next pass. Idempotent on the meeting
// id; shares all logic with the webhook via lib/fireflies.
//
// Auth: CRON_SECRET. Vercel cron sends "Authorization: Bearer $CRON_SECRET";
// ?secret=<CRON_SECRET> also works for a manual trigger. Schedule: vercel.json.

import { NextResponse } from "next/server";
import { listRecentTranscripts, titleMatches, ingestFirefliesMeeting } from "@/lib/fireflies";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Pro plan — scans recent meetings × extraction

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  return req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: true, created: 0, note: "FIREFLIES_API_KEY not set" });

  let recent;
  try {
    recent = await listRecentTranscripts(apiKey, 25);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fireflies list failed" }, { status: 502 });
  }

  let created = 0;
  let deduped = 0;
  let skipped = 0;
  const results: { id: string; title: string; status: string }[] = [];

  for (const m of recent) {
    // Pre-filter by title (cheap, from the list) so we only fetch full
    // transcripts for candidates. ingestFirefliesMeeting re-checks the full gate.
    if (!titleMatches(m.title)) {
      skipped++;
      continue;
    }
    try {
      const r = await ingestFirefliesMeeting({ meetingId: m.id, apiKey });
      if (r.status === "created") created++;
      else if (r.status === "deduped") deduped++;
      else skipped++;
      results.push({ id: m.id, title: m.title, status: r.status });
    } catch (e) {
      results.push({ id: m.id, title: m.title, status: "error: " + (e instanceof Error ? e.message : "?") });
    }
  }

  return NextResponse.json({ ok: true, scanned: recent.length, created, deduped, skipped, results });
}
