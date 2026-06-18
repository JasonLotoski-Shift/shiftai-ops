"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { getPrototypeRunStatus, approvePrototype, refinePrototype } from "@/app/(app)/pipeline/[id]/prototype-actions";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import Link from "next/link";

type Iter = { round: number; score: number | null; critique: string | null; screenshotUrl: string | null; htmlUrl: string | null; partnerComment: string | null };
type Status = { status: string; rounds: number; finalScore: number | null; finalHtmlUrl: string | null; artifactId: string | null; error: string | null; refineUsed: boolean; iterations: Iter[] } | null;

function badge(score: number | null) {
  const s = score ?? 0;
  return cn(
    "inline-block min-w-[30px] text-center rounded-full px-1.5 text-[11px] font-bold tabular-nums",
    s >= 85 ? "bg-invoice-paid/15 text-invoice-paid" : s >= 70 ? "bg-track-gold-dim/20 text-track-gold" : "bg-flag-red/15 text-flag-red",
  );
}

/**
 * Full-bleed run view — renders as the whole page (no ops chrome). Streams the
 * build's rounds live (~4s poll), shows each round's screenshot, and once done
 * embeds the interactive prototype (served by /api/prototype/<id>/view, which sets
 * the correct content-type + a sandboxing CSP so it renders AND stays isolated).
 */
