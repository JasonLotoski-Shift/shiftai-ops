# Prototype-Builder Worker — Phase C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the always-on prototype-builder worker end-to-end into the ops tool — a partner approves a brief, the worker loop builds/critiques live in the deal modal, the partner approves the result, and a Drive `Artifact` is persisted — then deploy the worker to Railway.

**Architecture:** Home (Next on Vercel/local) inserts a `PrototypeRun` row and POSTs the brief to the worker over authenticated HTTP; the worker (Node on Railway/local) runs the loop and writes `PrototypeIteration` rows + the final `Artifact` **directly** to Supabase (Direct :5432); Home polls a read-only status action (~4s) and renders a split iteration view, mirroring the existing `LeadRun`/`ScanRun` pattern. No Supabase Realtime.

**Tech Stack:** `@anthropic-ai/claude-agent-sdk`, Playwright/Chromium, Prisma 7 + Supabase Postgres, Supabase Storage (REST), Next 15 App Router (`next/server` `after`), Google Drive (`lib/drive.ts`), Docker + Railway.

## Global Constraints

- **No unit-test framework exists.** Verify with `npx tsc --noEmit` (use `NODE_OPTIONS=--max-old-space-size=8192`), `npm run build`, standalone `tsx` verification scripts (against an ephemeral Docker Postgres and/or a temp Drive folder), `curl`, and manual UI checks. Do NOT add jest/vitest.
- **Run worker commands on Node 22** with chromium installed: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"` and `npx playwright install chromium` (one-time). The Next app runs on its normal Node.
- **Worker is plain Node** — never import Next-only code (`revalidatePath`, `next/cache`, `server-only`, server actions) into `worker/`. `lib/audit.ts`, `lib/drive.ts`, `lib/deal-drive.ts`, `lib/prisma.ts` are worker-safe; `lib/ai.ts` is NOT (reads skill files off cwd) — don't import it in the worker.
- **Local `DATABASE_URL` is the shared prod Supabase.** Treat every migration as a prod change. Ephemeral Docker Postgres (`postgresql://postgres:verify@localhost:55432/verify`) is for verify scripts ONLY.
- **Migration discipline:** the prepared migration is `prisma/_prepared-migrations/007_prototype_run_iteration.sql`. Jason approved applying it (2026-06-17).
- **Enum string convention:** Prisma `@map`'d enums return the underscored TS identifier; `PrototypeRunStatus` values are plain (`pending`/`running`/`done`/`error`, no `@map`).
- **Worker env:** `ANTHROPIC_API_KEY`, `DATABASE_URL` (Direct), `GOOGLE_SERVICE_ACCOUNT_KEY_B64`, `PROTOTYPE_LIBRARY_FOLDER_ID=15Hl4UUK4A5wrbXWOQp6Qj1YXk-w8hYUS`, `WORKER_SHARED_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PROTOTYPE_MODEL`. Home env: `WORKER_URL`, `WORKER_SHARED_SECRET`.
- **Spec:** `docs/superpowers/specs/2026-06-17-prototype-worker-phase-c-design.md`.

## File Structure

- `prisma/schema.prisma` (modify) — amend `PrototypeRun` + `PrototypeRunStatus`.
- `prisma/_prepared-migrations/007_prototype_run_iteration.sql` (modify) — regenerate to include the amendments.
- `worker/persistence.ts` (modify) — attach-to-existing-run; new `recordArtifact`.
- `worker/loop.ts` (modify) — `BuildBrief.drivePrototypeFolderId`; pass `existingRunId`; call `recordArtifact` on success.
- `worker/index.ts` (modify) — `/build` accepts `runId` + scope, runs with `existingRunId`.
- `worker/config.ts` (modify) — model default → Opus.
- `worker/Dockerfile` (create) — Railway image.
- `app/(app)/pipeline/[id]/prototype-actions.ts` (create) — `startPrototypeBuild`, `getPrototypeRunStatus`, `approvePrototype`.
- `app/(app)/pipeline/[id]/proposal-engine.ts` (modify) — delete `generatePrototypeHtml`/`savePrototype`.
- `components/prototype-build-view.tsx` (create) — the split iteration view client component.
- `components/proposal-engine-modal.tsx` (modify) — prototype mode uses the new build view.
- `app/(app)/pipeline/[id]/page.tsx` (modify) — recognize `prototype-builder` skill.
- `docs/worker-railway-runbook.md` (create) — the deploy runbook.

---

### Task 1: Amend schema + regenerate migration 007

**Files:**
- Modify: `prisma/schema.prisma` (the `PrototypeRunStatus` enum + `model PrototypeRun`)
- Modify: `prisma/_prepared-migrations/007_prototype_run_iteration.sql`

**Interfaces:**
- Produces: `PrototypeRun.brief String?`, `PrototypeRun.artifactId String?`, `PrototypeRunStatus.pending`. Prisma client regenerated so `prisma.prototypeRun` accepts these fields.

- [ ] **Step 1: Add `pending` to the enum.** In `prisma/schema.prisma`, change:

```prisma
enum PrototypeRunStatus {
  pending
  running
  done
  error
}
```

- [ ] **Step 2: Add the two fields to `PrototypeRun`.** Inside `model PrototypeRun`, after the `sessionId`/`model` block, add:

```prisma
  // The approved brief this run was built from (snapshot; the run is self-contained).
  brief String?
  // The final Artifact written on success — lets Home's approve action find it.
  artifactId String?
```

Also change the default so Home can insert a pending row (keep `running` default for the dev-run path is fine; Home passes `pending` explicitly — no schema change needed to the default).

- [ ] **Step 3: Validate + regenerate the client (local, no DB).**

Run: `npx prisma validate && npx prisma generate`
Expected: "The schema at prisma/schema.prisma is valid 🚀" then "Generated Prisma Client".

