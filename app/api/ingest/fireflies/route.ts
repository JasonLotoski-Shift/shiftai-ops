// Fireflies meeting-ingest webhook (Phase 4b).
//
// Fireflies fires "transcript ready" here → we pull the transcript, MATCH a
// record, EXTRACT via the ingest-meeting skill, and create a PENDING
// IngestProposal for review (propose-never-auto-write). The actual work lives in
// lib/fireflies.ts (shared with the hourly poll). Idempotent on the meeting id.
//
// [NEEDS CONFIG]:
//   - FIREFLIES_API_KEY        (Fireflies GraphQL bearer token)
//   - FIREFLIES_WEBHOOK_SECRET (shared secret; sent as ?secret= or x-webhook-secret)
// Optional: FIREFLIES_TITLE_FILTER (default "Shift"; "" ingests every title).
//
// GATE — Fireflies can't scope webhooks to a channel, so we filter in
// lib/fireflies: ingest only if the title contains FIREFLIES_TITLE_FILTER AND
// there's a non-firm attendee. ?force=1 bypasses the gate (manual re-ingest).
// Renamed-after-the-fact meetings are caught by the hourly poll, not here.

import { NextResponse } from "next/server";
import { ingestFirefliesMeeting } from "@/lib/fireflies";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const apiKey = process.env.FIREFLIES_API_KEY;
  const secret = process.env.FIREFLIES_WEBHOOK_SECRET;
  if (!apiKey || !secret) {
    return NextResponse.json(
      { error: "Fireflies ingest not configured (set FIREFLIES_API_KEY + FIREFLIES_WEBHOOK_SECRET)." },
      { status: 501 },
    );
  }

  const url = new URL(req.url);
  // ?force=1 bypasses the title / internal-only gate (manual "pull this meeting").
  const force = url.searchParams.get("force") === "1";
  const provided = url.searchParams.get("secret") ?? req.headers.get("x-webhook-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { meetingId?: string; meeting_id?: string };
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const meetingId = payload.meetingId ?? payload.meeting_id;
  if (!meetingId) return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });

  const r = await ingestFirefliesMeeting({ meetingId, apiKey, force });
  switch (r.status) {
    case "deduped":
      return NextResponse.json({ ok: true, deduped: true, id: r.id });
    case "not_found":
      return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
    case "too_short":
      return NextResponse.json({ error: "Transcript too short" }, { status: 422 });
    case "skipped":
      // 200 so Fireflies marks the webhook delivered (no retries).
      return NextResponse.json({ ok: true, skipped: true, reason: r.reason });
    case "created":
      return NextResponse.json({ ok: true, id: r.id });
  }
}
