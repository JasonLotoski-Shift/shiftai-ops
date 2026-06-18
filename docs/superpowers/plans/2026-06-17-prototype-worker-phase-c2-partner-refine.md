# Prototype-Builder — Phase C.2: Partner-comment refine pass (+ durable SessionStore)

> Implement task-by-task. Checkbox steps. Builds on Phase C / C.1 (branch `feat/prototype-worker-phase-c`).

**Goal:** After the auto-loop satisfies the gate (`done`), the partner can leave ONE comment (any length) that triggers exactly ONE more agent pass — the agent *resumes its own session* and revises intelligently — then the partner approves. Blank + approve skips. Backed by a durable Postgres `SessionStore` so resume works across worker restarts.

**Decisions:** exactly one partner-refine pass per run; durable SessionStore now.

## Global Constraints (same as Phase C/C.1)
- No test framework. Gate = `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`; Home tasks also `npm run build`. Worker on Node 22 (`export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`).
- worker/ is plain Node; lib/* are worker-safe. Do NOT run prisma migrate against prod, do NOT start live builds, do NOT push. Commit per task.
- Ephemeral Docker PG (`postgresql://postgres:verify@localhost:55432/verify`) for verify scripts only; verify scripts live inside the repo + load dotenv + are deleted after.
- SDK `SessionStore` shape (from sdk.d.ts): `append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void>` and `load(key: SessionKey): Promise<SessionStoreEntry[] | null>`. `SessionKey = { projectKey: string; sessionId: string }`. `SessionStoreEntry = { type: string; uuid?: string; timestamp?: string; [k: string]: unknown }`. `append` batches ~100ms; dedup by non-null `uuid` (upsert); null-`uuid` entries append without dedup. `load` returns entries in append order, or `null` if never written.

---

### Task C2-1: Schema + prepared migration (NOT applied)

**Files:** Modify `prisma/schema.prisma`; create `prisma/_prepared-migrations/008_partner_refine.sql`

**Interfaces produced:** `AgentSessionEntry` model; `PrototypeIteration.partnerComment String?`; `PrototypeRun.refineUsed Boolean @default(false)`; `PrototypeRunStatus.refining`.

- [ ] **Step 1:** In `prisma/schema.prisma` add to `enum PrototypeRunStatus` a `refining` value (after `running`). Add to `model PrototypeRun`: `refineUsed Boolean @default(false)`. Add to `model PrototypeIteration`: `partnerComment String?`. Add a new model at the end of the file:

```prisma
// Durable Agent SDK session store — mirrors each run's transcript so a resume
// (the partner-refine pass) works across worker restarts. One row per transcript
// entry; idempotent on (projectKey, sessionId, uuid). See lib/agent-session-store.ts.
model AgentSessionEntry {
  id         BigInt   @id @default(autoincrement())
  projectKey String
  sessionId  String
  uuid       String?
  data       Json
  createdAt  DateTime @default(now())

  @@unique([projectKey, sessionId, uuid])
  @@index([projectKey, sessionId, id])
}
```

- [ ] **Step 2:** `npx prisma validate && npx prisma generate` → valid + client generated.
- [ ] **Step 3:** Generate the prepared SQL (no DB): `git show HEAD:prisma/schema.prisma > /tmp/base8.prisma && npx prisma migrate diff --from-schema /tmp/base8.prisma --to-schema prisma/schema.prisma --script > /tmp/008.sql && cat /tmp/008.sql`. Save it to `prisma/_prepared-migrations/008_partner_refine.sql` with a one-line header `-- 008 — partner refine + durable session store (PREPARED, NOT APPLIED — needs Jason; applied via migrate deploy).` above the SQL. Confirm it ALTERs the enum + PrototypeRun + PrototypeIteration and CREATEs AgentSessionEntry.
- [ ] **Step 4:** `tsc` clean. Commit: `git commit -m "feat(db): schema for partner-refine + durable AgentSessionEntry store (prepared 008)"`

---

### Task C2-2: Postgres SessionStore adapter

**Files:** Create `lib/agent-session-store.ts`; Test: a temporary repo-root verify script.

**Interface produced:** `makeSessionStore(): SessionStore` (the SDK type) backed by `lib/prisma`. `append` upserts entries; `load` returns ordered entries or null.

- [ ] **Step 1:** Create `lib/agent-session-store.ts`:

```typescript
// Durable Agent SDK SessionStore backed by Postgres (AgentSessionEntry). Lets the
// prototype worker resume a session (the partner-refine pass) across restarts. Worker-safe
// (only imports lib/prisma + the SDK type). See docs/.../phase-c2.
import type { SessionStore, SessionKey, SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk";
import { prisma } from "./prisma";

export function makeSessionStore(): SessionStore {
  return {
    async append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void> {
      for (const entry of entries) {
        const data = entry as unknown as object;
        if (entry.uuid) {
          // Idempotent on (projectKey, sessionId, uuid): retries/replays don't dup.
          await prisma.agentSessionEntry.upsert({
            where: { projectKey_sessionId_uuid: { projectKey: key.projectKey, sessionId: key.sessionId, uuid: entry.uuid } },
            create: { projectKey: key.projectKey, sessionId: key.sessionId, uuid: entry.uuid, data },
            update: { data },
          });
        } else {
          await prisma.agentSessionEntry.create({ data: { projectKey: key.projectKey, sessionId: key.sessionId, uuid: null, data } });
        }
      }
    },
    async load(key: SessionKey): Promise<SessionStoreEntry[] | null> {
      const rows = await prisma.agentSessionEntry.findMany({
        where: { projectKey: key.projectKey, sessionId: key.sessionId },
        orderBy: { id: "asc" },
        select: { data: true },
      });
      if (rows.length === 0) return null;
      return rows.map((r) => r.data as unknown as SessionStoreEntry);
    },
  };
}

// Best-effort cleanup once a run is approved/abandoned — the session is no longer needed.
export async function pruneSession(sessionId: string): Promise<void> {
  try {
    await prisma.agentSessionEntry.deleteMany({ where: { sessionId } });
  } catch (e) {
    console.warn("[session-store] prune failed:", e instanceof Error ? e.message : e);
  }
}
```

- [ ] **Step 2:** Verify against ephemeral PG. Start the container + `prisma db push --url`, then a repo-root script that does: `const s = makeSessionStore(); await s.append({projectKey:"p",sessionId:"s1"}, [{type:"x",uuid:"u1",a:1},{type:"title"}]); await s.append({projectKey:"p",sessionId:"s1"}, [{type:"x",uuid:"u1",a:2}]); const out = await s.load({projectKey:"p",sessionId:"s1"});` — assert `out.length === 3` (u1 upserted once → still 1 row for u1 + the null-uuid title + ... wait: u1 appears twice but upserts to ONE row; the null-uuid `title` is one row → total 2 rows, the second value of u1 wins). Assert `out.length === 2`, the u1 entry has `a===2` (upsert applied), and `load` of an unknown session returns `null`. Run it (DATABASE_URL=ephemeral), confirm PASS, delete the script.
- [ ] **Step 3:** `tsc` clean. Commit: `git commit -m "feat(worker): Postgres-backed Agent SDK SessionStore (durable resume)"`

---

### Task C2-3: Persist sessions on every build + gate round offset

**Files:** Modify `worker/loop.ts`, `worker/tools/gate.ts`

**Interfaces:** loop passes `sessionStore` + a constant `projectKey` to `query()`; `createGateServer` gains `roundOffset?: number` so a resume continues round numbering.

- [ ] **Step 1:** In `worker/tools/gate.ts`, add `roundOffset?: number` to the opts type and change `const round = history.length + 1;` to `const round = (opts.roundOffset ?? 0) + history.length + 1;`.
- [ ] **Step 2:** In `worker/loop.ts`, import `makeSessionStore` from `../lib/agent-session-store` and add to the `query()` `options`:

```typescript
        // Durable session persistence so a later partner-refine pass can resume this build.
        sessionStore: makeSessionStore(),
```

Define a shared constant `export const PROTOTYPE_PROJECT_KEY = "prototype-builder";` near the top of `loop.ts` and pass it where the SDK needs the projectKey (the SessionKey.projectKey defaults to sanitized cwd; to make resume deterministic across machines set it explicitly — pass `cwd`-independent key via the `forkSession`/session options if available, otherwise rely on the store using the SDK-provided key consistently for both build and refine, since both run with the same cwd-derived projectKey in the same deployment). NOTE for the implementer: if the SDK does not expose an explicit projectKey option on `query()`, the SessionKey is derived identically for build and refine (same worker cwd), so resume still matches — just ensure the build and refine use the SAME `sessionStore` instance type and cwd.
- [ ] **Step 3:** `tsc` clean. Commit: `git commit -m "feat(worker): persist every build's session to the durable store + gate roundOffset"`

---

### Task C2-4: Worker refine pass + /refine endpoint

**Files:** Modify `worker/index.ts`, `worker/loop.ts` (add `refineBuild`), `worker/persistence.ts` (partnerComment on the refine iteration)

**Interfaces:**
- `refineBuild(input: { runId: string; comment: string }): Promise<BuildResult>` — resumes the run's session, applies the partner comment in ONE round, persists a new iteration (with `partnerComment`), updates the Drive/Artifact + finalHtmlUrl, sets `refineUsed=true`.
- `POST /refine` body `{ runId, comment }`, Bearer secret, 202 ACK, runs `refineBuild` in the background.
- `recorder.recordIteration` gains an optional `partnerComment` passthrough for the refine round.

- [ ] **Step 1:** In `worker/persistence.ts`, give `recordIteration` an optional second arg `partnerComment?: string | null` and write it to the `PrototypeIteration.partnerComment` column (null on normal rounds). Keep the existing single-arg callers working (default undefined → null).

- [ ] **Step 2:** In `worker/loop.ts`, add `refineBuild`. It mirrors `runBuild` but: (a) loads the run (`sessionId`, `dealId`, `clientName`, `industry`, `drivePrototypeFolderId`, `finalHtmlUrl`, and `max(iterations.round)`); guards `if (run.refineUsed) throw` and `if (!run.sessionId) ` → fall back is handled by Home; (b) SEEDS the working dir: `fetch(finalHtmlUrl)` → write the text to `runDir/prototype.html` so the resumed agent can Edit the existing file; (c) creates eyes/gate(`roundOffset = maxRound`, `maxIterations: 1`)/library + a recorder attached to the run (`existingRunId: runId`), with the gate's `onRound` writing the iteration WITH the partner comment; (d) runs `query()` with `resume: run.sessionId`, `sessionStore: makeSessionStore()`, `settingSources: []`, the same tools/permissions, and a prompt:

```
"A partner reviewed your prototype and asked for these changes. Apply ALL of them to the existing prototype.html, then screenshot, run mcp__eyes__interact to confirm the key interaction still works, score with mcp__gate__score (one pass), and finish.\n\nPARTNER COMMENTS:\n" + comment
```

(e) after the loop: `recordArtifact` to re-upload the final HTML to Drive + update the Artifact (the existing recordArtifact already overwrites by writing a new Artifact — for refine, prefer updating finalHtmlUrl + the SAME artifact's Drive file; if simplest, write a fresh Artifact tagged the refine — implementer's call, but the run's `artifactId` must point at the approvable artifact); set `prisma.prototypeRun.update({ where:{id:runId}, data:{ refineUsed: true, status: "done" } })`. Set `status: "refining"` at the START of `refineBuild`.

- [ ] **Step 3:** In `worker/index.ts`, add a `POST /refine` handler mirroring `/build`: Bearer-secret check, parse `{runId, comment}`, 202 ACK, `refineBuild({runId, comment}).then(...).catch(...)`.

- [ ] **Step 4:** `tsc` clean. Commit: `git commit -m "feat(worker): /refine — resume the session for one partner-directed pass"`

---

### Task C2-5: Home — refine action + run-view UI

**Files:** Modify `app/(app)/pipeline/[id]/prototype-actions.ts`, `components/prototype-build-view.tsx`

**Interfaces:** `refinePrototype(runId: string, comment: string): Promise<{ ok: true }>` (auth, set status `refining`, POST `/refine`); `approvePrototype` also prunes the session.

- [ ] **Step 1:** In `prototype-actions.ts` add `refinePrototype(runId, comment)`: auth; load the run (`refineUsed`, `dealId`); if `refineUsed` throw "already refined"; set `prisma.prototypeRun.update(... status: "refining")`; POST `${WORKER_URL}/build`→ use `/refine` with `{runId, comment}` + Bearer; on POST failure revert status to `done`. Also: in `approvePrototype`, after marking the Artifact approved, call `pruneSession(run.sessionId)` (load sessionId in the select) — import `pruneSession` from `@/lib/agent-session-store`. Extend `getPrototypeRunStatus`'s select to also return `refineUsed` and each iteration's `partnerComment`.

- [ ] **Step 2:** In `components/prototype-build-view.tsx`: extend the `Status`/`Iter` types with `refineUsed: boolean` and `partnerComment: string | null`. When `done && !data.refineUsed`, render a **Partner comments** panel in the left rail (a `<textarea>` + a "Refine once & finalize" button calling `refinePrototype(runId, value)` then it re-polls; disabled while empty? NO — blank is allowed via Approve, but the Refine button requires non-empty). Keep "Approve final" always available when `done`. While `status === "refining"`, show "Applying your note…" and disable both. After refine completes (`refineUsed` true), hide the comment box; only Approve remains. Show each iteration's `partnerComment` as a small "partner: …" line under that round in the rail.

- [ ] **Step 3:** `tsc` clean + `npm run build` clean. Commit: `git commit -m "feat(pipeline): partner-comment refine pass in the run view"`

---

## After the workflow (human-gated, by me)
- Apply migration `008` to prod via `migrate deploy` (hand-built folder from the prepared SQL), verify.
- Restart worker + dev; e2e: build → done → leave a partner note → one refine pass streams a new round → approve. Confirm resume worked (the agent revised, didn't rebuild) and the session persisted/pruned.
