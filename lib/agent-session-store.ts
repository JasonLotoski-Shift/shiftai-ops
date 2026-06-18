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