- [ ] **Step 4: Regenerate the prepared 007 SQL from the committed base schema.**

Run:
```bash
git show HEAD:prisma/schema.prisma > /tmp/schema-base.prisma
npx prisma migrate diff --from-schema /tmp/schema-base.prisma --to-schema prisma/schema.prisma --script > /tmp/007-body.sql
cat /tmp/007-body.sql
```
Expected: SQL containing `CREATE TYPE "PrototypeRunStatus" AS ENUM ('pending', 'running', 'done', 'error')`, the two `CREATE TABLE`s with `"brief" TEXT` and `"artifactId" TEXT` columns on `PrototypeRun`, indexes, and FKs.

- [ ] **Step 5: Replace the body of `007_prototype_run_iteration.sql`** with the new SQL, keeping the existing header comment block (the "PREPARED, NOT APPLIED…" preamble). Paste `/tmp/007-body.sql` content below the comment header.

- [ ] **Step 6: Commit.**

```bash
git add prisma/schema.prisma prisma/_prepared-migrations/007_prototype_run_iteration.sql
git commit -m "feat(worker): amend PrototypeRun (brief, artifactId, pending status) for Phase C"
```

---

### Task 2: Apply migration 007 to the shared Supabase (Jason-approved)

**Files:** none (operational; creates the migration ledger entry).

**Interfaces:**
- Produces: `PrototypeRun` + `PrototypeIteration` tables exist on the DB Home connects to, so the rest of Phase C can read/write them.

> ⚠️ This runs against the shared prod Supabase. Approval granted 2026-06-17. Use the local `.env` Direct URL.

- [ ] **Step 1: Review the SQL one more time.** Open `prisma/_prepared-migrations/007_prototype_run_iteration.sql` and confirm it is additive only (two `CREATE TABLE`, one `CREATE TYPE`, indexes, FKs — no `DROP`, no data mutation).

- [ ] **Step 2: Apply via Prisma migrate.**

Run: `npx prisma migrate dev --name add_prototype_run_iteration`
Expected: Prisma emits a migration matching 007 and applies it; "Your database is now in sync with your schema." A new folder under `prisma/migrations/` is created.

- [ ] **Step 3: Verify the tables exist.**

Run:
```bash
npx tsx -e "import {prisma} from './lib/prisma'; prisma.prototypeRun.count().then(n=>{console.log('PrototypeRun rows:',n);process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"
```
Expected: `PrototypeRun rows: 0` (table exists, empty).

- [ ] **Step 4: Commit the applied migration.**

```bash
git add prisma/migrations/
git commit -m "chore(db): apply 007 prototype_run_iteration migration"
```

---

### Task 3: Worker — attach to an existing PrototypeRun row

**Files:**
- Modify: `worker/persistence.ts`
- Modify: `worker/loop.ts:51-55` (the `runId`/`createPrototypeRun` call region)
- Test: `worker/verify-attach.ts` (create, temporary)

**Interfaces:**
- Consumes: `prisma.prototypeRun` (with `pending` status from Task 1).
- Produces: `createPrototypeRun(init, opts?: { existingRunId?: string })`. When `existingRunId` is set, the recorder updates that row `pending→running` and uses its id; otherwise it creates a new row (unchanged dev-run behavior). `RunInit` gains optional `brief?: string`.

- [ ] **Step 1: Write the failing verification script** `worker/verify-attach.ts`:

```typescript
// Verify createPrototypeRun attaches to an existing pending row instead of creating a new one.
// Run against the ephemeral Docker Postgres only.
import { createPrototypeRun } from "./persistence";
import { prisma } from "../lib/prisma";

async function main() {
  // Seed a pending row as Home would.
  const seeded = await prisma.prototypeRun.create({
    data: { status: "pending", clientName: "Attach Co", brief: "the brief" },
    select: { id: true },
  });
  const before = await prisma.prototypeRun.count();

  const recorder = await createPrototypeRun(
    { clientName: "Attach Co" },
    { existingRunId: seeded.id },
  );
  if (recorder.runId !== seeded.id) throw new Error(`FAIL: expected runId ${seeded.id}, got ${recorder.runId}`);

  const after = await prisma.prototypeRun.count();
  if (after !== before) throw new Error(`FAIL: row count changed ${before}→${after} (created a new row instead of attaching)`);

  const row = await prisma.prototypeRun.findUnique({ where: { id: seeded.id }, select: { status: true } });
  if (row?.status !== "running") throw new Error(`FAIL: status is ${row?.status}, expected running`);

  console.log("PASS: attached to existing row, flipped pending→running, no new row");
  await prisma.$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 2: Push the schema to the ephemeral DB and run the script — confirm it FAILS.**

Run:
```bash
docker rm -f proto-verify-pg >/dev/null 2>&1; docker run -d --name proto-verify-pg -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=verify -p 55432:5432 postgres:16-alpine >/dev/null
until docker exec proto-verify-pg pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
npx prisma db push --url "postgresql://postgres:verify@localhost:55432/verify"
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
DATABASE_URL="postgresql://postgres:verify@localhost:55432/verify" npx tsx worker/verify-attach.ts
```
Expected: FAIL — `createPrototypeRun` currently ignores any second arg and creates a new row.

- [ ] **Step 3: Implement.** In `worker/persistence.ts`, change the `RunInit` type and `createPrototypeRun`:

```typescript
export type RunInit = {
  clientName: string;
  industry?: string;
  model?: string;
  dealId?: string;
  clientId?: string;
  brief?: string;
};

