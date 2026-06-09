// System status — the read side of the OpsEvent telemetry. Self-contained async
// server component (display-only, so it queries directly rather than taking
// props). Rendered only on /settings?tab=status, so the heavy queries + the
// Drive ping run only when the tab is open. Visible to all partners.

import { Card, CardHeader, CardBody, Badge, Stat, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { estimateCostUSD, logOps } from "@/lib/ops";
import { pingDrive } from "@/lib/drive";

const DAY = 24 * 60 * 60 * 1000;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function fmtTime(d: Date): string {
  return d.toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

export async function SystemStatus() {
  const now = Date.now();
  const since24h = new Date(now - DAY);
  const since7d = new Date(now - 7 * DAY);

  // ── Claude (24h) ──
  const claudeByStatus = await safe(
    () => prisma.opsEvent.groupBy({ by: ["status"], where: { kind: "claude", ts: { gte: since24h } }, _count: { _all: true } }),
    [] as { status: string; _count: { _all: number } }[],
  );
  const claudeCalls = claudeByStatus.reduce((s, g) => s + g._count._all, 0);
  const claudeErrors = claudeByStatus.find((g) => g.status === "error")?._count._all ?? 0;
  const claudeAgg = await safe(
    () => prisma.opsEvent.aggregate({ where: { kind: "claude", ts: { gte: since24h } }, _sum: { inputTokens: true, outputTokens: true }, _avg: { durationMs: true } }),
    { _sum: { inputTokens: null, outputTokens: null }, _avg: { durationMs: null } },
  );
  const costByModel = await safe(
    () => prisma.opsEvent.groupBy({ by: ["model"], where: { kind: "claude", ts: { gte: since7d } }, _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true } }),
    [] as { model: string | null; _sum: { inputTokens: number | null; outputTokens: number | null; cacheReadTokens: number | null } }[],
  );
  const cost7d = costByModel.reduce(
    (s, g) => s + estimateCostUSD(g.model, g._sum.inputTokens ?? 0, g._sum.outputTokens ?? 0, g._sum.cacheReadTokens ?? 0),
    0,
  );
  const tokens24h = (claudeAgg._sum.inputTokens ?? 0) + (claudeAgg._sum.outputTokens ?? 0);
  const avgMs = Math.round(claudeAgg._avg.durationMs ?? 0);

  // ── Crons (last run each) ──
  const cron = async (name: string) =>
    safe(() => prisma.opsEvent.findFirst({ where: { kind: "cron", name }, orderBy: { ts: "desc" } }), null);
  const [gmailCron, ffCron] = await Promise.all([cron("gmail-poll"), cron("fireflies-poll")]);

  // ── Gmail per-partner ──
  const gmail = await safe(
    () => prisma.partnerGmailAuth.findMany({
      select: { email: true, lastError: true, connectedAt: true, partner: { select: { name: true } } },
      orderBy: { connectedAt: "asc" },
    }),
    [] as { email: string; lastError: string | null; connectedAt: Date; partner: { name: string } }[],
  );

  // ── Drive (live ping, 5-min freshness guard) ──
  const lastDrive = await safe(
    () => prisma.opsEvent.findFirst({ where: { kind: "integration", name: "drive" }, orderBy: { ts: "desc" } }),
    null,
  );
  let drive: { ok: boolean; ms: number; error?: string | null; ts: Date };
  if (lastDrive && now - lastDrive.ts.getTime() < 5 * 60 * 1000) {
    drive = { ok: lastDrive.status === "ok", ms: lastDrive.durationMs ?? 0, error: lastDrive.error, ts: lastDrive.ts };
  } else {
    const ping = await pingDrive();
    void logOps({ kind: "integration", name: "drive", status: ping.ok ? "ok" : "error", durationMs: ping.ms, error: ping.error, actor: "system", actorLabel: "SYSTEM" });
    drive = { ok: ping.ok, ms: ping.ms, error: ping.error, ts: new Date() };
  }

  // ── Recent events + failures ──
  const recent = await safe(
    () => prisma.opsEvent.findMany({ orderBy: { ts: "desc" }, take: 50 }),
    [] as Awaited<ReturnType<typeof prisma.opsEvent.findMany>>,
  );
  const failures7d = await safe(
    () => prisma.opsEvent.count({ where: { status: "error", ts: { gte: since7d } } }),
    0,
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-[13px] text-bone-mute max-w-[680px] leading-relaxed">
          Health of the tool&apos;s automated machinery — every Claude action, scheduled poll, ingest, and integration
          check is logged here so you can see what&apos;s working and what failed. Errors also message the relevant
          partner. Events are kept ~30 days.
        </p>
      </div>

      {/* Health cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Claude */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="title-md">Claude API</h3>
            <Badge tone={claudeErrors > 0 ? "red" : "steel"}>{claudeErrors > 0 ? `${claudeErrors} failed` : "healthy"}</Badge>
          </CardHeader>
          <CardBody className="grid grid-cols-3 gap-3 pt-0">
            <Stat label="Calls (24h)" value={claudeCalls} gold={claudeErrors > 0} />
            <Stat label="Avg latency" value={avgMs ? `${(avgMs / 1000).toFixed(1)}s` : "—"} />
            <Stat label="Tokens (24h)" value={tokens24h ? fmtTokens(tokens24h) : "—"} />
            <Stat label="Errors (24h)" value={claudeErrors} />
            <Stat label="~Cost (7d)" value={cost7d ? `$${cost7d.toFixed(2)}` : "—"} delta="approx" />
          </CardBody>
        </Card>

        {/* Drive */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="title-md">Google Drive</h3>
            <Badge tone={drive.ok ? "steel" : "red"}>{drive.ok ? "reachable" : "unreachable"}</Badge>
          </CardHeader>
          <CardBody className="grid grid-cols-2 gap-3 pt-0">
            <Stat label="Last check" value={fmtTime(drive.ts)} />
            <Stat label="Response" value={drive.ok ? `${drive.ms}ms` : "—"} />
            {!drive.ok && drive.error && <p className="col-span-2 text-[12px] text-flag-red">{drive.error}</p>}
          </CardBody>
        </Card>

        {/* Fireflies cron */}
        <CronCard title="Fireflies sweep" run={ffCron} />
        {/* Gmail cron */}
        <CronCard title="Gmail sweep" run={gmailCron} />
      </div>

      {/* Gmail connections */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h3 className="title-md">Gmail connections</h3>
          <Badge tone={gmail.some((g) => g.lastError) ? "red" : "steel"}>
            {gmail.length === 0 ? "none connected" : gmail.some((g) => g.lastError) ? "attention" : "healthy"}
          </Badge>
        </CardHeader>
        <CardBody className="pt-0">
          {gmail.length === 0 ? (
            <p className="text-[12px] text-bone-mute">No partner has connected Gmail yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {gmail.map((g) => (
                <div key={g.email} className="flex items-center justify-between gap-4 text-[13px]">
                  <span className="text-bone-dim truncate">
                    <span className="text-bone">{g.partner.name}</span> · {g.email}
                  </span>
                  {g.lastError ? (
                    <span className="text-[12px] text-flag-red truncate max-w-[50%]" title={g.lastError}>{g.lastError}</span>
                  ) : (
                    <Badge tone="steel">connected</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Recent events */}
      <Card>
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h3 className="title-md">Recent activity</h3>
          <span className="text-[11px] text-bone-mute">{failures7d} error(s) in 7 days</span>
        </div>
        {recent.length === 0 ? (
          <EmptyState compact icon={<></>} title="Nothing logged yet" hint="Run a Quick Action or a sync and it'll show here." />
        ) : (
          <div className="flex flex-col">
            {recent.map((e) => (
              <div
                key={e.id}
                className={`grid grid-cols-[1fr_auto] gap-4 px-5 py-2.5 border-t border-graphite/40 ${e.status === "error" ? "bg-flag-red/[0.04]" : ""}`}
              >
                <div className="min-w-0 flex items-center gap-2">
                  <span className={`mono text-[10px] uppercase shrink-0 ${e.status === "error" ? "text-flag-red" : "text-bone-mute"}`}>{e.kind}</span>
                  <span className="text-[13px] text-bone truncate">{e.name}</span>
                  {e.detail && <span className="text-[12px] text-bone-mute truncate hidden sm:inline">· {e.detail}</span>}
                  {e.status === "error" && e.error && <span className="text-[12px] text-flag-red truncate">— {e.error}</span>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {e.durationMs != null && <span className="mono text-[11px] text-bone-mute">{e.durationMs}ms</span>}
                  <span className="mono text-[11px] text-bone-mute">{fmtTime(e.ts)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function CronCard({ title, run }: { title: string; run: { status: string; ts: Date; detail: string | null; durationMs: number | null } | null }) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <h3 className="title-md">{title}</h3>
        <Badge tone={!run ? "neutral" : run.status === "error" ? "red" : "steel"}>
          {!run ? "no runs yet" : run.status === "error" ? "last run failed" : "ok"}
        </Badge>
      </CardHeader>
      <CardBody className="pt-0 flex flex-col gap-1.5">
        {run ? (
          <>
            <span className="text-[12px] text-bone-dim">{run.detail ?? "—"}</span>
            <span className="text-[11px] text-bone-mute">Last run {fmtTime(run.ts)}{run.durationMs != null ? ` · ${(run.durationMs / 1000).toFixed(1)}s` : ""}</span>
          </>
        ) : (
          <span className="text-[12px] text-bone-mute">Runs hourly once deployed.</span>
        )}
      </CardBody>
    </Card>
  );
}