export function PrototypeBuildView({ runId, dealId, clientName }: { runId: string; dealId: string; clientName: string }) {
  const [data, setData] = useState<Status>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [approved, setApproved] = useState(false);
  const [isApproving, startApprove] = useTransition();
  const [comment, setComment] = useState("");
  const [isRefining, startRefine] = useTransition();
  const [refineError, setRefineError] = useState<string | null>(null);
  // Bumped when a refine starts so the poll loop (which stops at done) restarts to stream
  // the resumed round and the final done.
  const [pollNonce, setPollNonce] = useState(0);

  const done = data?.status === "done";
  const refining = data?.status === "refining";
  const errored = data?.status === "error";
  const refineUsed = data?.refineUsed ?? false;
  const canRefine = done && !refineUsed;
  const viewUrl = `/api/prototype/${runId}/view`;

  // The prototype is built for a 1440px desktop. Render the iframe at that true width
  // and scale it to fit the pane, so it reads as a real desktop view (just smaller)
  // instead of a broken, too-narrow layout. Re-measure on resize.
  const DESIGN_WIDTH = 1440;
  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!done) return;
    const el = previewRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / DESIGN_WIDTH));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [done]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const s = await getPrototypeRunStatus(runId);
      if (!alive) return;
      setData(s);
      if (s && (s.status === "done" || s.status === "error")) return; // stop polling
      setTimeout(tick, 4000);
    };
    tick();
    return () => {
      alive = false;
    };
  }, [runId, pollNonce]);

  const iters = data?.iterations ?? [];
  // Default selection follows the newest round while building; the user can pin one.
  const current = selected != null ? iters.find((i) => i.round === selected) : iters[iters.length - 1];

  return (
    <div className="h-screen w-screen flex flex-col bg-bitumen text-bone overflow-hidden">
      {/* Top bar */}
      <header className="shrink-0 h-14 px-5 flex items-center justify-between border-b border-graphite">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/pipeline/${dealId}`} className="text-[12px] text-bone-mute hover:text-bone shrink-0">
            ← Deal
          </Link>
          <span className="text-graphite">/</span>
          <span className="text-[13px] text-bone truncate">{clientName} · prototype</span>
          <span className={cn("ml-2 inline-flex items-center gap-1.5 text-[12px] shrink-0", errored ? "text-flag-red" : done ? "text-invoice-paid" : "text-track-gold")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", errored ? "bg-flag-red" : done ? "bg-invoice-paid" : "bg-track-gold animate-pulse")} />
            {errored ? "Build failed" : refining ? "Applying your note…" : done ? `Done · ${data?.finalScore ?? "—"}` : `Round ${iters.length || "…"} · building`}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {done && (
            <a href={viewUrl} target="_blank" rel="noreferrer" className="text-[12px] text-bone-mute hover:text-bone px-2">
              Open fullscreen ↗
            </a>
          )}
          <Button
            variant="primary"
            size="sm"
            disabled={!done || refining || isRefining || !data?.artifactId || isApproving || approved}
            onClick={() => startApprove(async () => { await approvePrototype(runId); setApproved(true); })}
          >
            {approved ? "Approved ✓" : isApproving ? "Approving…" : "Approve final"}
          </Button>
        </div>
      </header>

      {errored && (
        <div className="shrink-0 px-5 py-2 text-[12px] text-flag-red border-b border-graphite bg-flag-red/5">{data?.error}</div>
      )}

      {/* Main: rounds rail + the big preview/embed */}
      <div className="flex-1 flex min-h-0">
        <aside className="w-[200px] shrink-0 border-r border-graphite overflow-y-auto p-3 flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-wide text-bone-mute mb-1">Rounds</div>
          {iters.map((it) => (
            <div key={it.round} className="flex flex-col gap-1">
              <button
                onClick={() => setSelected(it.round)}
                className={cn(
                  "text-left px-2.5 py-2 rounded-[var(--radius-sm)] border text-[12px] flex items-center justify-between transition-colors",
                  current?.round === it.round ? "border-track-gold/50 bg-track-gold-dim/10 text-bone" : "border-graphite text-bone-mute hover:text-bone hover:border-bone-mute/40",
                )}
              >
                <span>Round {it.round}</span>
                <span className={badge(it.score)}>{it.score ?? "—"}</span>
              </button>
              {it.partnerComment && (
                <span className="px-1.5 text-[11px] text-bone-mute leading-snug">
                  <span className="text-track-gold">partner:</span> {it.partnerComment}
                </span>
              )}
            </div>
          ))}
          {!iters.length && <span className="text-[12px] text-bone-mute px-1">Waiting for round 1…</span>}
          {!done && !refining && !errored && iters.length > 0 && (
            <span className="text-[11px] text-track-gold px-1 mt-1 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-track-gold animate-pulse" /> improving…
            </span>
          )}
          {refining && (
            <span className="text-[11px] text-track-gold px-1 mt-1 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-track-gold animate-pulse" /> applying your note…
            </span>
          )}

          {/* Partner-refine: one comment → one resumed agent pass, then approve. Blank skips. */}
          {canRefine && (
            <div className="mt-3 pt-3 border-t border-graphite flex flex-col gap-2">
              <div className="text-[10px] uppercase tracking-wide text-bone-mute">Partner comments</div>
              <p className="text-[11px] text-bone-mute leading-snug">One round of changes, then approve. Or approve as-is.</p>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="e.g. Make the hero CTA gold and tighten the table spacing…"
                rows={4}
                className="w-full resize-y rounded-[var(--radius-sm)] border border-graphite bg-asphalt px-2 py-1.5 text-[12px] text-bone placeholder:text-bone-mute/60 focus:border-track-gold/50 focus:outline-none"
              />
              {refineError && <span className="text-[11px] text-flag-red">{refineError}</span>}
              <Button
                variant="secondary"
                size="sm"
                disabled={!comment.trim() || isRefining}
                onClick={() =>
                  startRefine(async () => {
                    setRefineError(null);
                    try {
                      await refinePrototype(runId, comment);
                      setComment("");
                      // Restart the poll loop (it stopped at done) to stream the resumed round → done.
                      setPollNonce((n) => n + 1);
                    } catch (err) {
                      setRefineError(err instanceof Error ? err.message : "Refine failed");
                    }
                  })
                }
              >
                {isRefining ? "Sending…" : "Refine once & finalize"}
              </Button>
            </div>
          )}
        </aside>

        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 bg-asphalt">
            {done && data?.finalHtmlUrl ? (
              // CSP on the served route sandboxes it (opaque origin); no iframe sandbox attr
              // so the prototype is fully interactive inline. Rendered at 1440px design width
              // and scaled to fit the pane → faithful desktop view.
              <div ref={previewRef} className="w-full h-full overflow-hidden bg-white">
                <iframe
                  title="Prototype"
                  src={viewUrl}
                  style={{
                    width: DESIGN_WIDTH,
                    height: `${100 / scale}%`,
                    border: 0,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                  }}
                  className="bg-white"
                />
              </div>
            ) : current?.screenshotUrl ? (
              <div className="w-full h-full overflow-auto grid place-items-start justify-center p-4">
                <img src={current.screenshotUrl} alt={`Round ${current.round}`} className="max-w-full rounded-[var(--radius)] border border-graphite shadow-lg" />
              </div>
            ) : (
              <div className="w-full h-full grid place-items-center text-[13px] text-bone-mute">
                {errored ? "No output." : "Building the first version…"}
              </div>
            )}
          </div>
          {current?.critique && (
            <div className="shrink-0 px-5 py-2.5 border-t border-graphite text-[12px] text-bone-mute">
              <span className="text-bone-dim">Round {current.round}:</span> {current.critique}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
