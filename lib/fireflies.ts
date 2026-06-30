// Shared Fireflies ingest logic — used by BOTH the webhook
// (app/api/ingest/fireflies) and the hourly poll (app/api/cron/fireflies-poll),
// so the GraphQL calls, the title/attendee gate, matching, extraction, and the
// idempotent proposal create live in ONE place and never diverge. Server-only.
//
// The poll exists because Fireflies fires its webhook once, when the transcript
// is first ready — using the title at that moment (often an auto date). If a
// partner renames the meeting to include "Shift" AFTER that, the webhook already
// skipped it. The hourly poll re-checks recent meetings, so a rename is picked
// up on the next pass. Both paths dedupe on the Fireflies meeting id.

import { prisma } from "@/lib/prisma";
import { generate } from "@/lib/ai";
import { logOps } from "@/lib/ops";
import { fetchClientOpenTaskCandidates, fetchFirmOpenTaskCandidates, formatOpenTaskCandidates } from "@/lib/ingest/context";

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";

// Only ingest meetings whose title contains this word (case-insensitive).
// Defaults to the firm name; override or disable ("") via FIREFLIES_TITLE_FILTER.
export const TITLE_FILTER = process.env.FIREFLIES_TITLE_FILTER ?? "Shift";

export function titleMatches(title: string): boolean {
  return !TITLE_FILTER || title.toLowerCase().includes(TITLE_FILTER.toLowerCase());
}

// Firm domains — attendees on these are "us". @shiftcg.ai is the sunsetting
// alias (still live); keep until it's retired (see CLAUDE.md gotcha #6).
const FIRM_EMAIL_DOMAINS = ["shiftai.partners", "shiftcg.ai"];
function isInternalEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  return at !== -1 && FIRM_EMAIL_DOMAINS.includes(email.slice(at + 1));
}

type FirefliesTranscript = {
  title: string | null;
  date: number | null; // epoch ms
  transcript_url: string | null;
  summary: { overview: string | null } | null;
  sentences: { speaker_name: string | null; text: string | null }[] | null;
  meeting_attendees: { email: string | null }[] | null;
};

export type RecentMeeting = { id: string; title: string };