export async function createPrototypeRun(
  init: RunInit,
  opts: { existingRunId?: string } = {},
): Promise<PrototypeRecorder> {
  let runId: string | null = null;
  try {
    if (opts.existingRunId) {
      // Home pre-inserted a pending row — attach to it and flip to running.
      const run = await prisma.prototypeRun.update({
        where: { id: opts.existingRunId },
        data: { status: "running", model: init.model ?? undefined },
        select: { id: true },
      });
      runId = run.id;
      console.log(`[persistence] PrototypeRun ${runId} attached (status=running)`);
    } else {
      const run = await prisma.prototypeRun.create({
        data: {
          status: "running",
          clientName: init.clientName,
          industry: init.industry ?? null,
          model: init.model ?? null,
          dealId: init.dealId ?? null,
          clientId: init.clientId ?? null,
          brief: init.brief ?? null,
        },
        select: { id: true },
      });
      runId = run.id;
      console.log(`[persistence] PrototypeRun ${runId} created (status=running)`);
    }
  } catch (err) {
    console.warn(
      "[persistence] could not open PrototypeRun (tables may be unmigrated — see prisma/_prepared-migrations/007). Continuing without persistence:",
      err instanceof Error ? err.message : err,
    );
  }
  // ... rest of the returned recorder object is unchanged ...
```

(Leave the rest of the returned recorder — `setSession`, `recordIteration`, `finish` — exactly as-is.)

- [ ] **Step 4: Run the script — confirm it PASSES.**

Run: `DATABASE_URL="postgresql://postgres:verify@localhost:55432/verify" npx tsx worker/verify-attach.ts`
Expected: `PASS: attached to existing row, flipped pending→running, no new row`

- [ ] **Step 5: tsc + remove the temp script + commit.**

```bash
rm worker/verify-attach.ts
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit   # expect clean
git add worker/persistence.ts
git commit -m "feat(worker): attach to a pre-inserted PrototypeRun row (existingRunId)"
```

---

### Task 4: Worker — write the final Artifact + Drive upload on success

**Files:**
- Modify: `worker/persistence.ts` (add `recordArtifact`)
- Modify: `worker/loop.ts` (`BuildBrief.drivePrototypeFolderId`; call `recordArtifact` in the success branch)
- Test: `worker/verify-artifact.ts` (create, temporary)

**Interfaces:**
- Consumes: `lib/drive.uploadFile(body, fileName, parentFolderId, mimeType)` → `{fileId, webViewLink}`; `lib/audit.writeAudit(db, input)`, `writeActivity(db, input)`, `agentActor(name)`.
- Produces: `recorder.recordArtifact({ dealId, company, folderId, htmlPath })` — uploads the final HTML to Drive, writes `Artifact`+`AuditLog`+`Activity` in one `$transaction`, sets `PrototypeRun.artifactId`. No-op if `runId` is null. `BuildBrief` gains `drivePrototypeFolderId?: string`.

- [ ] **Step 1: Write the failing verification script** `worker/verify-artifact.ts`:

```typescript
// Verify recordArtifact uploads to Drive + writes Artifact/AuditLog/Activity + sets PrototypeRun.artifactId.
// Needs the ephemeral DB AND a real Drive folder (creates a temp one, cleans up).
import { createPrototypeRun } from "./persistence";
import { prisma } from "../lib/prisma";
import { drive, deleteFile } from "../lib/drive";
import fs from "node:fs";

const SHARED_DRIVE_ID = "0AMNrAji1xpypUk9PVA"; // Shift AI - Clients

async function main() {
  // temp Drive folder
  const folder = await drive.files.create({
    requestBody: { name: "ZZ-verify-artifact-temp", mimeType: "application/vnd.google-apps.folder", parents: [SHARED_DRIVE_ID] },
    fields: "id", supportsAllDrives: true,
  });
  const folderId = folder.data.id!;
  // temp deal to satisfy the Artifact FK
  const deal = await prisma.deal.findFirst({ select: { id: true, company: true } });
  if (!deal) throw new Error("need at least one Deal in the ephemeral DB — seed one first");

  const htmlPath = "/tmp/verify-proto.html";
  fs.writeFileSync(htmlPath, "<!doctype html><title>verify</title><h1>hi</h1>");

  const recorder = await createPrototypeRun({ clientName: deal.company, dealId: deal.id });
  await recorder.recordArtifact({ dealId: deal.id, company: deal.company, folderId, htmlPath });

  const run = await prisma.prototypeRun.findUnique({ where: { id: recorder.runId! }, select: { artifactId: true } });
  if (!run?.artifactId) throw new Error("FAIL: PrototypeRun.artifactId not set");
  const art = await prisma.artifact.findUnique({ where: { id: run.artifactId } });
  const audit = await prisma.auditLog.findFirst({ where: { targetType: "Artifact", targetId: run.artifactId } });
  const checks: [string, boolean][] = [
    ["artifact exists", !!art],
    ["driveUrl set", !!art?.driveUrl],
    ["generatedFromSkill = prototype-builder", art?.generatedFromSkill === "prototype-builder"],
    ["reviewStatus draft", art?.reviewStatus === "draft"],
    ["dealId scoped", art?.dealId === deal.id],
    ["audit row written", !!audit],
  ];
  let ok = true;
  for (const [l, p] of checks) { console.log(`${p ? "✓" : "✗ FAIL"} ${l}`); if (!p) ok = false; }

  // cleanup
  await deleteFile(folderId).catch(() => {});
  await prisma.$disconnect();
  if (!ok) process.exit(1);
  console.log("PASS");
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 2: Seed a deal in the ephemeral DB and run — confirm it FAILS** (recordArtifact doesn't exist).

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
export GOOGLE_SERVICE_ACCOUNT_KEY_B64="$(grep '^GOOGLE_SERVICE_ACCOUNT_KEY_B64=' .env | cut -d= -f2- | tr -d '"')"
# seed one deal into the ephemeral DB (run the app's seed against it, or insert a minimal row)
DATABASE_URL="postgresql://postgres:verify@localhost:55432/verify" npx tsx -e "import {prisma} from './lib/prisma'; await prisma.partner.create({data:{name:'T',initials:'T',role:'r',email:'t@x.co'}}).catch(()=>{}); /* deals need contact+partner FKs — if seeding is heavy, point this verify at the prod DB read-only for a Deal id instead */ process.exit(0)"
DATABASE_URL="postgresql://postgres:verify@localhost:55432/verify" npx tsx worker/verify-artifact.ts
```
Expected: FAIL — `recorder.recordArtifact` is not a function. (If seeding a Deal into the ephemeral DB is impractical due to FK chains, run this verify script against the **prod** `DATABASE_URL` which has real Deals — it only creates a temp Drive folder + a PrototypeRun/Artifact you then delete; acceptable since the migration is applied. Prefer ephemeral if a Deal can be seeded.)

- [ ] **Step 3: Implement `recordArtifact`** in `worker/persistence.ts`. Add imports at the top:

```typescript
import { uploadFile } from "../lib/drive";
import { writeAudit, writeActivity, agentActor } from "../lib/audit";
```

Add this method inside the returned recorder object (alongside `finish`):

```typescript
    async recordArtifact(input: {
      dealId: string;
      company: string;
      folderId: string;
      htmlPath: string;
    }) {
      if (!runId) return;
      let html: string;
      try {
        html = require("node:fs").readFileSync(input.htmlPath, "utf8");
      } catch (err) {
        console.warn("[persistence] recordArtifact: could not read final HTML:", err);
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const slug = input.company.replace(/\s+/g, "-");
      const fileName = `${today}-${slug}-prototype.html`;
      let webViewLink: string;
      try {
        ({ webViewLink } = await uploadFile(html, fileName, input.folderId, "text/html"));
      } catch (err) {
        console.warn("[persistence] recordArtifact: Drive upload failed:", err);
        return;
      }
      const actor = agentActor("prototype-builder");
      try {
        const artifact = await prisma.$transaction(async (tx) => {
          const created = await tx.artifact.create({
            data: {
              type: "other",
              title: `Prototype · ${input.company} · ${today}`,
              driveUrl: webViewLink,
              fileName,
              createdBy: actor.name,
              generatedFromSkill: "prototype-builder",
              reviewStatus: "draft",
              dealId: input.dealId,
            },
          });
          await writeAudit(tx, {
            actor,
            action: "create.artifact.prototype.draft",
            targetType: "Artifact",
            targetId: created.id,
            changes: { dealId: input.dealId, runId, fileName },
          });
          await writeActivity(tx, {
            actor,
            type: "ai",
            target: input.company,
            detail: "Built an interactive prototype — awaiting review",
            link: `/pipeline/${input.dealId}`,
          });
          return created;
        });
        await prisma.prototypeRun.update({ where: { id: runId }, data: { artifactId: artifact.id } });
        console.log(`[persistence] Artifact ${artifact.id} written for run ${runId}`);
      } catch (err) {
        console.warn("[persistence] recordArtifact: DB write failed:", err instanceof Error ? err.message : err);
      }
    },
```

Also add `recordArtifact` to the `PrototypeRecorder` type:

```typescript
  recordArtifact: (input: { dealId: string; company: string; folderId: string; htmlPath: string }) => Promise<void>;
```

- [ ] **Step 4: Wire it into the loop.** In `worker/loop.ts`, add to `BuildBrief`:

```typescript
  /** The deal's Drive /Prototype subfolder id — Home resolves it and passes it in. */
  drivePrototypeFolderId?: string;
```

In the success branch, after `await recorder.finish({ status: "done", ... })`, add:

```typescript
    // Persist the final deliverable (Drive + Artifact) when this is a real, deal-scoped run.
    if (input.dealId && input.drivePrototypeFolderId && fs.existsSync(prototypePath)) {
      await recorder.recordArtifact({
        dealId: input.dealId,
        company: input.client,
        folderId: input.drivePrototypeFolderId,
        htmlPath: prototypePath,
      });
    }
```

- [ ] **Step 5: Run the verify script — confirm it PASSES.**

Run: `DATABASE_URL="postgresql://postgres:verify@localhost:55432/verify" npx tsx worker/verify-artifact.ts` (or prod URL per Step 2 note)
Expected: all `✓` then `PASS`.

- [ ] **Step 6: tsc + cleanup + commit.**

```bash
rm worker/verify-artifact.ts
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
git add worker/persistence.ts worker/loop.ts
git commit -m "feat(worker): on success, upload final HTML to Drive + write Artifact/AuditLog/Activity"
```

---

### Task 5: Worker — `/build` accepts runId + scope and attaches

**Files:**
- Modify: `worker/index.ts`
- Modify: `worker/loop.ts` (thread `existingRunId` into `runBuild`)

**Interfaces:**
- Consumes: `runBuild(input: BuildBrief, opts?: { existingRunId?: string })`.
- Produces: `POST /build` body `{ runId, dealId, clientId?, brief, client, industry, drivePrototypeFolderId }`; Bearer `WORKER_SHARED_SECRET`; 202 ACK; runs the loop attached to `runId`.

- [ ] **Step 1: Thread `existingRunId` through `runBuild`.** In `worker/loop.ts`, change the signature and the `createPrototypeRun` call:

```typescript
export async function runBuild(
  input: BuildBrief,
  opts: { runId?: string; existingRunId?: string } = {},
): Promise<BuildResult> {
  const id = opts.runId || `run-${Date.now()}`;
  // ... runDir setup unchanged ...
  const recorder = await createPrototypeRun(
    { clientName: input.client, industry: input.industry, model: config.model, dealId: input.dealId, clientId: input.clientId, brief: input.brief },
    { existingRunId: opts.existingRunId },
  );
```

(Update `dev-run.ts` if it calls `runBuild(SAMPLE, "...")` positionally — change to `runBuild(SAMPLE)`.)

- [ ] **Step 2: Update `/build` in `worker/index.ts`** to parse the new body and pass `existingRunId`:

```typescript
      let input: BuildBrief & { runId?: string };
      try {
        input = JSON.parse(body);
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "bad json" }));
        return;
      }
      res.writeHead(202, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "started", runId: input.runId ?? null }));
      runBuild(input, { existingRunId: input.runId })
        .then((r) => console.log(`[build done] ${r.runDir} rounds=${r.rounds} score=${r.finalScore} runId=${r.runId}`))
        .catch((e) => console.error("[build failed]", e));
