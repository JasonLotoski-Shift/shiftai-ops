# Prototype-Builder — Phase C.1 (refinements) Implementation Plan

> **For agentic workers:** implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix the white-screen embed, move the live view to its own browser tab (ops tool stays free), stream rounds live, isolate the worker from global MCP, and make the agent better (DOM-interaction testing + richer design direction incl. promoted impeccable principles).

**Builds on:** Phase C (committed, branch `feat/prototype-worker-phase-c`). Spec: `docs/superpowers/specs/2026-06-17-prototype-worker-phase-c-design.md`.

## Global Constraints (same as Phase C)
- No unit-test framework. Verify with `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (gate) + `npm run build` + manual. Worker commands on Node 22 (`export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`).
- `worker/` is plain Node — no Next-only imports. Commit per task on this branch; do NOT push.
- Root cause of the white screen (verified): Supabase serves public Storage objects as `content-type: text/plain` + `content-security-policy: default-src 'none'; sandbox` (anti-XSS), so a Storage URL can never render as a live page. Fix by serving the HTML from our own Next route.

---

### Task R1: HTML-serving route (fixes the white screen)

**Files:** Create `app/api/prototype/[runId]/view/route.ts`

**Interface:** `GET /api/prototype/<runId>/view` → `text/html` of the run's final prototype, rendered correctly + sandboxed.

- [ ] **Step 1:** Create the route handler:

```typescript
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Serves a finished prototype's HTML from OUR origin with the correct content-type and a
// sandboxing CSP. Supabase Storage forces text/plain + default-src 'none' (anti-XSS), so the
// raw Storage URL can't render — we fetch it server-side and re-serve it here. The CSP
// `sandbox allow-scripts allow-forms allow-modals allow-popups` lets the self-contained
// prototype run its inline JS but in an OPAQUE origin, so it can't touch the app's cookies.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const session = await auth();
  if (!session?.user?.partnerId) return new Response("Unauthorized", { status: 401 });
  const { runId } = await params;
  const run = await prisma.prototypeRun.findUnique({ where: { id: runId }, select: { finalHtmlUrl: true } });
  if (!run?.finalHtmlUrl) return new Response("Prototype not ready", { status: 404 });
  const upstream = await fetch(run.finalHtmlUrl);
  if (!upstream.ok) return new Response("Could not load prototype", { status: 502 });
  const html = await upstream.text();
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "sandbox allow-scripts allow-forms allow-modals allow-popups",
      "cache-control": "no-store",
    },
  });
}
```

- [ ] **Step 2:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → clean.
- [ ] **Step 3:** Commit: `git commit -m "feat(pipeline): serve prototype HTML via app route (fixes Storage white-screen)"`

---

### Task R2: Separate-tab run view + open-on-Build

**Files:**
- Create `app/(app)/pipeline/[id]/prototype/[runId]/page.tsx`
- Modify `components/prototype-build-view.tsx` (iframe src → the R1 route)
- Modify `components/proposal-engine-modal.tsx` (Build opens the run tab + closes the modal)

**Interfaces:**
- Consumes: R1 route `/api/prototype/<runId>/view`; `<PrototypeBuildView runId/>`.
- Produces: a full-page run view at `/pipeline/<id>/prototype/<runId>`; the modal's Build opens it in a new tab.

- [ ] **Step 1: Point the embed at the working route.** In `components/prototype-build-view.tsx`, change the done-state iframe from `src={data.finalHtmlUrl}` to `src={`/api/prototype/${runId}/view`}`, and add an "Open fullscreen ↗" link (`<a href={`/api/prototype/${runId}/view`} target="_blank" rel="noreferrer">`) shown when `done`. Keep `sandbox="allow-scripts"` on the iframe too (belt-and-suspenders).

- [ ] **Step 2: Create the run page** `app/(app)/pipeline/[id]/prototype/[runId]/page.tsx` (server component):

```typescript
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PrototypeBuildView } from "@/components/prototype-build-view";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PrototypeRunPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const session = await auth();
  if (!session?.user?.partnerId) notFound();
  const { id, runId } = await params;
  const run = await prisma.prototypeRun.findUnique({ where: { id: runId }, select: { id: true, clientName: true, dealId: true } });
  if (!run || run.dealId !== id) notFound();
  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-bone text-lg">Prototype build · {run.clientName}</h1>
        <Link href={`/pipeline/${id}`} className="text-[12px] text-bone-mute hover:text-bone">← Back to deal</Link>
      </div>
      <PrototypeBuildView runId={runId} onRunAgain={() => {}} onDone={() => {}} />
    </div>
  );
}
```

(Note: `PrototypeBuildView`'s `onRunAgain`/`onDone` are no-ops here since the page is standalone — keep the props optional or pass empty fns. If they're required in the component, make them optional with `?:` and guard calls.)

- [ ] **Step 3: Modal opens the tab on Build.** In `components/proposal-engine-modal.tsx`, change the prototype `launch` handler so after `startPrototypeBuild` returns `{runId}` it opens the run tab and closes the modal instead of switching to the inline build step:

```typescript
const launch = () =>
  startBuild(async () => {
    setStartErr(null);
    try {
      const { runId } = await startPrototypeBuild(dealId, brief);
      window.open(`/pipeline/${dealId}/prototype/${runId}`, "_blank", "noopener");
      onClose();
    } catch (e) {
      setStartErr(e instanceof Error ? e.message : "Could not start the build");
    }
  });
