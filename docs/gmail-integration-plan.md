# Gmail Integration — label-based poll (design)

> **Status:** design / pre-build (2026-06-06). Decided approach: **label-based poll** — a
> partner applies a Gmail label to threads they want logged; a scheduled poller ingests
> *only* labeled threads into pending `IngestProposal`s for review. Nothing auto-writes.
> **One open fork before code:** the auth model (§2).
> **Parent:** [integrations-plan equivalent]; sibling of the Fireflies ingest path
> (`app/api/ingest/fireflies/route.ts`).

---

## 1. Goal & guardrails

Auto-log **selected** client email into the CRM timeline — the partner chooses which threads
by labeling them. Hard guardrails (Jason's requirement: *don't expose the whole inbox*):

- **Read-only** Gmail access (`gmail.readonly`), never send/modify/delete.
- We only ever fetch threads carrying the chosen **label** — the API query is label-scoped,
  so the inbox is never listed wholesale.
- **Propose-never-auto-write** — every email becomes a *pending* `IngestProposal` reviewed in
  `/ingest`, exactly like Fireflies meetings.
- Only **partner** mailboxes are read; client/third-party mailboxes never are.

---

## 2. Auth model — THE decision (blocks code)

How does the server read a partner's labeled threads? Three options:

### Option A — Per-partner OAuth, separate "Connect Gmail" flow  ★ recommended
A "Connect Gmail" button in Settings runs an incremental OAuth consent (read-only Gmail) and we
store each partner's **refresh token** (encrypted). The poller uses each partner's own token.
- **+** Opt-in, per-partner, **revocable** (partner can disconnect; or revoke in Google account).
- **+** Token scoped to `gmail.readonly` for **that user only** — no domain-wide capability.
- **+** Builds on the Google OAuth you already run in `auth.ts`.
- **+** Consent screen set to **Internal** (Workspace-only app) ⇒ Google's sensitive-scope
  verification process is **not** required.
- **−** Build a small OAuth connect flow + encrypted token storage + refresh handling.

### Option B — Extend the existing sign-in to also request Gmail scope
Add `gmail.readonly` to the sign-in scopes; capture the refresh token in the `jwt` callback.
- **+** Least new code.
- **−** Couples Gmail-read consent to **login** — every partner grants mailbox read just to sign
  in. Can't sign in without granting it. Worse separation of concerns.

### Option C — Service-account Domain-Wide Delegation (DWD)
A service account impersonates each partner; one-time Workspace-admin authorization, no per-user
consent. (Reuse the Drive SA or, better, a dedicated Gmail SA.)
- **+** Zero per-user consent; fully headless; simplest poller.
- **−** The service account is **technically capable of reading any mailbox in the domain**. We
  restrict in code (read-only + label-only + partners-only), but the capability exists, and a
  leaked SA key = domain-wide Gmail exposure. Bigger blast radius than one user's OAuth token.

**Recommendation: Option A.** It matches the "tightly scoped, don't over-expose" requirement,
is revocable per partner, and reuses the Google OAuth already in the app. Internal consent screen
removes the only real friction (verification). DWD is the fastest to build but the broadest grant.

---

## 3. End-to-end flow

```
Partner applies the label to a thread in Gmail (e.g. "ops-log")
        │
        ▼  cron (hourly, Vercel Pro)  →  /api/cron/gmail-poll
  for each connected partner:
    list NEW labeled messages since the stored cursor (historyId)
        │
        ▼  for each new message
    parse headers (From/To/Subject/Date) + body
        │
        ▼  match a Contact/Client by the external participant email
        ▼  extract via the `ingest-email` skill (summary, direction, action items)
        │
        ▼  create PENDING IngestProposal (source: gmail, externalId: messageId)
        │
        ▼  advance the partner's cursor
        │
        ▼  partner reviews in /ingest  →  approve
  → Interaction (email_sent | email_received) on the contact
  + tasks from action items + append-only enrichment + Artifact? (optional) + AuditLog
```

---

## 4. Data model changes  ⚠️ prod migration — needs explicit approval