```

- [ ] **Step 3: tsc.**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual auth + ACK check.** Start the worker locally and curl it.

Run (terminal A): `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"; WORKER_SHARED_SECRET=devsecret npm run worker`
Run (terminal B):
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:8787/build -d '{}'                                  # expect 401
curl -s -X POST localhost:8787/build -H "Authorization: Bearer devsecret" -H 'content-type: application/json' \
  -d '{"runId":null,"client":"Curl Co","industry":"test","brief":"a tiny one-tab page"}'                         # expect {"status":"started",...}
```
Expected: first `401`; second a 202 JSON; the worker logs a run starting. (Kill it after.)

- [ ] **Step 5: Commit.**

```bash
git add worker/index.ts worker/loop.ts worker/dev-run.ts
git commit -m "feat(worker): /build accepts runId + scope and attaches to the pre-inserted run"
```

---

### Task 6: Worker — default model to Opus

**Files:** Modify: `worker/config.ts`

**Interfaces:** Produces: `config.model` defaults to the latest Opus when `PROTOTYPE_MODEL` is unset.

- [ ] **Step 1: Change the default.** In `worker/config.ts`:

```typescript
  // Build/critique model. Opus by default for client-facing quality; override with PROTOTYPE_MODEL.
  model: process.env.PROTOTYPE_MODEL || "claude-opus-4-8",
