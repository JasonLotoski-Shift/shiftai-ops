# Render HTML Documents in Their Own Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking a Document on a deal opens it in a new browser tab, rendered if it's HTML and redirected to Drive otherwise.

**Architecture:** One new Node route (`/api/artifacts/[id]/view`) is the brain: it auths the partner, looks up the `Artifact`, asks Drive for the file's mimeType, and either re-serves the HTML bytes as `text/html` (sandboxed CSP) or 302-redirects to the Drive link. The routing decision and CSP live in a small pure module (`lib/artifact-view.ts`) so they're unit-testable without auth/Prisma/googleapis. The Documents UI changes only one `href`.

**Tech Stack:** Next.js 15 App Router route handler (Node runtime), Auth.js v5 (`auth()`), Prisma 7, `lib/drive.ts` service-account Drive client (`fileIdFromUrl`, `downloadDriveFile`, `drive`). Tests are `node:assert/strict` files run with `npx tsx`.

## Global Constraints

- Reuse the prototype view route's **exact** CSP verbatim: `sandbox allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads allow-top-navigation-by-user-activation`. No `allow-same-origin` — ever (opaque origin is the security point).
- No schema migration, no backfill, no new storage copies. Drive bytes are fetched on the fly.
- Use the existing singleton `drive` client and helpers from `@/lib/drive` — do NOT construct a new googleapis client. Auth is the existing `GOOGLE_SERVICE_ACCOUNT_KEY_B64` service account.
- The partner must NEVER hit a dead end: any failure (no file id, Drive error, non-HTML) falls back to a 302 to `artifact.driveUrl`.
- Authoritative gate is `npx tsc --noEmit` + the unit test. Do **not** gate on `npm run build` locally — it is known-flaky here for heap/missing-Drive-key reasons unrelated to code (see memory `local-build-quirks`); Vercel builds fine.
- Tests: plain `.ts` files using `import assert from "node:assert/strict"`, ending with `console.log("<file> OK")`, run via `npx tsx <path>`.

---

### Task 1: Pure view-decision module (`lib/artifact-view.ts`)

**Files:**
- Create: `lib/artifact-view.ts`
- Test: `lib/artifact-view.test.ts`

**Interfaces:**
- Produces:
  - `export const SANDBOX_CSP: string` — the exact prototype CSP.
  - `export function isRenderableHtml(mimeType: string | null | undefined): boolean` — true only when the base mimeType (before any `;`) is `text/html`, case/whitespace-insensitive.

- [ ] **Step 1: Write the failing test** — `lib/artifact-view.test.ts`

