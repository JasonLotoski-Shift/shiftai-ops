# Render HTML documents in their own tab (Documents section)

**Date:** 2026-06-18
**Status:** Design approved, pending spec review
**Scope:** Pipeline deal detail page → Documents section. (The same pattern can later extend to Client/Project document lists, but those are out of scope for this spec.)

## Problem

The Documents section on a deal (`app/(app)/pipeline/[id]/page.tsx`) lists `Artifact`
rows. Each artifact stores only a `driveUrl`, and clicking it opens the file directly in
Google Drive. For a **self-contained HTML deliverable** (e.g. a saved prototype, an HTML
report), Drive shows the raw source / forces a download instead of rendering it — the
partner sees "the script," not the document.

We already solved exactly this for the prototype worker: a server route fetches the HTML
and re-serves it as `text/html` with a sandboxing CSP, so the browser renders it. This
spec applies that proven pattern to the Documents section.

## Goal

Clicking a document opens it in a **new browser tab**, rendered:

- If the document is HTML → the new tab shows the **rendered** page (not the source).
- If the document is anything else (PDF, deck, sheet, Google Doc) → the new tab opens the
  Drive link, exactly as today.

The rendered output opens in its own browser tab, **not** embedded in the ops UI, so the
ops tool stays free/unblocked while the partner reads the document.

## Non-goals

- No in-app/iframe document viewer (explicitly rejected — the tool must stay free).
- No PDF/image rendering — non-HTML types keep the current Drive behavior.
- No schema migration. No backfill. No new storage copies of HTML.
- No changes to how artifacts are *created* or saved.

## Approach (chosen: "the route is the brain")

A single new route does all the deciding. The Documents UI changes only the link target.

### Data flow

1. Each document row in the Documents section links to `/api/artifacts/<id>/view`,
   opened with `target="_blank"` (new tab). (Today it links straight to `a.driveUrl`.)
2. The route (`app/api/artifacts/[id]/view/route.ts`, `GET`):
   1. `auth()` — require `session.user.partnerId`, else `401`. (Defense in depth; the
      route is already inside the middleware-gated set, but the prototype view route
      double-checks and we match that pattern.)
   2. Load the `Artifact` by `id` (Prisma, select `driveUrl`). `404` if not found.
   3. `fileId = fileIdFromUrl(artifact.driveUrl)` (existing helper in `lib/drive.ts`).
      If it returns `null` → fall back: `302` redirect to `artifact.driveUrl`.
   4. Fetch the file's metadata from Drive to read its `mimeType`
      (`drive.files.get({ fileId, fields: "mimeType", supportsAllDrives: true })`).
   5. **Decision:**
      - `mimeType === "text/html"` → `downloadDriveFile(fileId)` (existing helper,
        `alt=media`) → re-serve the bytes as `text/html` with the sandbox CSP below.
      - anything else → `302` redirect to `artifact.driveUrl` (current behavior).
   6. On any Drive error (file gone, permission, download fails) → `302` redirect to
      `artifact.driveUrl` so the partner always has a working fallback, never a dead end.

### The rendered response (HTML case)

Reuse the prototype view route's exact headers verbatim:

```
content-type: text/html; charset=utf-8
content-security-policy: sandbox allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads allow-top-navigation-by-user-activation
cache-control: no-store
```

The `sandbox` (with no `allow-same-origin`) puts the document in an **opaque origin** — a
self-contained or untrusted HTML deliverable cannot read the app's cookies or storage —
while the `allow-*` flags let any buttons/links/downloads inside the document behave the
same as in a standalone tab.

## Components

| Unit | Responsibility | Depends on |
|---|---|---|
| `app/api/artifacts/[id]/view/route.ts` (NEW) | Auth, look up artifact, decide HTML-render vs Drive-redirect, serve/redirect | `@/auth`, `@/lib/prisma`, `fileIdFromUrl` + `downloadDriveFile` + `drive` from `@/lib/drive` |
| Documents section in `app/(app)/pipeline/[id]/page.tsx` (EDIT) | Point each row's link at `/api/artifacts/<id>/view` (`target="_blank"`) instead of `a.driveUrl` | the new route |

Everything the route needs already exists in `lib/drive.ts` (`fileIdFromUrl`,
`downloadDriveFile`, the authenticated `drive` client). No new credentials — the existing
`GOOGLE_SERVICE_ACCOUNT_KEY_B64` service account is the auth.

## Error handling

- **Not logged in** → `401`.
- **Artifact not found** → `404`.
- **No file ID parseable / Drive metadata fails / download fails / non-HTML** →
  `302` redirect to `artifact.driveUrl`. The guiding rule: the partner should *never* hit
  a dead end — worst case they land on the same Drive link they get today.
- **`cache-control: no-store`** so a doc updated in Drive is never served stale, and the
  sandboxed HTML is never cached by intermediaries.

## Testing

- **Route unit/integration:**
  - HTML artifact → `200`, `content-type: text/html`, CSP header present, body is the file
    bytes (mock `drive.files.get` → `text/html` and `downloadDriveFile` → a Buffer).
  - Non-HTML artifact (e.g. `application/pdf`) → `302` to `driveUrl`.
  - Unparseable `driveUrl` → `302` to `driveUrl`.
  - Drive throws → `302` to `driveUrl`.
  - No session → `401`. Unknown id → `404`.
- **Manual (PILOT PETROLEUM):** open an HTML document from the Documents section → renders
  in a new tab; open a non-HTML document → opens in Drive as before; confirm the ops tab is
  still usable behind it.

## Risks / notes

- **Drive latency on view:** each HTML view does one metadata call + one download. Fine for
  human-click traffic; `no-store` means no caching. If this ever becomes hot, the future
  optimization is a Storage copy at creation (deliberately deferred — see Non-goals).
- **mimeType reliability:** depends on documents having been uploaded with `text/html`
  (which `uploadFile` already does for self-contained HTML). Google-native Docs report
  `application/vnd.google-apps.document` and correctly fall through to the Drive redirect.
- **Per-push checklist (CLAUDE.md):** this adds a partner-visible capability → add a
  `lib/data/updates.ts` entry and check whether the How-it-works page needs a line. Not a
  firm-money surface → no managing-partner gating needed. No migration.