```

- [ ] **Step 2: tsc + commit.**

```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
git add worker/config.ts
git commit -m "feat(worker): default to Opus for client-facing build quality"
```

---

### Task 7: Home — `startPrototypeBuild` / `getPrototypeRunStatus` / `approvePrototype`

**Files:**
- Create: `app/(app)/pipeline/[id]/prototype-actions.ts`

**Interfaces:**
- Consumes: `ensureDealSubfolder(dealId, "Prototype")` → `{folderId}`; `auth()`; `prisma`; `partnerActor`; `writeAudit`; `process.env.WORKER_URL`, `WORKER_SHARED_SECRET`.
- Produces:
  - `startPrototypeBuild(dealId: string, brief: string): Promise<{ runId: string }>`
  - `getPrototypeRunStatus(runId: string): Promise<{ status; rounds; finalScore; finalHtmlUrl; artifactId; iterations: {round; score; critique; screenshotUrl; htmlUrl}[] } | null>`
  - `approvePrototype(runId: string): Promise<{ ok: true }>`

- [ ] **Step 1: Create the file** `app/(app)/pipeline/[id]/prototype-actions.ts`:

```typescript
"use server";
// Home ⇄ worker control plane for the prototype-builder. Inserts the run row, hands the
// job to the Railway worker over authenticated HTTP, and exposes a read-only poll target
// (mirrors targeting/run-actions.ts) plus the approve action.
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureDealSubfolder } from "@/lib/deal-drive";
import { writeAudit, partnerActor } from "@/lib/audit";
import { assertNoNeedsInput } from "@/lib/no-hallucination";

export async function startPrototypeBuild(dealId: string, brief: string): Promise<{ runId: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const text = brief.trim();
  if (!text) throw new Error("Approve a brief first");
  assertNoNeedsInput(text, "brief");

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, company: true, industry: true },
  });
  if (!deal) throw new Error("Deal not found");

  const { folderId } = await ensureDealSubfolder(dealId, "Prototype");

  const run = await prisma.prototypeRun.create({
    data: { status: "pending", clientName: deal.company, industry: deal.industry, dealId: deal.id, brief: text, model: process.env.PROTOTYPE_MODEL ?? null },
    select: { id: true },
  });

  const workerUrl = process.env.WORKER_URL;
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!workerUrl || !secret) {
    await prisma.prototypeRun.update({ where: { id: run.id }, data: { status: "error", error: "WORKER_URL/secret not configured", finishedAt: new Date() } });
    throw new Error("Worker not configured");
  }
  try {
    const resp = await fetch(`${workerUrl.replace(/\/$/, "")}/build`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ runId: run.id, dealId: deal.id, brief: text, client: deal.company, industry: deal.industry, drivePrototypeFolderId: folderId }),
    });
    if (!resp.ok) throw new Error(`worker returned ${resp.status}`);
  } catch (err) {
    await prisma.prototypeRun.update({ where: { id: run.id }, data: { status: "error", error: err instanceof Error ? err.message.slice(0, 500) : "POST failed", finishedAt: new Date() } });
    throw new Error("Could not reach the build worker");
  }
  return { runId: run.id };
}

export async function getPrototypeRunStatus(runId: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const run = await prisma.prototypeRun.findUnique({
    where: { id: runId },
    select: {
      status: true, rounds: true, finalScore: true, finalHtmlUrl: true, artifactId: true, error: true,
      iterations: { orderBy: { round: "asc" }, select: { round: true, score: true, critique: true, screenshotUrl: true, htmlUrl: true } },
    },
  });
  return run;
}