```ts
// lib/artifact-view.test.ts — run: npx tsx lib/artifact-view.test.ts
import assert from "node:assert/strict";
import { isRenderableHtml, SANDBOX_CSP } from "@/lib/artifact-view";

// renders inline
assert.equal(isRenderableHtml("text/html"), true, "text/html renders");
assert.equal(isRenderableHtml("text/html; charset=utf-8"), true, "charset suffix renders");
assert.equal(isRenderableHtml("  TEXT/HTML "), true, "case + whitespace tolerant");

// falls through to the Drive redirect
assert.equal(isRenderableHtml("application/pdf"), false, "pdf redirects");
assert.equal(isRenderableHtml("application/vnd.google-apps.document"), false, "google doc redirects");
assert.equal(isRenderableHtml("image/png"), false, "image redirects");
assert.equal(isRenderableHtml(null), false, "null redirects");
assert.equal(isRenderableHtml(undefined), false, "undefined redirects");
assert.equal(isRenderableHtml(""), false, "empty redirects");

// CSP: sandboxed, interactive, but NOT same-origin (the whole security point)
assert.ok(SANDBOX_CSP.startsWith("sandbox"), "is a sandbox CSP");
assert.ok(SANDBOX_CSP.includes("allow-scripts"), "allows scripts so the doc is interactive");
assert.ok(!SANDBOX_CSP.includes("allow-same-origin"), "must NOT allow same-origin");

console.log("artifact-view.test.ts OK");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx lib/artifact-view.test.ts`
Expected: FAIL — cannot resolve `@/lib/artifact-view` (module doesn't exist yet).

- [ ] **Step 3: Write the minimal implementation** — `lib/artifact-view.ts`

```ts
// Pure routing logic for the in-tab document viewer. Kept separate from the
// route handler so it can be unit-tested without pulling in auth / Prisma /
// googleapis. The route (app/api/artifacts/[id]/view/route.ts) is thin glue
// around these.

// Content-Security-Policy used when we re-serve a document's HTML from our own
// origin. `sandbox` with NO `allow-same-origin` forces an OPAQUE origin, so a
// self-contained (or untrusted) HTML deliverable can't read the app's cookies
// or storage; the allow-* flags let the document's own buttons, links,
// downloads and modals behave exactly as in a standalone tab. Identical to the
// prototype view route's CSP — keep them in sync.
export const SANDBOX_CSP =
  "sandbox allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads allow-top-navigation-by-user-activation";

// True only for HTML we should render inline. Drive reports self-contained HTML
// (uploaded via uploadFile with mimeType "text/html") as "text/html"; native
// Google Docs report "application/vnd.google-apps.document" and everything else
// (PDF, slides, sheets, images) reports its own type — all of which fall through
// to the Drive redirect. Tolerates a "; charset=..." suffix and odd casing.
export function isRenderableHtml(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return mimeType.split(";")[0].trim().toLowerCase() === "text/html";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx lib/artifact-view.test.ts`
Expected: PASS — prints `artifact-view.test.ts OK`.

- [ ] **Step 5: Commit**

```bash
git add lib/artifact-view.ts lib/artifact-view.test.ts
git commit -m "feat(docs-viewer): pure HTML-render decision + sandbox CSP"
```

---

### Task 2: The proxy route (`app/api/artifacts/[id]/view/route.ts`)

**Files:**
- Create: `app/api/artifacts/[id]/view/route.ts`

**Interfaces:**
- Consumes: `auth` from `@/auth`; `prisma` from `@/lib/prisma`; `drive`, `fileIdFromUrl`, `downloadDriveFile` from `@/lib/drive`; `isRenderableHtml`, `SANDBOX_CSP` from `@/lib/artifact-view`.
- Produces: a Next.js route handler `GET` at path `/api/artifacts/[id]/view`. Behavior:
  - no session → `401`; unknown artifact id → `404`;
  - HTML file → `200` `text/html` body = the file bytes, with `content-security-policy: <SANDBOX_CSP>` and `cache-control: no-store`;
  - non-HTML, unparseable url, or any Drive error → `302` to `artifact.driveUrl`.

This route is integration glue over auth + Prisma + googleapis. The repo has **no** route-handler unit tests (all existing tests are pure-function `tsx` scripts), so this task is verified by `npx tsc --noEmit` + a code self-check against the behavior list above, then manual browser verification at the end of the plan. Do not invent a test harness for it.

- [ ] **Step 1: Create the route file**

```ts
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { drive, fileIdFromUrl, downloadDriveFile } from "@/lib/drive";
import { isRenderableHtml, SANDBOX_CSP } from "@/lib/artifact-view";

// googleapis needs Node APIs — never run this on the Edge.
export const runtime = "nodejs";

// Opens a deal Document in its own tab, rendered. Artifacts only store a Drive
// link; opening an HTML file straight in Drive shows the raw source, not the
// page. So for HTML we fetch the bytes via the service account and re-serve them
// as text/html (sandboxed). Anything we can't render — and any Drive failure —
// 302s to the Drive link, exactly like the old direct link. The partner never
// hits a dead end.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.partnerId) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const artifact = await prisma.artifact.findUnique({ where: { id }, select: { driveUrl: true } });
  if (!artifact) return new Response("Not found", { status: 404 });

  // Fallback the partner always gets if we can't render: the Drive link itself.
  const toDrive = () => Response.redirect(artifact.driveUrl, 302);

  const fileId = fileIdFromUrl(artifact.driveUrl);
  if (!fileId) return toDrive();

  try {
    const meta = await drive.files.get({ fileId, fields: "mimeType", supportsAllDrives: true });
    if (!isRenderableHtml(meta.data.mimeType)) return toDrive();

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

Note: `downloadDriveFile` returns a Node `Buffer`; it is wrapped in `new Uint8Array(bytes)` so the `Response` body type is unambiguous BodyInit. `Response.redirect(url, 302)` requires an absolute URL — `artifact.driveUrl` is a full `https://drive.google.com/...` link, so that holds.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: clean (no new errors). If it reports a body-type error on the `Response`, the `new Uint8Array(bytes)` wrap above resolves it.

- [ ] **Step 3: Self-check against the behavior list** (read the file you just wrote and confirm each bullet in **Produces** above is implemented: 401, 404, html→200+CSP+no-store, every other path→302).

- [ ] **Step 4: Commit**

```bash
git add "app/api/artifacts/[id]/view/route.ts"
git commit -m "feat(docs-viewer): /api/artifacts/[id]/view renders HTML, redirects the rest"
```

---

### Task 3: Point the Documents list at the viewer route

**Files:**
- Modify: `app/(app)/pipeline/[id]/page.tsx` (the Documents section — the per-artifact `<a href={a.driveUrl} ...>` inside `artifacts.map`)

**Interfaces:**
- Consumes: the route from Task 2.
- Produces: each document row links to `/api/artifacts/${a.id}/view` in a new tab. No other markup changes.

This is a one-attribute JSX edit; verified by `npx tsc --noEmit` and the manual check at the end. No unit test (the repo unit-tests pure functions, not JSX).

- [ ] **Step 1: Change the artifact row's `href`**

Find (inside `{artifacts.map((a) => ( ... ))}`):

```tsx
                  <a
                    href={a.driveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 min-w-0 px-5 py-2.5 flex items-start gap-3 hover:bg-[var(--color-row-hover)] transition-colors group"
                  >
```

Replace the `href` line only, so it reads:

```tsx
                  <a
                    href={`/api/artifacts/${a.id}/view`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 min-w-0 px-5 py-2.5 flex items-start gap-3 hover:bg-[var(--color-row-hover)] transition-colors group"
                  >
```

Leave the "Drive folder" header link (`deal.driveFolderUrl`) untouched — that one should still go straight to Drive.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/pipeline/[id]/page.tsx"
git commit -m "feat(docs-viewer): deal Documents open via the in-tab viewer route"
```

---

### Task 4: Changelog + How-it-works (pre-push checklist)

**Files:**
- Modify: `lib/data/updates.ts` (add one entry at the top of the `updates` array)
- Modify: `components/how-it-works-view.tsx` (extend the existing `Artifact` line so the walkthrough stays accurate)

**Interfaces:** none (content only).

Per CLAUDE.md's pre-push checklist: this adds a partner-noticeable capability (changelog entry required) and slightly changes a documented behavior (How-it-works line). It is NOT a firm-money surface, so no managing-partner gating.

- [ ] **Step 1: Add the changelog entry** — top of the `updates` array in `lib/data/updates.ts`

```ts
  {
    date: "2026-06-18",
    tag: "improved",
    title: "Documents open ready to read, not as raw code",
    detail:
      "Opening an HTML document from a deal's Documents list now shows the finished page in its own tab, instead of a wall of code. Other files — PDFs, decks, sheets — still open in Drive as before, and nothing about how files are saved changes.",
  },
```

- [ ] **Step 2: Keep the How-it-works Artifact line accurate** — in `components/how-it-works-view.tsx`, find:

```tsx
            <PhaseLi><b>Artifact.</b> Every saved draft files to the deal&apos;s Drive folder and shows on the deal.</PhaseLi>
```

Replace with:

```tsx
            <PhaseLi><b>Artifact.</b> Every saved draft files to the deal&apos;s Drive folder and shows on the deal; HTML documents open rendered in their own tab.</PhaseLi>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/data/updates.ts components/how-it-works-view.tsx
git commit -m "docs(docs-viewer): changelog + how-it-works note for rendered documents"
```

---

## Final verification (run after all tasks)

- [ ] `npx tsx lib/artifact-view.test.ts` → prints `artifact-view.test.ts OK`
- [ ] `npx tsc --noEmit` → clean
- [ ] Manual (after deploy or `npm run dev`): on a deal with an HTML document (e.g. PILOT PETROLEUM), click it → renders in a new tab (not source); click a non-HTML document → opens in Drive; confirm the ops tab behind it is still usable.

## Notes / risks

- **Latency:** each HTML view does one Drive metadata call + one download (no caching, `no-store`). Fine for click traffic; the deferred optimization is a Storage copy at creation (out of scope).
- **`npm run build` locally:** expected to fail for heap/missing-Drive-key reasons unrelated to this change (memory `local-build-quirks`). Use `npx tsc --noEmit` as the gate.
- **Reuse:** the route is generic (`/api/artifacts/[id]/view`); Client/Project document lists could adopt it later, but this plan only touches the pipeline deal page per the spec.
