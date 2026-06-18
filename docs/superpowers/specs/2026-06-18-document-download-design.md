# Download a document from the Documents section (as-is)

**Date:** 2026-06-18
**Status:** Design approved, pending spec review
**Builds on:** `2026-06-18-document-render-tab-design.md` (the `/api/artifacts/[id]/view` route + Documents UI shipped there).
**Scope:** Pipeline deal detail page → Documents section only.

## Problem

We just shipped "open a document in its own rendered tab." The Documents list should
also let a partner **download** a document straight from the row — getting the actual
file, in its native format (HTML as `.html`, Markdown as `.md`, PDF as `.pdf`, …), not a
converted or re-formatted version.

## Goal

Each Documents row gains a **download** action alongside the existing open-in-tab link.
Clicking it downloads the underlying Drive file as-is, with its real filename, via the
service account (so it works regardless of the partner's individual Drive permissions and
stays consistent with how the view route already fetches bytes).

## Non-goals

- No format conversion. We do **not** export Google Docs/Sheets/Slides to PDF/Office/text.
  Those native files have no raw bytes, so "download as-is" is impossible — they fall back
  to the existing "open in Drive" behavior (the partner downloads from Drive in whatever
  format they pick). Everything that *is* a real file (HTML, MD, PDF, images, …) downloads
  directly.
- No schema change, no new storage.
- Scope stays on the deal/company Documents list (`pipeline/[id]`). The client/project
  document lists are out of scope (could adopt later).

## Approach

### Route: add a download mode to the existing route

Extend `app/api/artifacts/[id]/view/route.ts` with a `?download=1` query param. It reuses
the same auth + artifact lookup + Drive-link fallback already there; only the final
serving differs:

1. `auth()` → 401 if no `session.user.partnerId`.
2. Load `Artifact` by id (`driveUrl`); 404 if missing or `driveUrl` empty.
3. `fileId = fileIdFromUrl(driveUrl)`; null → 302 to `driveUrl`.
4. `drive.files.get({ fileId, fields: "mimeType, name", supportsAllDrives: true })`.
5. **If `?download=1`:** `downloadDriveFile(fileId)` → serve the bytes with
   - `content-type: <the file's mimeType>` (or `application/octet-stream` if unknown),
   - `content-disposition: attachment; filename="<name>"; filename*=UTF-8''<enc>` so the
     browser downloads (never renders) with the file's real name,
   - `x-content-type-options: nosniff`, `cache-control: no-store`.
   A native Google file makes `downloadDriveFile` (alt=media) throw → caught → 302 to
   `driveUrl` (open in Drive). This is the intended "as-is or Drive" behavior.
6. **Else (existing view mode):** unchanged — `text/html` renders inline behind the
   sandbox CSP, everything else 302s to `driveUrl`.
7. Any Drive error → 302 to `driveUrl`. The partner never hits a dead end.

`attachment` disposition means even an HTML file is **downloaded, not executed**, so the
download path has no XSS surface (no CSP needed there).

### Pure helper: safe Content-Disposition

Add `contentDispositionAttachment(name)` to `lib/artifact-view.ts` (pure, unit-tested). It
must be injection-safe: a filename is attacker-influenceable (it's the Drive file name), so
strip control chars / CR-LF (header-injection guard), escape `"`/`\` in the ASCII
`filename`, and add an RFC 5987 `filename*=UTF-8''…` for full-fidelity non-ASCII names.
Empty/blank → `"document"`.

### UI: a download icon per row

On the deal Documents list (`app/(app)/pipeline/[id]/page.tsx`), add a small `Download`
(lucide) icon between the row's open-in-tab anchor and the `ArtifactDeleteControl`. It's a
plain same-origin `<a href="/api/artifacts/${a.id}/view?download=1" download>` — no client
component needed — revealed on hover with the same classes as the delete control
(`opacity-0 group-hover/doc:opacity-100 focus-within:opacity-100 transition-opacity`).
Open-in-tab stays exactly as is.

## Components

| Unit | Responsibility | Depends on |
|---|---|---|
| `lib/artifact-view.ts` (EDIT) | add pure `contentDispositionAttachment(name)` | — |
| `lib/artifact-view.test.ts` (EDIT) | cover the new helper (normal, CRLF/control, quotes, non-ASCII, empty) | the helper |
| `app/api/artifacts/[id]/view/route.ts` (EDIT) | add `?download=1` attachment mode; rename `_req`→`req` to read `req.nextUrl.searchParams` | `downloadDriveFile`, `drive`, `fileIdFromUrl`, the helper |
| `app/(app)/pipeline/[id]/page.tsx` (EDIT) | add the download icon link per row; import `Download` from lucide-react | the route |

## Testing

- **Pure (`npx tsx lib/artifact-view.test.ts`):** `contentDispositionAttachment` —
  `report.html` → `attachment; filename="report.html"`; a name with `\r\n`/control chars →
  output contains no CR/LF; a name with `"`/`\` → escaped to `_` in the ASCII part; a
  non-ASCII name (e.g. `Café.md`) → ASCII part sanitized AND a `filename*=UTF-8''` part
  present; empty/blank → `document`.
- **Typecheck:** `npx tsc --noEmit` clean.
- **Manual (after deploy):** on a deal with an HTML doc, click download → the `.html` file
  saves (not rendered); click download on a PDF → the `.pdf` saves; open-in-tab still
  renders HTML; a Google-native Doc's download falls back to opening Drive.

## Risks / notes

- **Filename header injection** is the one real security concern — handled by the pure
  helper's sanitization + a unit test asserting no CR/LF survives.
- **Build gate:** `npx tsc --noEmit` + the unit test (local `npm run build` is known-flaky
  per memory `local-build-quirks`; Vercel builds fine).
- **Pre-push checklist:** partner-noticeable → add a `lib/data/updates.ts` entry; not a
  firm-money surface → no gating; no migration.