export async function approvePrototype(runId: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);
  const run = await prisma.prototypeRun.findUnique({ where: { id: runId }, select: { artifactId: true, dealId: true } });
  if (!run?.artifactId) throw new Error("No artifact to approve yet");
  await prisma.$transaction(async (tx) => {
    await tx.artifact.update({ where: { id: run.artifactId! }, data: { reviewStatus: "approved" } });
    await writeAudit(tx, { actor, action: "approve.artifact.prototype", targetType: "Artifact", targetId: run.artifactId!, changes: { runId } });
  });
  return { ok: true };
}
```

- [ ] **Step 2: tsc + build.**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run build`
Expected: clean (build may show the known local heap quirk — if it OOMs, `tsc` clean is sufficient per the Global Constraints).

- [ ] **Step 3: Commit.**

```bash
git add "app/(app)/pipeline/[id]/prototype-actions.ts"
git commit -m "feat(pipeline): startPrototypeBuild + getPrototypeRunStatus + approvePrototype actions"
```

---

### Task 8: Home — the split iteration view component

**Files:**
- Create: `components/prototype-build-view.tsx`

**Interfaces:**
- Consumes: `getPrototypeRunStatus(runId)`, `approvePrototype(runId)` from `prototype-actions.ts`; the existing UI primitives in `components/ui.tsx` (`Button`) and `lib/cn.ts` (`cn`).
- Produces: `<PrototypeBuildView runId={string} onRunAgain={() => void} onDone={() => void} />` — polls every ~4s, renders the left round list + right big preview, embeds the final HTML on `done`, and exposes Approve / Run again.

- [ ] **Step 1: Create the component** `components/prototype-build-view.tsx`:

```typescript
"use client";
import { useEffect, useState, useTransition } from "react";
import { getPrototypeRunStatus, approvePrototype } from "@/app/(app)/pipeline/[id]/prototype-actions";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

type Iter = { round: number; score: number | null; critique: string | null; screenshotUrl: string | null; htmlUrl: string | null };
type Status = { status: string; rounds: number; finalScore: number | null; finalHtmlUrl: string | null; artifactId: string | null; error: string | null; iterations: Iter[] } | null;

function badge(score: number | null) {
  const s = score ?? 0;
  return cn("inline-block min-w-[34px] text-center rounded-full px-2 text-[12px] font-bold", s >= 85 ? "bg-flag-green/15 text-flag-green" : s >= 70 ? "bg-track-gold-dim/15 text-track-gold" : "bg-flag-red/15 text-flag-red");
}

export function PrototypeBuildView({ runId, onRunAgain, onDone }: { runId: string; onRunAgain: () => void; onDone: () => void }) {
  const [data, setData] = useState<Status>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [isApproving, startApprove] = useTransition();
  const done = data?.status === "done";
  const errored = data?.status === "error";

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const s = await getPrototypeRunStatus(runId);
      if (!alive) return;
      setData(s);
      if (s && (s.status === "done" || s.status === "error")) { onDone(); return; }
      setTimeout(tick, 4000);
    };
    tick();
    return () => { alive = false; };
  }, [runId, onDone]);

  const iters = data?.iterations ?? [];
  const current = selected != null ? iters.find((i) => i.round === selected) : iters[iters.length - 1];

  return (
    <div className="px-5 py-5 flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-graphite pb-2">
        <span className="text-[13px] text-bone">
          {errored ? "Build failed" : done ? `Done · score ${data?.finalScore ?? "—"}` : `Round ${iters.length || "…"} · building`}
        </span>
        {errored && <span className="text-[12px] text-flag-red">{data?.error}</span>}
      </div>

      <div className="flex gap-3">
        <div className="w-[120px] shrink-0 flex flex-col gap-2">
          {iters.map((it) => (
            <button key={it.round} onClick={() => setSelected(it.round)}
              className={cn("text-left px-2 py-1.5 rounded-[var(--radius-sm)] border text-[12px]", (current?.round === it.round) ? "border-track-gold/50 text-bone" : "border-graphite text-bone-mute hover:text-bone")}>
              R{it.round} <span className={badge(it.score)}>{it.score ?? "—"}</span>
            </button>
          ))}
          {!iters.length && <span className="text-[12px] text-bone-mute">Waiting for round 1…</span>}
        </div>

        <div className="flex-1 flex flex-col gap-2 min-w-0">
          {done && data?.finalHtmlUrl ? (
            <iframe title="Prototype" src={data.finalHtmlUrl} sandbox="allow-scripts"
              className="w-full h-[58vh] bg-white rounded-[var(--radius)] border border-graphite" />
          ) : current?.screenshotUrl ? (
            <img src={current.screenshotUrl} alt={`Round ${current.round}`}
              className="w-full max-h-[58vh] object-contain bg-bitumen rounded-[var(--radius)] border border-graphite" />
          ) : (
            <div className="w-full h-[58vh] grid place-items-center bg-bitumen rounded-[var(--radius)] border border-graphite text-[12px] text-bone-mute">
              Rendering…
            </div>
          )}
          {current?.critique && <p className="text-[11px] text-bone-mute">{current.critique}</p>}
        </div>
      </div>

      <div className="flex justify-between items-center pt-1 border-t border-graphite mt-1">
        <Button variant="ghost" size="sm" onClick={onRunAgain} disabled={!done && !errored}>↻ Run again</Button>
        <Button variant="primary" size="sm" disabled={!done || !data?.artifactId || isApproving}
          onClick={() => startApprove(async () => { await approvePrototype(runId); onDone(); })}>
          {isApproving ? "Approving…" : "Approve final"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: tsc.** (Confirm the brand color tokens used — `flag-green`, `track-gold`, `flag-red`, `bitumen`, `graphite`, `bone-mute` — exist in `app/globals.css`; if a token name differs, match the existing one.)

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit.**

```bash
git add components/prototype-build-view.tsx
git commit -m "feat(pipeline): split iteration view (round list + preview + sandboxed embed)"
```

---

### Task 9: Home — wire the build view into the modal; retire the one-shot

**Files:**
- Modify: `components/proposal-engine-modal.tsx`
- Modify: `app/(app)/pipeline/[id]/proposal-engine.ts` (delete `generatePrototypeHtml`, `savePrototype`)

**Interfaces:**
- Consumes: `startPrototypeBuild(dealId, brief)`; `<PrototypeBuildView/>`.
- Produces: in `prototype` mode, approving the brief calls `startPrototypeBuild` and renders `<PrototypeBuildView/>` instead of the one-shot build/save step. `deck` mode is unchanged.

- [ ] **Step 1: In `proposal-engine-modal.tsx`**, add imports and a `runId` state:

```typescript
import { startPrototypeBuild } from "@/app/(app)/pipeline/[id]/prototype-actions";
import { PrototypeBuildView } from "@/components/prototype-build-view";
// ... in component state:
const [runId, setRunId] = useState<string | null>(null);
const [startErr, setStartErr] = useState<string | null>(null);
const [isStarting, startBuild] = useTransition();
```

- [ ] **Step 2: Replace the brief→build transition for `prototype` mode.** Where the modal currently moves from the brief step to the one-shot build (the "Build" button that calls `generatePrototypeHtml`), for `isPrototype` call:

```typescript
const launch = () =>
  startBuild(async () => {
    setStartErr(null);
    try {
      const { runId } = await startPrototypeBuild(dealId, brief);
      setRunId(runId);
      setStep("build");
    } catch (e) {
      setStartErr(e instanceof Error ? e.message : "Could not start the build");
    }
  });
