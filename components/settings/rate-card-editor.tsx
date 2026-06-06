"use client";

// Rate-card editor (firm Settings). The four standard tiers and their bill/pay
// rates ($/hr) — the firm defaults that seed every estimate + project economics
// line. Edits save on blur and are audited. Margin per tier is shown live.
//
// Rates are stored in CENTS; this edits in dollars and converts on save.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody, Input } from "@/components/ui";
import { updateRateTier } from "@/app/(app)/settings/actions";

type Tier = { id: string; key: string; name: string; billRateCents: number; payRateCents: number; active: boolean };

const toDollars = (cents: number) => String(cents / 100);

export function RateCardEditor({ tiers }: { tiers: Tier[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [vals, setVals] = useState<Record<string, { bill: string; pay: string }>>(() =>
    Object.fromEntries(tiers.map((t) => [t.id, { bill: toDollars(t.billRateCents), pay: toDollars(t.payRateCents) }])),
  );

  function setField(tierId: string, field: "bill" | "pay", value: string) {
    setVals((v) => ({ ...v, [tierId]: { ...v[tierId], [field]: value } }));
  }

  function save(tierId: string, field: "bill" | "pay") {
    setError(null);
    const raw = vals[tierId]?.[field] ?? "0";
    const cents = Math.round(Number(raw || 0) * 100);
    startTransition(async () => {
      try {
        await updateRateTier(tierId, field === "bill" ? { billRateCents: cents } : { payRateCents: cents });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save the rate");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-0.5">
        <h2 className="title-md">Rate card</h2>
        <span className="text-[11px] text-bone-mute">
          Firm standard tiers · seed every estimate and project. Editing here changes the defaults going forward.
        </span>
      </CardHeader>
      <CardBody className="flex flex-col gap-1 pt-0">
        <div className="grid grid-cols-[1.4fr_120px_120px_80px] gap-3 px-1 pb-1">
          <span className="text-[11px] text-bone-dim">Tier</span>
          <span className="text-[11px] text-bone-dim text-right">Bill $/hr</span>
          <span className="text-[11px] text-bone-dim text-right">Pay $/hr</span>
          <span className="text-[11px] text-bone-dim text-right">Margin</span>
        </div>
        {tiers.map((t) => {
          const bill = Number(vals[t.id]?.bill) || 0;
          const pay = Number(vals[t.id]?.pay) || 0;
          const margin = bill > 0 ? Math.round((1 - pay / bill) * 100) : 0;
          return (
            <div key={t.id} className="grid grid-cols-[1.4fr_120px_120px_80px] gap-3 items-center px-1 py-1.5 border-t border-graphite/40">
              <span className="text-[13px] text-bone">{t.name}</span>
              <Input
                type="number"
                min={0}
                step="0.5"
                className="h-8 text-[13px] text-right tabular-nums"
                value={vals[t.id]?.bill ?? ""}
                onChange={(e) => setField(t.id, "bill", e.target.value)}
                onBlur={() => save(t.id, "bill")}
              />
              <Input
                type="number"
                min={0}
                step="0.5"
                className="h-8 text-[13px] text-right tabular-nums"
                value={vals[t.id]?.pay ?? ""}
                onChange={(e) => setField(t.id, "pay", e.target.value)}
                onBlur={() => save(t.id, "pay")}
              />
              <span className="mono text-[12px] text-bone-dim tabular-nums text-right">{margin}%</span>
            </div>
          );
        })}
        {error && <span className="text-[12px] text-flag-red pt-2">{error}</span>}
      </CardBody>
    </Card>
  );
}
