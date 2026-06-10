// Tally webhook — fires when a client submits a discovery questionnaire. Verify
// the signature, then hand off to saveTallySubmission (idempotent: matches the
// form to a DiscoverySurvey, saves the answers + a Drive copy + an Artifact, and
// notifies the partner — no review queue). middleware.ts already excludes
// /api/ingest/*, so this is reachable without a session.
//
// [NEEDS CONFIG]: TALLY_WEBHOOK_SIGNING_SECRET (set when registering the webhook
// in Tally → Integrations). Until set, returns 501 (inert).

import { NextResponse } from "next/server";
import { verifyTallySignature, saveTallySubmission } from "@/lib/tally";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!process.env.TALLY_WEBHOOK_SIGNING_SECRET) {
    return NextResponse.json({ error: "Tally webhook not configured (set TALLY_WEBHOOK_SIGNING_SECRET)." }, { status: 501 });
  }

  // Read the RAW body before parsing — the signature is HMAC over the raw bytes.
  const raw = await req.text();
  if (!verifyTallySignature(raw, req.headers.get("tally-signature"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // All terminal outcomes return 200 so Tally stops retrying.
  const r = await saveTallySubmission(payload);
  return NextResponse.json({ ok: true, status: r.status, id: r.surveyId });
}