```

The brief-step primary button (prototype mode) now reads `{isStarting ? "Starting…" : "Build prototype →"}` and calls `launch`. (Deck mode keeps calling its existing generate path.)

- [ ] **Step 3: Render the build view in the `build` step for prototype mode.** Replace the prototype branch of the `step === "build"` block with:

```typescript
) : step === "build" && isPrototype ? (
  runId ? (
    <PrototypeBuildView
      runId={runId}
      onRunAgain={() => { setRunId(null); setStep("brief"); }}
      onDone={() => { /* keep modal open; partner closes or runs again */ }}
    />
  ) : (
    <div className="px-5 py-6 text-[12px] text-bone-dim">
      {startErr ? <span className="text-flag-red">{startErr}</span> : "Starting the build…"}
    </div>
  )
) : step === "build" ? (
  /* existing deck one-shot build/save JSX stays here unchanged */
```

- [ ] **Step 4: Delete the retired functions.** In `app/(app)/pipeline/[id]/proposal-engine.ts`, remove `generatePrototypeHtml` (lines ~144–167) and `savePrototype` (lines ~276–278). Remove any now-unused imports they alone used (`buildDealContext`, `loadScreenshotImages`, `BUILD_MODEL`, `stripCodeFence`) **only if** no other function in the file uses them — grep first; the deck path likely still uses some. Leave `generatePrototypeBrief`/`savePrototypeBrief` and the deck functions intact.

Run before deleting imports: `grep -nE "buildDealContext|loadScreenshotImages|BUILD_MODEL|stripCodeFence|generatePrototypeHtml|savePrototype\b" "app/(app)/pipeline/[id]/proposal-engine.ts"`

- [ ] **Step 5: Remove the now-dead calls in the modal.** Delete the modal's `generatePrototypeHtml`/`savePrototype` import and the `html`/`saveFinal`/`rebuild` logic that only served prototype mode (keep what deck mode uses). Verify the deck flow still references its own functions.

- [ ] **Step 6: tsc + build + manual.**

Run: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`
Expected: clean (no references to deleted symbols).

- [ ] **Step 7: Commit.**

```bash
git add "components/proposal-engine-modal.tsx" "app/(app)/pipeline/[id]/proposal-engine.ts"
git commit -m "feat(pipeline): Build → worker loop + live view; retire one-shot prototype build"
```

---

### Task 10: Home — recognize the `prototype-builder` skill (deck gate + status)

**Files:**
- Modify: `app/(app)/pipeline/[id]/page.tsx`

**Interfaces:**
- Consumes: `prisma.artifact`, `ranAtBySkill`.
- Produces: `hasPrototype` true when a `prototype-builder` OR `html-prototype` artifact exists; `actionRanAt["build-prototype"]` reflects the new skill.

- [ ] **Step 1: Update the `hasPrototype` query.** In `app/(app)/pipeline/[id]/page.tsx`, change the prototype artifact lookup to accept both skills:

```typescript
    prisma.artifact.findFirst({
      where: { dealId: id, generatedFromSkill: { in: ["prototype-builder", "html-prototype"] } },
      select: { id: true },
    }),
```

- [ ] **Step 2: Update the ranAt mapping.** Change:

```typescript
    "build-prototype": ranAt["prototype-builder"] ?? ranAt["html-prototype"],
```

(`ranAtBySkill` returns a map keyed by `generatedFromSkill`; including the fallback keeps the green "last ran" working for both old and new prototypes.)

- [ ] **Step 3: tsc + commit.**

```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
git add "app/(app)/pipeline/[id]/page.tsx"
git commit -m "fix(pipeline): recognize prototype-builder artifacts for the deck gate + status"
```

---

### Task 11: Local end-to-end verification

**Files:** none (verification); set local env.

**Interfaces:** Consumes everything above.

- [ ] **Step 1: Set local env.** In `.env` add (Storage is required for screenshots/embed): `WORKER_URL=http://localhost:8787`, `WORKER_SHARED_SECRET=devsecret`, `SUPABASE_URL=…`, `SUPABASE_SERVICE_ROLE_KEY=…`. (Jason provides the Supabase Storage creds.)

- [ ] **Step 2: Start the worker** (terminal A, Node 22):

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
WORKER_SHARED_SECRET=devsecret npm run worker
```

- [ ] **Step 3: Start the app** (terminal B): `npm run dev` (port 3030).

- [ ] **Step 4: Drive the flow.** Open a real deal → **Build prototype** → confirm the brief generates → approve it → **Build prototype →**. Confirm in the modal: rounds appear ~every 4s, clicking a round shows its screenshot, the score badges update, and on completion the **interactive HTML embeds** and is clickable.

- [ ] **Step 5: Approve + verify persistence.** Click **Approve final**. Then verify:

```bash
npx tsx -e "import {prisma} from './lib/prisma'; const a=await prisma.artifact.findFirst({where:{generatedFromSkill:'prototype-builder'},orderBy:{createdAt:'desc'}}); console.log(a?.reviewStatus, a?.driveUrl); process.exit(0)"
```
Expected: `approved https://…drive…` and the artifact shows on the deal page; the deal's Drive `/Prototype` folder has the HTML.

- [ ] **Step 6: Cap + auth checks.** Set `PROTOTYPE_MAX_ITERATIONS=1` for one run → confirm it stops at round 1. `curl -X POST localhost:8787/build -d '{}'` → `401`.

- [ ] **Step 7: Commit any env-example/doc updates** (do NOT commit `.env`). If you keep a `.env.example`, add the new keys there.

```bash
git add -A && git commit -m "chore(worker): document Phase C local env keys" || echo "nothing to commit"
```

---

### Task 12: Dockerfile + Railway runbook

**Files:**
- Create: `worker/Dockerfile`
- Create: `docs/worker-railway-runbook.md`

**Interfaces:** Produces a deployable image + the human runbook.

- [ ] **Step 1: Create `worker/Dockerfile`:**

```dockerfile
FROM node:22-slim
WORKDIR /app
# Playwright system deps + chromium need apt; install before npm so layers cache.
COPY package*.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium
COPY . .
RUN npx prisma generate
ENV NODE_ENV=production
CMD ["npm", "run", "worker"]
```

- [ ] **Step 2: (optional) Build the image locally to catch errors.**

Run: `docker build -f worker/Dockerfile -t proto-worker .`
Expected: builds successfully (large image; chromium + deps).

- [ ] **Step 3: Create `docs/worker-railway-runbook.md`** with the exact steps Jason runs:

```markdown
# Prototype worker — Railway deploy runbook

1. Railway → New Project → Deploy from GitHub repo `JasonLotoski-Shift/shiftai-ops`.
2. Service settings → set the Dockerfile path to `worker/Dockerfile` (or start command `npm run worker` with the Nixpacks Node 22 + a playwright install build step — Dockerfile is simpler).
3. Variables: ANTHROPIC_API_KEY, DATABASE_URL (Supabase **Direct**, port 5432 — NOT the pooler),
   GOOGLE_SERVICE_ACCOUNT_KEY_B64, PROTOTYPE_LIBRARY_FOLDER_ID=15Hl4UUK4A5wrbXWOQp6Qj1YXk-w8hYUS,
   WORKER_SHARED_SECRET (generate a strong random), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
   PROTOTYPE_MODEL=claude-opus-4-8.
4. Resources: ≥1 GiB RAM (Chromium is heavy).
5. Deploy → copy the public service URL.
6. In Vercel (the app): set WORKER_URL=<railway url> and the same WORKER_SHARED_SECRET; redeploy.
7. Smoke test: `curl -X POST <railway>/build -d '{}'` → 401; with the Bearer secret → 202.
```

- [ ] **Step 4: Commit.**

```bash
git add worker/Dockerfile docs/worker-railway-runbook.md
git commit -m "feat(worker): Dockerfile + Railway deploy runbook"
```

---

### Task 13: Railway deploy (human-executed) + deployed verification

**Files:** none (Jason executes the runbook).

- [ ] **Step 1:** Jason follows `docs/worker-railway-runbook.md` (create service, set env, deploy, note URL).
- [ ] **Step 2:** Set Vercel `WORKER_URL` + `WORKER_SHARED_SECRET`; redeploy the app.
- [ ] **Step 3:** From the deployed ops tool, run a full build on a deal → iterations stream → approve → Artifact persisted. Confirm `curl <railway>/build -d '{}'` returns 401.
- [ ] **Step 4:** Update `worker/README.md` status to "Phase C deployed" + note the Railway service. Commit.

```bash
git add worker/README.md
git commit -m "docs(worker): Phase C deployed to Railway"
```

---

## Self-Review (completed by the plan author)

- **Spec coverage:** §1 integration → Task 9; §2 data flow → Tasks 5/7/8; §3 data model → Tasks 1/2; §4 worker → Tasks 3/4/5/6; §5 Home → Tasks 7/8/9/10; §6 iteration view → Task 8; §7 deploy → Tasks 12/13; §8 prereqs → Tasks 2/11; §11 verification → Tasks 11/13. All covered.
- **Type consistency:** `createPrototypeRun(init, {existingRunId})`, `runBuild(input, {runId, existingRunId})`, `recordArtifact({dealId, company, folderId, htmlPath})`, `getPrototypeRunStatus → {status,rounds,finalScore,finalHtmlUrl,artifactId,error,iterations[]}`, `<PrototypeBuildView runId onRunAgain onDone/>` — consistent across tasks.
- **Open risk to watch during execution:** the brand color token names in Task 8 (`flag-green`, etc.) — verify against `app/globals.css` and adjust if a token differs. Task 9 import cleanup — grep before deleting shared imports.
