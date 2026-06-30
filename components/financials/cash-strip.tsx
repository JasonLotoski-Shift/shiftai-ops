"use client";

// Phase 2 — the persistent cash-position strip (rebuild §3.1). Five always-visible
// numbers seeded by the firm-entered opening balance: cash on hand, coming in 30d,
// going out 30d, projected close 30d (red on a shortfall, with the date cover runs
// out), and runway. MP-only (the page gates the render; setOpeningBalance re-checks
// server-side). The "Set balance" form writes the opening anchor the strip carries
// forward. Replaces the misleading "Net position = AR − AP" KPI with a true position.

import { useState, useTransition } from "react";
import { Button, Card, Input, Label } from "@/components/ui";
import { formatCAD, formatDate } from "@/lib/format";
import { setOpeningBalance } from "@/app/(app)/financials/cash-actions";
import type { CashPosition } from "@/lib/billing/cashflow";
import type { OpeningMeta } from "@/app/(app)/financials/cash-data";

const cad = (n: number) => formatCAD(n).replace("CA$", "$");

function runwayLabel(m: number | null): string {
  if (m == null) return "∞";
  if (m > 60) return ">60 mo";
  return `${Math.round(m)} mo`;
}

type Cell = { label: string; value: string; sub: string | null; tone: "bone" | "gold" | "red" | "mute" };

export function CashStrip({
  opening,
  cashOnHand,
  position,
  todayISO,
}: {
  opening: OpeningMeta | null;
  cashOnHand: number | null;
  position: CashPosition;
  todayISO: string; // yyyy-mm-dd default for the as-of field
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(opening ? String(opening.amount) : "");
  const [asOf, setAsOf] = useState(opening ? opening.asOf.slice(0, 10) : todayISO);
  const [label, setLabel] = useState(opening?.label ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      const n = Number(amount.replace(/[, $]/g, ""));
      if (!Number.isFinite(n)) {
        setError("Enter a dollar amount");
        return;
      }
      try {
        await setOpeningBalance({ amount: n, asOf: new Date(asOf).toISOString(), label: label || null });
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });

  const noOpening = cashOnHand == null;
  const cells: Cell[] = [
    {
      label: "Cash on hand",
      value: noOpening ? "—" : cad(cashOnHand),
      sub: opening ? `as of ${formatDate(opening.asOf)}${opening.stale ? " · stale" : ""}` : "set an opening balance",
      tone: noOpening ? "mute" : "gold",
    },
    { label: "Coming in · 30d", value: cad(position.comingIn30), sub: "committed", tone: "bone" },
    { label: "Going out · 30d", value: cad(position.goingOut30), sub: "committed", tone: "bone" },
    {
      label: "Projected close · 30d",
      value: noOpening ? "—" : cad(position.projectedClose30),
      sub:
        position.shortfallDate && !noOpening
          ? `cover runs out ${formatDate(position.shortfallDate)}`
          : "on-hand + in − out",
      tone: !noOpening && position.projectedClose30 < 0 ? "red" : noOpening ? "mute" : "bone",
    },
    {
      label: "Runway",
      value: noOpening ? "—" : runwayLabel(position.runwayMonths),
      sub: position.runwayMonths == null ? "cash-flow positive" : "at avg net outflow",
      tone: noOpening ? "mute" : position.runwayMonths != null && position.runwayMonths < 3 ? "red" : "bone",
    },
  ];

  const toneClass: Record<Cell["tone"], string> = {
    bone: "text-bone",
    gold: "text-track-gold",
    red: "text-flag-red",
    mute: "text-bone-mute",
  };

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="title-md">Cash position</h2>
          <span className="text-[11px] text-bone-mute">
            {noOpening
              ? "Enter the firm bank balance to carry it forward into a true position."
              : "Live position from the deduped ledger plus committed obligations."}
          </span>
        </div>
        <Button variant={noOpening ? "primary" : "ghost"} size="sm" onClick={() => setEditing((v) => !v)} disabled={pending}>
          {editing ? "Cancel" : opening ? "Update balance" : "Set balance"}
        </Button>
      </div>

      {editing && (
        <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-graphite/60 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Bank balance (CAD)</Label>
              <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 42000" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>As of</Label>
              <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Label (optional)</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Operating account" />
            </div>
          </div>
          {error && <span className="text-[12px] text-flag-red">{error}</span>}
          <div className="flex items-center gap-2 self-end">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save balance"}
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cells.map((c) => (
          <div key={c.label} className="flex flex-col gap-1.5 rounded-[var(--radius)] bg-asphalt/40 px-4 py-3.5">
            <Label>{c.label}</Label>
            <span className={`font-mono font-medium tabular-nums text-[22px] leading-none ${toneClass[c.tone]}`}>{c.value}</span>
            {c.sub && <span className="text-[11px] text-bone-mute">{c.sub}</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}