> **Gotcha (memory: ops-prod-deploy-model):** `npx prisma migrate dev` locally applies to the
> **same Supabase as prod**. So *any* migration here touches prod. Do **not** run until Jason
> green-lights. All changes below are **additive** (new enum value, new tables/columns) — low
> risk, no data rewrite — but still gated.

1. `enum IngestSource { paste fireflies drop gmail }`  ← add `gmail`.
2. New model **`IngestSyncState`** — incremental poll cursor, one row per (partner, source):
   ```prisma
   model IngestSyncState {
     id        String   @id @default(cuid())
     partnerId String
     source    IngestSource
     cursor    String?   // Gmail historyId (or last-poll ISO ts on bootstrap)
     updatedAt DateTime  @updatedAt
     partner   Partner   @relation(fields: [partnerId], references: [id])
     @@unique([partnerId, source])
   }
   ```
3. **Option A only** — token storage:
   ```prisma
   model PartnerGmailAuth {
     id           String   @id @default(cuid())
     partnerId    String   @unique
     email        String
     refreshToken String   // AES-GCM encrypted at rest (TOKEN_ENC_KEY)
     scope        String
     connectedAt  DateTime @default(now())
     partner      Partner  @relation(fields: [partnerId], references: [id])
   }
   ```
4. `IngestProposal.externalId` is already `@unique` → reuse it for the **Gmail message id**
   (idempotency; a re-poll never double-logs).

---

## 5. Files to create / change

| Path | What |
|---|---|
| `prisma/schema.prisma` | enum + `IngestSyncState` (+ `PartnerGmailAuth` for Opt A) |
| `prisma/migrations/<ts>_gmail_ingest/` | the additive migration (run only on approval) |
| `lib/gmail.ts` | Gmail client builder (per-partner OAuth token **or** DWD impersonation) |
| `lib/crypto.ts` | AES-GCM encrypt/decrypt for refresh tokens (Opt A) |
| `app/(app)/settings/gmail/` | "Connect Gmail" button + status (Opt A) |
| `app/api/auth/gmail/callback/route.ts` | OAuth callback → store token (Opt A) |
| `app/api/cron/gmail-poll/route.ts` | the poller (cron-secret protected) |
| `skills/ingest-email/SKILL.md` | extraction skill (JSON contract below) |
| `app/(app)/ingest/*` | minor: render `source: "gmail"` + email direction on the card |
| `vercel.json` | cron entry for the poll |
| `lib/data/updates.ts`, How-it-works | partner-facing change notes (before deploy) |

---

## 6. The poll (incremental, idempotent)

- **Label → id:** `users.labels.list` → find the label by name (`GMAIL_INGEST_LABEL`).
- **First run (no cursor):** `users.messages.list({ q: "label:ops-log", maxResults })`, then
  fetch each; store the mailbox's current `historyId`.
- **Subsequent runs:** `users.history.list({ startHistoryId, historyTypes: ["labelAdded","messageAdded"], labelId })`
  → only messages newly labeled / newly arrived in labeled threads.
- **Per message:** `users.messages.get({ id, format: "full" })` → headers + body (walk MIME
  parts, base64url-decode `text/plain`, fall back to stripped `text/html`).
- **Skip** messages whose id already exists as an `IngestProposal.externalId`.
- **Advance** the per-partner `cursor` to the newest `historyId` seen.

---

## 7. Matching & internal gating

- Collect the message's participant emails (From/To/Cc).
- Match a `Contact` by email → its primary `Client` (or `Deal`); mirror the Fireflies matcher
  (exactly one match → assign; 0 or many → unassigned for the partner to attach).
