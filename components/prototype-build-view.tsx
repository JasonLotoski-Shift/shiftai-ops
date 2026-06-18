"use client";
import { useEffect, useState, useTransition } from "react";
import { getPrototypeRunStatus, approvePrototype } from "@/app/(app)/pipeline/[id]/prototype-actions";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

type Iter = { round: number; score: number | null; critique: string | null; screenshotUrl: string | null; htmlUrl: string | null };
type Status = { status: string; rounds: number; finalScore: number | null; finalHtmlUrl: string | null; artifactId: string | null; error: string | null; iterations: Iter[] } | null;

function badge(score: number | null) {
  const s = score ?? 0;
  return cn("inline-block min-w-[34px] text-center rounded-full px-2 text-[12px] font-bold", s >= 85 ? "bg-invoice-paid/15 text-invoice-paid" : s >= 70 ? "bg-track-gold-dim/15 text-track-gold" : "bg-flag-red/15 text-flag-red");
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
