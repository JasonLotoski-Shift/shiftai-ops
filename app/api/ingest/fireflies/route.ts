// Fireflies meeting-ingest webhook (Phase 4b) — SCAFFOLD, needs config.
//
// Fireflies fires "transcript ready" here → we pull the transcript + summary +
// participants, MATCH to a record, EXTRACT via the ingest-meeting skill, and
// create a PENDING IngestProposal for partner review (propose-never-auto-write).
// Idempotent on the Fireflies meeting id (IngestProposal.externalId is UNIQUE),
// so a re-fired webhook never double-logs.
//
// [NEEDS CONFIG] before this does anything:
//   - FIREFLIES_API_KEY        (Fireflies GraphQL bearer token)
//   - FIREFLIES_WEBHOOK_SECRET (shared secret; sent as ?secret= or x-webhook-secret)
// Until both are set, the route returns 501. It is guarded so it can ship to
// prod inert — nothing runs accidentally. Untested end-to-end (no Fireflies
// account wired yet); validate against a real payload before relying on it.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generate } from "@/lib/ai";

export const dynamic = "force-dynamic";

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";

type FirefliesTranscript = {
  title: string | null;
  date: number | null; // epoch ms
  transcript_url: string | null;
  summary: { overview: string | null } | null;
  sentences: { speaker_name: string | null; text: string | null }[] | null;
  meeting_attendees: { email: string | null }[] | null;
};

async function fetchTranscript(meetingId: string, apiKey: string): Promise<FirefliesTranscript | null> {
  const query = `
    query Transcript($id: String!) {
      transcript(id: $id) {
        title
        date
        transcript_url
        summary { overview }
        sentences { speaker_name text }
        meeting_attendees { email }
      }
    }`;
  const res = await fetch(FIREFLIES_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, variables: { id: meetingId } }),
  });
  if (!res.ok) throw new Error(`Fireflies API ${res.status}`);
  const json = (await res.json()) as { data?: { transcript?: FirefliesTranscript } };
  return json.data?.transcript ?? null;
}

function flattenTranscript(t: FirefliesTranscript): string {
  if (t.sentences?.length) {
    return t.sentences.map((s) => `${s.speaker_name ?? "Speaker"}: ${s.text ?? ""}`).join("\n");
  }
  return t.summary?.overview ?? "";
}

async function matchContact(emails: string[]) {
  if (!emails.length) return { contactId: null as string | null, clientId: null as string | null, dealId: null as string | null };
  const contacts = await prisma.contact.findMany({
    where: { email: { in: emails, mode: "insensitive" } },
    select: {
      id: true,
      primaryForClients: { select: { id: true }, take: 1, orderBy: { updatedAt: "desc" } },
      deals: { select: { id: true }, take: 1, orderBy: { updatedAt: "desc" } },
    },
  });
  if (contacts.length !== 1) return { contactId: null, clientId: null, dealId: null }; // 0 or ambiguous → unassigned
  const c = contacts[0];
  const clientId = c.primaryForClients[0]?.id ?? null;
  return { contactId: c.id, clientId, dealId: clientId ? null : c.deals[0]?.id ?? null };
}

export async function POST(req: Request) {
  const apiKey = process.env.FIREFLIES_API_KEY;
  const secret = process.env.FIREFLIES_WEBHOOK_SECRET;
  if (!apiKey || !secret) {
    return NextResponse.json(
      { error: "Fireflies ingest not configured (set FIREFLIES_API_KEY + FIREFLIES_WEBHOOK_SECRET)." },
      { status: 501 },
    );
  }

  // Verify the shared secret (query param or header).
  const url = new URL(req.url);
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

  // Idempotency — already ingested this meeting?
  const existing = await prisma.ingestProposal.findUnique({ where: { externalId: meetingId }, select: { id: true } });
  if (existing) return NextResponse.json({ ok: true, deduped: true, id: existing.id });

  const t = await fetchTranscript(meetingId, apiKey);
  if (!t) return NextResponse.json({ error: "Transcript not found" }, { status: 404 });

  const transcript = flattenTranscript(t);
  if (transcript.trim().length < 40) {
    return NextResponse.json({ error: "Transcript too short" }, { status: 422 });
  }
  const title = t.title ?? "Fireflies meeting";
  const meetingDate = t.date ? new Date(t.date) : new Date();
  const emails = (t.meeting_attendees ?? []).map((a) => a.email).filter((e): e is string => !!e);
  const match = await matchContact(emails.map((e) => e.toLowerCase()));

  // Extract via the same skill the manual paste path uses.
  const raw = await generate({
    skill: "ingest-meeting",
    context: `## Meeting\nTitle: ${title}\nDate: ${meetingDate.toISOString().slice(0, 10)}\nSource: Fireflies`,
    intake: `## Transcript\n${transcript}`,
    maxTokens: 3000,
  });
  let proposal: unknown;
  try {
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1].trim();
    if (!text.startsWith("{")) {
      const s = text.indexOf("{");
      const e = text.lastIndexOf("}");
      if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
    }
    proposal = JSON.parse(text);
  } catch {
    proposal = { summary: t.summary?.overview ?? "", keyPoints: [], actionItems: [], enrichment: { contact: [], client: [] }, stageSignal: null };
  }

  const created = await prisma.ingestProposal.create({
    data: {
      source: "fireflies",
      externalId: meetingId,
      title,
      meetingDate,
      transcript,
      proposal: proposal as object,
      status: "pending",
      matchedContactId: match.contactId,
      matchedClientId: match.clientId,
      matchedDealId: match.dealId,
      createdBy: "AGENT · CLAUDE",
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: created.id });
}