async function gql<T>(apiKey: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(FIREFLIES_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Fireflies API ${res.status}`);
  const json = (await res.json()) as { data?: T };
  return (json.data ?? {}) as T;
}

export async function fetchTranscript(meetingId: string, apiKey: string): Promise<FirefliesTranscript | null> {
  const data = await gql<{ transcript?: FirefliesTranscript }>(
    apiKey,
    `query Transcript($id: String!) {
      transcript(id: $id) {
        title date transcript_url
        summary { overview }
        sentences { speaker_name text }
        meeting_attendees { email }
      }
    }`,
    { id: meetingId },
  );
  return data.transcript ?? null;
}

/** Recent meetings (id + title) for the poll to scan. */
export async function listRecentTranscripts(apiKey: string, limit = 25): Promise<RecentMeeting[]> {
  const data = await gql<{ transcripts?: { id: string | null; title: string | null }[] }>(
    apiKey,
    `query Transcripts($limit: Int) { transcripts(limit: $limit) { id title } }`,
    { limit },
  );
  return (data.transcripts ?? [])
    .filter((t): t is { id: string; title: string | null } => !!t?.id)
    .map((t) => ({ id: t.id, title: t.title ?? "" }));
}

function flattenTranscript(t: FirefliesTranscript): string {
  if (t.sentences?.length) {
    return t.sentences.map((s) => `${s.speaker_name ?? "Speaker"}: ${s.text ?? ""}`).join("\n");
  }
  return t.summary?.overview ?? "";
}

function attendeeEmails(t: FirefliesTranscript): string[] {
  return (t.meeting_attendees ?? [])
    .map((a) => a?.email?.trim().toLowerCase())
    .filter((e): e is string => !!e);
}

async function matchContact(emails: string[]): Promise<{ contactId: string | null; clientId: string | null; dealId: string | null }> {
  if (!emails.length) return { contactId: null, clientId: null, dealId: null };
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

function parseProposal(raw: string, fallbackOverview: string): object {
  try {
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1].trim();
    if (!text.startsWith("{")) {
      const s = text.indexOf("{");
      const e = text.lastIndexOf("}");
      if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
    }
    return JSON.parse(text) as object;
  } catch {
    return { summary: fallbackOverview, keyPoints: [], actionItems: [], enrichment: { contact: [], client: [] }, stageSignal: null };
  }
}

export type FirefliesIngestResult =
  | { status: "deduped"; id: string }
  | { status: "not_found" }
  | { status: "too_short" }
  | { status: "skipped"; reason: "title-no-match" }
  | { status: "created"; id: string };

/**
 * Ingest one Fireflies meeting by id → a PENDING IngestProposal. Idempotent on
 * the meeting id (IngestProposal.externalId is UNIQUE). Applies the title gate
 * unless `force`. An all-internal meeting routes to the firm_knowledge lane
 * (BLUE) instead of being skipped; a client meeting routes to client_records.
 */
export async function ingestFirefliesMeeting(opts: {
  meetingId: string;
  apiKey: string;
  force?: boolean;
}): Promise<FirefliesIngestResult> {
  // One ingest OpsEvent per call — covers the webhook AND the poll (both delegate
  // here), so neither double-logs. The inner generate() still logs its own
  // `claude` row (different grain: model call vs. ingest outcome).
  const t0 = Date.now();
  try {
    const result = await ingestOne(opts);
    void logOps({
      kind: "ingest",
      name: "fireflies",
      status: "ok",
      actor: "AGENT · CLAUDE",
      actorLabel: "AGENT · CLAUDE",
      durationMs: Date.now() - t0,
      detail: result.status,
      meta: { result: result.status, meetingId: opts.meetingId },
    });
    return result;
  } catch (e) {
    void logOps({
      kind: "ingest",
      name: "fireflies",
      status: "error",
      actor: "AGENT · CLAUDE",
      actorLabel: "AGENT · CLAUDE",
      durationMs: Date.now() - t0,
      error: e instanceof Error ? e.message : "fireflies ingest failed",
      meta: { meetingId: opts.meetingId },
    });
    throw e;
  }
}

async function ingestOne(opts: {
  meetingId: string;
  apiKey: string;
  force?: boolean;
}): Promise<FirefliesIngestResult> {
  const { meetingId, apiKey, force = false } = opts;

  // Idempotency — already ingested this meeting? (covers webhook + poll + force)
  const existing = await prisma.ingestProposal.findUnique({ where: { externalId: meetingId }, select: { id: true } });
  if (existing) return { status: "deduped", id: existing.id };

  const t = await fetchTranscript(meetingId, apiKey);
  if (!t) return { status: "not_found" };

  const transcript = flattenTranscript(t);
  if (transcript.trim().length < 40) return { status: "too_short" };

  const title = t.title ?? "Fireflies meeting";
  const meetingDate = t.date ? new Date(t.date) : new Date();
  const emails = attendeeEmails(t);

  // ── Title gate (skipped when force) ──
  if (!force && !titleMatches(title)) return { status: "skipped", reason: "title-no-match" };

  // Destination lane (3-lane Phase 4). An all-internal meeting — every known
  // attendee on a firm domain — is a team/firm sync, so it routes to
  // firm_knowledge (BLUE): logged at arm's length, feeding the firm brain only by
  // exception behind two gates. A meeting with an outside attendee (or no
  // attendee emails to judge by) stays a client record (GOLD). Title-matched
  // internal meetings are no longer skipped — that filter killed exactly the
  // meetings Lane 3 wants (docs/ingest-3-lane-plan.md §4a).
  const allInternal = emails.length > 0 && emails.every(isInternalEmail);
  const lane = allInternal ? "firm_knowledge" : "client_records";

  // Firm-knowledge meetings are firm-level: never tie to a client / contact /
  // deal (a partner on the call may also be a Contact row, which would mis-scope
  // it). Client meetings match an entity as before.
  const match = allInternal
    ? { contactId: null, clientId: null, dealId: null }
    : await matchContact(emails);

  // Meaning-level dedup (3-lane Phase 2/4): print the open tasks the model must
  // not re-propose. GOLD shows the matched client's board; BLUE shows the firm
  // board. Advisory — the exact findDuplicateOpenTask backstop at approve stays
  // the floor.
  let context = `## Meeting\nTitle: ${title}\nDate: ${meetingDate.toISOString().slice(0, 10)}\nSource: Fireflies`;
  if (allInternal) {
    context += `\nType: internal team meeting (every attendee is on the firm) — propose firm-level records only; do not invent a client.`;
    context += "\n" + formatOpenTaskCandidates(await fetchFirmOpenTaskCandidates(), "firm");
  } else if (match.clientId) {
    context += "\n" + formatOpenTaskCandidates(await fetchClientOpenTaskCandidates(match.clientId));
  }

  const raw = await generate({
    skill: "ingest-meeting",
    context,
    intake: `## Transcript\n${transcript}`,
    maxTokens: 3000,
  });
  const proposal = parseProposal(raw, t.summary?.overview ?? "");

  const created = await prisma.ingestProposal.create({
    data: {
      source: "fireflies",
      externalId: meetingId,
      title,
      meetingDate,
      transcript,
      proposal: proposal as object,
      // All-internal title-matched meeting -> firm_knowledge (BLUE); otherwise a
      // client meeting -> client_records (GOLD). See docs/ingest-3-lane-plan.md §4.
      lane,
      status: "pending",
      matchedContactId: match.contactId,
      matchedClientId: match.clientId,
      matchedDealId: match.dealId,
      createdBy: "AGENT · CLAUDE",
    },
    select: { id: true },
  });
  return { status: "created", id: created.id };
}