```

Remove the now-unused inline `build`-step rendering of `<PrototypeBuildView>` for prototype mode (the deck one-shot branch stays). Keep `startErr` shown on the brief step.

- [ ] **Step 4:** `tsc` clean + `npm run build` clean.
- [ ] **Step 5:** Commit: `git commit -m "feat(pipeline): run the build in its own tab (ops tool stays free); embed via the app route"`

---

### Task R3: Stream rounds live (per-round persistence)

**Files:** Modify `worker/tools/gate.ts`, `worker/loop.ts`, (uses `worker/persistence.ts` `recordIteration` as-is)

**Interface:** `createGateServer({ maxIterations, threshold, currentArtifacts?, onRound? })` — `onRound?: (rec: GateRecord) => Promise<void>` fires inside the score handler after the record is built, so the row is written as each round scores. The loop passes `onRound: (rec) => recorder.recordIteration(rec)` and REMOVES the post-loop batch write.

- [ ] **Step 1:** In `worker/tools/gate.ts`, add `onRound?: (rec: GateRecord) => Promise<void>` to the opts type. In the score handler, after `history.push(record)` and before returning the verdict, add:

```typescript
          if (opts.onRound) {
            try { await opts.onRound(history[history.length - 1]); }
            catch (e) { console.warn("[gate] onRound failed:", e instanceof Error ? e.message : e); }
          }
```

- [ ] **Step 2:** In `worker/loop.ts`, pass `onRound` when creating the gate, and DELETE the post-loop `for (const rec of gate.history) { await recorder.recordIteration(rec); }` block (keep `recorder.finish(...)` and `recorder.recordArtifact(...)`):

```typescript
  const gate = createGateServer({
    maxIterations: config.maxIterations,
    threshold: config.gateThreshold,
    currentArtifacts: () => eyes.getLastArtifacts(),
    onRound: (rec) => recorder.recordIteration(rec),
  });
```

- [ ] **Step 3:** `tsc` clean.
- [ ] **Step 4:** Commit: `git commit -m "feat(worker): write each PrototypeIteration as the gate scores it (live streaming)"`

---

### Task R4: Isolate the worker from global MCP/settings

**Files:** Modify `worker/loop.ts`

**Interface:** the worker's `query()` loads NONE of the user's `~/.claude` settings/MCP/hooks — only its in-process servers.

- [ ] **Step 1:** In `worker/loop.ts` query `options`, add `settingSources: []` (documented as SDK isolation mode):

```typescript
        // SDK isolation: load no filesystem settings, so the worker NEVER picks up the
        // user's global ~/.claude MCP servers / hooks / CLAUDE.md — only eyes/gate/library.
        settingSources: [],
