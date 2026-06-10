// Per-partner Gmail read access for the label-based ingest poll.
//
// Auth model (decided 2026-06-06): each partner connects via OAuth (read-only);
// we hold their refresh token (encrypted, lib/crypto.ts) and mint an access
// token per poll. Reuses the app's existing Google OAuth client — set
// GOOGLE_OAUTH_CLIENT_ID/SECRET, or it falls back to AUTH_GOOGLE_ID/SECRET (the
// same client Auth.js sign-in uses). On the consent screen, add the
// gmail.readonly scope and the gmail callback redirect URI.
//
// READ-ONLY by construction: the only scope is gmail.readonly, and every fetch
// is label-scoped — we never list the whole inbox. Contract:
// docs/gmail-integration-plan.md. Server-only.

import { google, gmail_v1 } from "googleapis";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

function clientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth client not configured — set GOOGLE_OAUTH_CLIENT_ID/SECRET (or reuse AUTH_GOOGLE_ID/SECRET).",
    );
  }
  return { clientId, clientSecret };
}

function oauthClient(redirectUri?: string) {
  const { clientId, clientSecret } = clientCreds();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// ── Connect flow (the "Connect Gmail" button) ──

/** Consent URL — offline access + forced consent so Google returns a refresh token. */
export function connectUrl(redirectUri: string, state: string): string {
  return oauthClient(redirectUri).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_SCOPE],
    include_granted_scopes: true,
    state,
  });
}

/** Exchange the OAuth callback code for tokens. The refresh_token is what we store. */
export async function exchangeCode(code: string, redirectUri: string) {
  const { tokens } = await oauthClient(redirectUri).getToken(code);
  return tokens;
}

/** Revoke a partner's grant at Google — best-effort on disconnect. */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: refreshToken });
  await auth.revokeToken(refreshToken);
}

/** Pull the granted account's email from the id_token. No verification needed —
 *  it came straight from Google's token endpoint over TLS. */
export function emailFromIdToken(idToken?: string | null): string | null {
  const payloadB64 = idToken?.split(".")[1];
  if (!payloadB64) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as { email?: unknown };
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

// ── Reading a partner's labeled mail ──

/** A Gmail client authed as the partner who owns this refresh token. */
export function gmailForRefreshToken(refreshToken: string): gmail_v1.Gmail {
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth });
}

/** Resolve a label name → its id (null if the partner hasn't created the label). */
export async function resolveLabelId(gmail: gmail_v1.Gmail, name: string): Promise<string | null> {
  const res = await gmail.users.labels.list({ userId: "me" });
  const found = res.data.labels?.find((l) => l.name?.toLowerCase() === name.toLowerCase());
  return found?.id ?? null;
}

/** Current mailbox historyId — store as the cursor after a successful poll. */
export async function currentHistoryId(gmail: gmail_v1.Gmail): Promise<string | null> {
  const res = await gmail.users.getProfile({ userId: "me" });
  return res.data.historyId ?? null;
}

/** First-run bootstrap: list recent message ids carrying the label directly. */
export async function bootstrapLabeledIds(
  gmail: gmail_v1.Gmail,
  labelId: string,
  max = 25,
): Promise<string[]> {
  const res = await gmail.users.messages.list({ userId: "me", labelIds: [labelId], maxResults: max });
  return (res.data.messages ?? []).map((m) => m.id).filter((id): id is string => !!id);
}

/**
 * Incremental: message ids newly labeled / newly arrived in labeled threads
 * since `startHistoryId`. Returns the ids plus the latest historyId to persist.
 */
export async function newLabeledIds(
  gmail: gmail_v1.Gmail,
  startHistoryId: string,
  labelId: string,
): Promise<{ ids: string[]; latestHistoryId: string }> {
  const ids = new Set<string>();
  let latest = startHistoryId;
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      labelId,
      historyTypes: ["labelAdded", "messageAdded"],
      pageToken,
    });
    for (const h of res.data.history ?? []) {
      for (const m of h.messagesAdded ?? []) if (m.message?.id) ids.add(m.message.id);
      for (const la of h.labelsAdded ?? []) if (la.message?.id) ids.add(la.message.id);
    }
    if (res.data.historyId) latest = res.data.historyId;
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return { ids: [...ids], latestHistoryId: latest };
}

// ── Message parsing ──

export type ParsedEmail = {
  id: string;
  threadId: string;
  subject: string;
  from: string; // first email address in the From header, lowercased
  to: string[];
  cc: string[];
  date: Date;
  body: string; // plain text (HTML stripped); capped
  // Attachment parts (metadata only — bytes fetched separately via fetchAttachment).
  attachments: { fileName: string; mimeType: string; attachmentId: string; size: number }[];
};

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeB64Url(data?: string | null): string {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

/** Walk the MIME tree, preferring text/plain; fall back to stripped text/html. */
function extractBody(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decodeB64Url(part.body.data);
  if (part.parts?.length) {
    const plain = part.parts.find((p) => p.mimeType === "text/plain" && p.body?.data);
    if (plain) return decodeB64Url(plain.body!.data);
    const joined = part.parts.map(extractBody).filter(Boolean).join("\n");
    if (joined) return joined;
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeB64Url(part.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return "";
}

/** Walk the MIME tree collecting attachment parts (anything with a filename + attachmentId). */
function collectAttachments(
  part: gmail_v1.Schema$MessagePart | undefined,
  out: ParsedEmail["attachments"],
): void {
  if (!part) return;
  if (part.filename && part.body?.attachmentId) {
    out.push({
      fileName: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      attachmentId: part.body.attachmentId,
      size: part.body.size ?? 0,
    });
  }
  for (const p of part.parts ?? []) collectAttachments(p, out);
}

function emailsIn(headerVal: string): string[] {
  return [...headerVal.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)].map((m) => m[0].toLowerCase());
}

/** Fetch one message and flatten it for matching + extraction. */
export async function getEmail(gmail: gmail_v1.Gmail, id: string): Promise<ParsedEmail> {
  const res = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  const m = res.data;
  const headers = m.payload?.headers ?? undefined;
  const dateMs = m.internalDate ? Number(m.internalDate) : NaN;
  const attachments: ParsedEmail["attachments"] = [];
  collectAttachments(m.payload ?? undefined, attachments);
  return {
    id: m.id ?? id,
    threadId: m.threadId ?? "",
    subject: headerValue(headers, "Subject"),
    from: emailsIn(headerValue(headers, "From"))[0] ?? "",
    to: emailsIn(headerValue(headers, "To")),
    cc: emailsIn(headerValue(headers, "Cc")),
    date: Number.isNaN(dateMs) ? new Date() : new Date(dateMs),
    body: (extractBody(m.payload ?? undefined) || m.snippet || "").slice(0, 20_000),
    attachments,
  };
}

/** Fetch one attachment's bytes (Gmail returns base64url-encoded `data`). */
export async function fetchAttachment(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const res = await gmail.users.messages.attachments.get({ userId: "me", messageId, id: attachmentId });
  return Buffer.from(res.data.data ?? "", "base64url");
}