- **Internal gate:** if every participant is on a firm domain (`shiftai.partners` / `shiftcg.ai`)
  → skip (an internal email a partner labeled by accident shouldn't create a client proposal).
- **Direction:** From-address on a firm domain ⇒ `email_sent` (we sent it); else `email_received`.

---

## 8. `ingest-email` skill — JSON contract

Mirrors the `ingest-meeting` output shape so the existing `/ingest` review UI renders it with no
new card type:

```json
{
  "summary": "1–3 sentence gist of the email",
  "direction": "sent | received",
  "keyPoints": ["..."],
  "actionItems": [{ "title": "...", "owner": "name|null", "context": "...", "due": "YYYY-MM-DD|null" }],
  "enrichment": { "contact": [{ "field": "...", "value": "..." }], "client": [] },
  "stageSignal": { "suggestion": "stage", "rationale": "..." }
}
```

System prompt = firm brain + this skill (cached), per `lib/ai.ts`.

---

## 9. Review & approve

- `/ingest` already renders v1 (`ExtractedProposal`) and v2 proposals and shows `source`.
  Email proposals reuse the v1 shape → only cosmetic work (a "Gmail" badge + the From/To line).
- **Approve** path (extend, don't break the meeting path): create an `Interaction` whose `type`
  comes from `direction` (`email_sent` / `email_received`), `channel: "gmail"`, on the matched
  contact; plus tasks from approved action items; plus append-only enrichment; plus `AuditLog`.
  Requires a resolved `contactId` (Interaction.contactId is required) — unassigned proposals
  prompt the partner to attach/create a contact first.

---

## 10. Idempotency & granularity

- **Granularity:** one proposal per **message** (each email = one logged interaction — matches
  "log sent and received emails"). Deduped on Gmail message id.
- **Trade-off:** a chatty labeled thread = several proposals. Acceptable v1 (the partner controls
  volume by what they label). *Future:* roll a thread's new messages into one proposal.
- **Attachments:** ignored in v1. *Future:* feed attachments (PDF/docx/xlsx) through the
  doc-parsing path from the nightly-ingest build.

---

## 11. Cron & ops

- `vercel.json` cron → `/api/cron/gmail-poll`, hourly (Pro plan; Hobby can't sub-daily).
- Protect with `CRON_SECRET` (Vercel adds `Authorization: Bearer $CRON_SECRET`; verify it).
- Token refresh (Opt A): exchange refresh→access per poll; if refresh fails (revoked), mark the
  partner disconnected and notify them.

---

## 12. Config steps (yours)

**Option A (recommended):**
1. GCP project `shift-ai-ops`: enable **Gmail API**.
2. OAuth consent screen → **Internal**; add scope `https://www.googleapis.com/auth/gmail.readonly`.
3. Create an **OAuth client** (or reuse the sign-in client) + set redirect to
   `https://ops.shiftai.partners/api/auth/gmail/callback`.
4. Env: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GMAIL_INGEST_LABEL=ops-log`,
   `TOKEN_ENC_KEY` (32-byte hex), `CRON_SECRET`.
5. Each partner clicks **Connect Gmail** in Settings, then labels client threads `ops-log`.

**Option C (DWD) instead:** enable Gmail API; in Workspace Admin → Security → API controls →
**Domain-Wide Delegation** → add the SA client id + `gmail.readonly` (super admin; ~60 min to
propagate). Env: `GMAIL_INGEST_LABEL`, `CRON_SECRET` (reuse `GOOGLE_SERVICE_ACCOUNT_KEY_B64`).

---

## 13. Defaults chosen (say the word to change)

- Label name: **`ops-log`**.
- Partners: **all three** (each connects / is impersonated).
- Poll frequency: **hourly**.
- Granularity: **per message**; attachments **ignored** v1.

---

## 14. Build order

1. **(needs your pick)** Auth model → then `lib/gmail.ts` + (Opt A) connect flow + token store.
2. `skills/ingest-email/SKILL.md` — *auth-agnostic, can start now.*
3. Schema additions + migration (drafted now; **run only on approval**).
4. `/api/cron/gmail-poll` + matching + extraction.
5. `/ingest` cosmetic (Gmail badge, direction) + approve-path extension.
6. `vercel.json` cron + `lib/data/updates.ts` + How-it-works.

---

## 15. Open decisions

- **Auth model** — A / B / C (recommend **A**).  ← blocks code
- Label name (`ops-log`?), partners (all 3?), frequency (hourly?) — defaults above, change freely.
- Confirm OK to draft the migration now and run it **only** on your explicit go.