```

- [ ] **Step 2:** `tsc` clean.
- [ ] **Step 3:** Commit: `git commit -m "feat(worker): isolate from global ~/.claude settings/MCP (settingSources: [])"`

---

### Task R5: Interaction-testing tool (`mcp__eyes__interact`)

**Files:** Modify `worker/tools/eyes.ts`, `worker/loop.ts` (allowlist)

**Interface:** `mcp__eyes__interact({ steps: Array<{action: "click"|"fill"|"hover"|"press", selector: string, value?: string}>, note?: string })` — loads `prototype.html` in the shared browser, runs the steps in order (each reported hit/miss), screenshots the after-state, returns a text result + the image so the agent can confirm its key interaction actually works in the DOM.

- [ ] **Step 1:** In `worker/tools/eyes.ts`, add a second tool to the eyes server (reuse `getBrowser()` + `runDir`). Inside `createEyesServer`, add to the `tools: [...]` array (after the `screenshot` tool):

```typescript
      tool(
        "interact",
        "Drive REAL clicks/typing in your current prototype.html (headless browser) to VERIFY the key interaction works in the DOM — not just how it looks. Give the exact CSS selectors from the markup you wrote. Returns which steps hit/missed plus an after-screenshot. Use it each round to confirm the interaction before you score.",
        {
          steps: z
            .array(
              z.object({
                action: z.enum(["click", "fill", "hover", "press"]),
                selector: z.string().describe("CSS selector (or, for press, the key e.g. 'Enter')"),
                value: z.string().optional().describe("text for fill; key for press"),
              }),
            )
            .describe("ordered interaction steps"),
          note: z.string().optional(),
        },
        async (args) => {
          const file = path.join(runDir, "prototype.html");
          if (!fs.existsSync(file)) {
            return { content: [{ type: "text", text: "No prototype.html yet — write it first." }], isError: true };
          }
          const browser = await getBrowser();
          const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
          const results: string[] = [];
          try {
            await page.goto("file:///" + file.replace(/\\/g, "/"), { waitUntil: "networkidle" });
            try { await page.evaluate(() => (document as any).fonts?.ready); } catch { /* ignore */ }
            for (const [i, s] of args.steps.entries()) {
              try {
                if (s.action === "click") await page.click(s.selector, { timeout: 3000 });
                else if (s.action === "hover") await page.hover(s.selector, { timeout: 3000 });
                else if (s.action === "fill") await page.fill(s.selector, s.value ?? "", { timeout: 3000 });
                else if (s.action === "press") await page.press(s.selector || "body", s.value ?? "Enter", { timeout: 3000 });
                results.push(`✓ step ${i + 1} ${s.action} ${s.selector}`);
                await page.waitForTimeout(200);
              } catch (e) {
                results.push(`✗ step ${i + 1} ${s.action} ${s.selector} — FAILED: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
              }
            }
            await page.waitForTimeout(300);
            const buf = await page.screenshot({ fullPage: true, type: "jpeg", quality: 85 });
            return {
              content: [
                { type: "text", text: `Interaction result:\n${results.join("\n")}\n\nAfter-state screenshot below — confirm the interaction did what you intended (panel opened, badge recolored, row moved, etc.). A ✗ means that selector wasn't found — the interaction is broken; fix it.` },
                { type: "image", data: buf.toString("base64"), mimeType: "image/jpeg" },
              ],
            };
          } finally {
            await page.close().catch(() => {});
          }
        },
      ),
```

- [ ] **Step 2:** In `worker/loop.ts`, change the eyes entry in `ALLOWED_TOOLS` from `"mcp__eyes__screenshot"` to the wildcard `"mcp__eyes__*"` (covers `screenshot` + `interact`; `toolAllowed()` already matches wildcards). Update the deny message text to mention `interact`.

- [ ] **Step 3:** `tsc` clean.
- [ ] **Step 4:** Commit: `git commit -m "feat(worker): mcp__eyes__interact — verify the key interaction in the real DOM"`

---

### Task R6: Richer direction (promote impeccable + sharpen the prompt)

**Files:**
- Create `skills/_design/principles.md` (promoted from impeccable's Design-guidance section)
- Modify `worker/prompt.ts`

**Interface:** the build agent's system prompt = firm context + html-prototype skill + `_design/principles.md` + an updated LOOP_PROTOCOL that mandates using `mcp__eyes__interact` each round.

- [ ] **Step 1: Promote the design principles into the repo.** Create `skills/_design/principles.md` containing the **Design guidance** of `~/.claude/skills/impeccable/SKILL.md` — i.e. its `### General rules`, `### Absolute bans`, and `### The AI slop test` subsections (the content between `## Design guidance` and `## Commands`). Copy that text verbatim into the file under a top heading `# Design principles (promoted from the impeccable skill)`. Do NOT include impeccable's Setup/Commands/Routing/Pin sections or its `reference/*` files. (Read the source with: `sed -n '24,99p' ~/.claude/skills/impeccable/SKILL.md` and adjust the range to capture exactly those three subsections.)

- [ ] **Step 2: Fold it into the prompt.** In `worker/prompt.ts`:
  - Add a reader for the new file and include it in `buildSystemPrompt()` between the html-prototype skill and the LOOP_PROTOCOL:
    ```typescript
    const design = readSkill("_design/principles.md");
    return [firm, "\n\n---\n\n", htmlSkill, "\n\n---\n\n", design, "\n", LOOP_PROTOCOL].join("");
    ```
  - In `LOOP_PROTOCOL`, (a) add `mcp__eyes__interact` to the listed tools with a one-line description, and (b) add a step: after screenshotting, **use `mcp__eyes__interact` to actually perform the brief's key interaction and confirm it works in the DOM before scoring** — a ✗ result means the interaction is broken and `interactivity` must score low until fixed. Tie it to the Gate's interactivity floor.

- [ ] **Step 3:** `tsc` clean.
- [ ] **Step 4:** Commit: `git commit -m "feat(worker): promote impeccable design principles + mandate interaction-testing in the loop"`

---

## Verification (after the workflow)
- `tsc` + `npm run build` clean (whole branch).
- Restart worker (Node 22) + dev server; fresh build on a deal → the run opens in a **new tab**, rounds **stream live**, the embed **renders** (no white screen), `interact` runs in the worker log, and the agent's design/interactivity are sharper. Approve → Artifact approved.
