# Download a Document (as-is) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a per-row download action to the deal Documents list that streams the underlying Drive file as-is (native format), reusing the `/api/artifacts/[id]/view` route.

**Architecture:** Extend the existing route with a `?download=1` mode that serves the raw bytes as an `attachment` (real filename, real mimeType); native Google files (no raw bytes) fall back to the existing Drive redirect. A pure, injection-safe `contentDispositionAttachment(name)` helper builds the header. The Documents UI gains a `Download` icon per row.

**Tech Stack:** Next.js 15 route handler (Node runtime), `lib/drive.ts` (`downloadDriveFile`, `drive`, `fileIdFromUrl`), lucide-react `Download`. Tests: `node:assert/strict` via `npx tsx`.

## Global Constraints

- Download is byte-for-byte **as-is** — NO format conversion/export. Native Google Docs/Sheets/Slides (which `downloadDriveFile` can't fetch) fall back to a 302 to `driveUrl`.
- `Content-Disposition` filename is attacker-influenceable → MUST be sanitized (strip control/CR-LF, escape quotes/backslashes, RFC 5987 UTF-8 form). This is the one real security surface.
- Reuse the existing route's auth + lookup + `toDrive()` fallback; do not duplicate them.
- Gate: `npx tsc --noEmit` + `npx tsx lib/artifact-view.test.ts`. Do NOT gate on `npm run build` (known-flaky locally per memory `local-build-quirks`).
- Scope: `app/(app)/pipeline/[id]/page.tsx` only.

---

### Task 1: Pure `contentDispositionAttachment` helper + tests

**Files:**
- Modify: `lib/artifact-view.ts`
- Modify: `lib/artifact-view.test.ts`

**Interfaces:**
- Produces: `export function contentDispositionAttachment(name: string | null | undefined): string` → a safe `attachment; filename="<ascii>"; filename*=UTF-8''<enc>` header; blank/null → `document`.

- [ ] **Step 1: Extend the test** — append to `lib/artifact-view.test.ts`, and update its import line to include the new export:

Change the existing import line:
```ts
import { isRenderableHtml, SANDBOX_CSP } from "@/lib/artifact-view";
```
to:
```ts
import { isRenderableHtml, SANDBOX_CSP, contentDispositionAttachment } from "@/lib/artifact-view";
```

Then, immediately before the final `console.log(...)` line, insert:
```ts
// contentDispositionAttachment: normal name kept, with an RFC5987 utf8 form
{
  const h = contentDispositionAttachment("report.html");
  assert.ok(h.startsWith('attachment; filename="report.html"'), "normal name kept");
  assert.ok(h.includes("filename*=UTF-8''report.html"), "utf8 form present");
}
// header-injection guard: no CR/LF survives
{
  const h = contentDispositionAttachment("evil\r\nSet-Cookie: x=1.html");
  assert.ok(!/[\r\n]/.test(h), "no CR/LF survives in the header");
}
// quotes / backslashes neutralized in the ascii filename
{
  const h = contentDispositionAttachment('a"b\\c.pdf');
  assert.ok(h.includes('filename="a_b_c.pdf"'), "quotes and backslashes neutralized");
}
// non-ascii: ascii fallback sanitized, utf8 form carries the real bytes
{
  const h = contentDispositionAttachment("Café.md");
  assert.ok(h.includes('filename="Caf_.md"'), "non-ascii replaced in ascii fallback");
  assert.ok(h.includes("filename*=UTF-8''Caf%C3%A9.md"), "utf8 form percent-encodes");
}
// blank / null → "document"
assert.equal(
  contentDispositionAttachment("   "),
  `attachment; filename="document"; filename*=UTF-8''document`,
  "blank → document",
);
assert.equal(
  contentDispositionAttachment(null),
  `attachment; filename="document"; filename*=UTF-8''document`,
  "null → document",
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx lib/artifact-view.test.ts`
Expected: FAIL — `contentDispositionAttachment` is not exported yet.

- [ ] **Step 3: Implement the helper** — append to `lib/artifact-view.ts`:

```ts
// Builds a safe `Content-Disposition: attachment` header for a download. The
// filename comes from Drive (attacker-influenceable), so we strip control chars
// and CR/LF (header-injection guard), quote a sanitized ASCII fallback, and add
// an RFC 5987 UTF-8 form so non-ASCII names survive in modern browsers. Blank or
// nullish → "document".
export function contentDispositionAttachment(name: string | null | undefined): string {
  const clean = (name ?? "").replace(/[\x00-\x1f\x7f]/g, "").trim() || "document";
  const ascii = clean.replace(/[\\"]/g, "_").replace(/[^\x20-\x7e]/g, "_");
  const utf8 = encodeURIComponent(clean);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx lib/artifact-view.test.ts`
Expected: PASS — prints `artifact-view.test.ts OK`.

- [ ] **Step 5: Commit**

```bash
git add lib/artifact-view.ts lib/artifact-view.test.ts
git commit -m "feat(docs-viewer): safe Content-Disposition helper for downloads"
```

---

### Task 2: Add `?download=1` mode to the route

**Files:**
- Modify: `app/api/artifacts/[id]/view/route.ts`

**Interfaces:**
- Consumes: `contentDispositionAttachment` from `@/lib/artifact-view`; existing `downloadDriveFile`, `drive`, `fileIdFromUrl`.
- Produces: `GET /api/artifacts/[id]/view?download=1` → 200 attachment of the raw file bytes (real filename + mimeType, `nosniff`, `no-store`); native-Google / any Drive error → 302 to `driveUrl`. Without `download=1`, behavior is unchanged (HTML renders, else redirect).

Verified by `npx tsc --noEmit` + self-check (no route unit-test harness exists in this repo).

- [ ] **Step 1: Replace the route file** — `app/api/artifacts/[id]/view/route.ts`:

```ts
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { drive, fileIdFromUrl, downloadDriveFile } from "@/lib/drive";
import { isRenderableHtml, SANDBOX_CSP, contentDispositionAttachment } from "@/lib/artifact-view";

// googleapis needs Node APIs — never run this on the Edge.
export const runtime = "nodejs";

// Opens a deal Document. Artifacts only store a Drive link; opening an HTML file
// straight in Drive shows raw source, so for HTML we re-serve the bytes rendered
// (sandboxed). With ?download=1 we instead stream the file as an attachment in
// its native format. Anything we can't render/download — and any Drive failure —
// 302s to the Drive link, so the partner never hits a dead end.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.partnerId) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const artifact = await prisma.artifact.findUnique({ where: { id }, select: { driveUrl: true } });
  if (!artifact) return new Response("Not found", { status: 404 });
  // No Drive link to fall back to (e.g. a proposed deliverable saved with driveUrl: "").
  if (!artifact.driveUrl) return new Response("Not found", { status: 404 });

  const toDrive = () => Response.redirect(artifact.driveUrl, 302);
  const download = req.nextUrl.searchParams.get("download") === "1";

  const fileId = fileIdFromUrl(artifact.driveUrl);
  if (!fileId) return toDrive();

  try {
    const meta = await drive.files.get({ fileId, fields: "mimeType, name", supportsAllDrives: true });
    const mimeType = meta.data.mimeType ?? undefined;

    // Download mode: stream the raw file as-is, as an attachment. Native Google
    // files have no raw bytes — downloadDriveFile throws → caught → toDrive()
    // (open in Drive), the intended "as-is or Drive" fallback. Attachment means
    // even HTML is downloaded, not executed — no XSS surface here.
    if (download) {
      const bytes = await downloadDriveFile(fileId);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "content-type": mimeType || "application/octet-stream",
          "content-disposition": contentDispositionAttachment(meta.data.name),
          "x-content-type-options": "nosniff",
          "cache-control": "no-store",
        },
      });
    }

    // View mode: render HTML inline behind the sandbox CSP; else open in Drive.
    if (!isRenderableHtml(mimeType)) return toDrive();
    const bytes = await downloadDriveFile(fileId);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": SANDBOX_CSP,
        "cache-control": "no-store",
      },
    });
  } catch {
    return toDrive();
  }
}
```

- [ ] **Step 2: Type-check** — Run: `npx tsc --noEmit` → clean.

- [ ] **Step 3: Self-check** — confirm: 401/404 unchanged; `download=1` → attachment with `contentDispositionAttachment` + nosniff; native-Google download throws → caught → 302; view mode byte-identical to before.

- [ ] **Step 4: Commit**

```bash
git add "app/api/artifacts/[id]/view/route.ts"
git commit -m "feat(docs-viewer): ?download=1 streams the file as-is as an attachment"
```

---

### Task 3: Download icon on each Documents row

**Files:**
- Modify: `app/(app)/pipeline/[id]/page.tsx`

**Interfaces:** Consumes the route's `?download=1`. Produces a per-row download link.

- [ ] **Step 1: Import the icon** — in `app/(app)/pipeline/[id]/page.tsx`, add `Download` to the existing `lucide-react` import (which already brings in `FileText`, `ExternalLink`, `FolderOpen`). E.g. add `Download,` to that import list.

- [ ] **Step 2: Add the download link** — in the Documents `artifacts.map`, insert a download anchor between the row's closing `</a>` (the open-in-tab link, ending with the `ExternalLink` icon) and the `<ArtifactDeleteControl ... />`:

```tsx
                  <a
                    href={`/api/artifacts/${a.id}/view?download=1`}
                    download
                    title="Download"
                    aria-label={`Download ${a.title}`}
                    className="self-center px-2 text-bone-mute hover:text-track-gold opacity-0 group-hover/doc:opacity-100 focus-within:opacity-100 transition-opacity"
                  >
                    <Download size={14} strokeWidth={1.5} />
                  </a>
```

Leave the open-in-tab anchor and the `ArtifactDeleteControl` exactly as they are.

- [ ] **Step 3: Type-check** — Run: `npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/pipeline/[id]/page.tsx"
git commit -m "feat(docs-viewer): download icon on each deal Documents row"
```

---

### Task 4: Changelog + How-it-works

**Files:**
- Modify: `lib/data/updates.ts`
- Modify: `components/how-it-works-view.tsx`

- [ ] **Step 1: Changelog** — add at the TOP of the `updates` array in `lib/data/updates.ts`:

```ts
  {
    date: "2026-06-18",
    tag: "improved",
    title: "Download a document straight from a deal",
    detail:
      "Each document on a deal now has a download button next to it — grab the file as-is (the HTML, PDF, Markdown, whatever it is) without opening Drive first. Opening it in its own tab still works too.",
  },
```

- [ ] **Step 2: How-it-works** — in `components/how-it-works-view.tsx`, replace the existing Artifact line:

```tsx
            <PhaseLi><b>Artifact.</b> Every saved draft files to the deal&apos;s Drive folder and shows on the deal; HTML documents open rendered in their own tab.</PhaseLi>
```
with:
```tsx
            <PhaseLi><b>Artifact.</b> Every saved draft files to the deal&apos;s Drive folder and shows on the deal; HTML documents open rendered in their own tab, and any document can be downloaded straight from the list.</PhaseLi>
```

- [ ] **Step 3: Type-check** — Run: `npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add lib/data/updates.ts components/how-it-works-view.tsx
git commit -m "docs(docs-viewer): changelog + how-it-works note for document download"
```

---

## Final verification

- [ ] `npx tsx lib/artifact-view.test.ts` → `artifact-view.test.ts OK`
- [ ] `npx tsc --noEmit` → clean
- [ ] Manual (after deploy): download an HTML doc → `.html` saves (not rendered); download a PDF → `.pdf` saves; open-in-tab still renders; a Google-native Doc's download opens Drive.
