"use client";

// Phase 0 integrity control — the one button that runs run-full-snapshot and
// renders its verification summary inline (table -> rows + dollar total, plus the
// frozen deduped cash figures and a link to the Drive folder). MP-only: the
// parent page gates the render, and runFullSnapshot re-checks server-side.

import { Fragment, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { formatCAD } from "@/lib/format";
import { runFullSnapshot, type RunSnapshotResult } from "@/app/(app)/financials/snapshot-actions";

const cad = (n: number) => formatCAD(n).replace("CA$", "$");

export function SnapshotButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<RunSnapshotResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () =>
    start(async () => {
      setError(null);
      try {
        setResult(await runFullSnapshot());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Snapshot failed");
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="title-md">Pre-rebuild snapshot</h2>
          <span className="text-[11px] text-bone-mute">
            Freezes every money table to Drive before the Financials rebuild. Read-only, safe to re-run.
          </span>
        </div>
        <Button onClick={run} disabled={pending}>
          {pending ? "Saving…" : "Save snapshot"}
        </Button>
      </div>

      {error && <span className="text-[12px] text-flag-red">{error}</span>}

      {result && (
        <div className="flex flex-col gap-3">
          <a
            href={result.folderUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-track-gold hover:underline self-start"
          >
            Open snapshot folder in Drive →
          </a>
          <div className="grid grid-cols-[1fr_70px_130px] gap-x-4 gap-y-1 text-[12px]">
            <span className="text-[11px] text-bone-dim">Table</span>
            <span className="text-[11px] text-bone-dim text-right">Rows</span>
            <span className="text-[11px] text-bone-dim text-right">Dollar total</span>
            {result.summary.tables.map((t) => (
              <Fragment key={t.key}>
                <span className="text-bone truncate">{t.table}</span>
                <span className="mono text-bone-dim text-right tabular-nums">{t.rows}</span>
                <span className="mono text-bone-dim text-right tabular-nums">
                  {t.dollarTotal == null ? "—" : cad(t.dollarTotal)}
                </span>
              </Fragment>
            ))}
          </div>
          {result.summary.firmWide && (
            <span className="text-[11px] text-bone-mute">
              Frozen deduped money-out {cad(result.summary.firmWide.cashOut)} · received{" "}
              {cad(result.summary.firmWide.receivedIn)} · outstanding AR {cad(result.summary.firmWide.outstandingIn)}.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
