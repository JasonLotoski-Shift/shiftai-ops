"use client";

// Origination / commission editor (Phase 2) + project billing settings.
//
// Top: billing settings — commission % (originationPct), first-contract toggle
// (drives whether origination pays out), and schedule type. Below: 1–2
// origination attributees and their share of the commission pool (shares sum to
// 100). Empty = brand/referral origin → the slot rolls to the firm pool.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, X, Trash2 } from "lucide-react";
import { Card, CardHeader, CardBody, Input, Select, Button } from "@/components/ui";
import {
  addOrigination,
  updateOrigination,
  deleteOrigination,
  setProjectBillingMeta,
} from "@/app/(app)/projects/[id]/billing-actions";

export type OriginationRow = { id: string; partnerId: string; partnerName: string; sharePct: number; notes: string | null };
export type OriginationPartner = { id: string; name: string };

const SCHEDULE_LABELS: Record<string, string> = {
  fifty_twenty_five: "50 / 25 / 25 (pilots & projects)",
  monthly_even: "Monthly even (retainers)",
  custom: "Custom (leave my schedule alone)",
};

export function OriginationEditor({
  projectId,
  originationPct,
  isFirstContract,
  scheduleType,
  rows,
  partners,
}: {
  projectId: string;
  originationPct: number;
  isFirstContract: boolean;
  scheduleType: string;
  rows: OriginationRow[];
  partners: OriginationPartner[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [pct, setPct] = useState(String(originationPct));
  const totalShare = rows.reduce((s, r) => s + r.sharePct, 0);

  function run(fn: () => Promise<unknown>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        onDone?.();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="title-md">Commission &amp; billing settings</h2>
          <span className="text-[11px] text-bone-mute">Origination on the first contract · how the schedule is built</span>
        </div>
      </CardHeader>

      <CardBody className="flex flex-col gap-4 pt-0">
        {/* Settings row */}
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="label text-[10px]">Commission %</span>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              onBlur={() => run(() => setProjectBillingMeta(projectId, { originationPct: Number(pct || 0) }))}
              className="h-8 text-[13px]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label text-[10px]">Contract</span>
            <Select
              value={isFirstContract ? "first" : "subsequent"}
              onChange={(e) => run(() => setProjectBillingMeta(projectId, { isFirstContract: e.target.value === "first" }))}
              className="h-8 text-[13px]"
            >
              <option value="first">First for client</option>
              <option value="subsequent">Retainer / subsequent</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="label text-[10px]">Schedule</span>
            <Select
              value={scheduleType}
              onChange={(e) => run(() => setProjectBillingMeta(projectId, { scheduleType: e.target.value }))}
              className="h-8 text-[13px]"
            >
              {Object.entries(SCHEDULE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </label>
        </div>

        {!isFirstContract && (
          <p className="text-[11px] text-bone-mute">
            Not the first contract — the commission slot rolls into the firm pool and no origination is paid out.
          </p>
        )}

        {/* Attributees */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="label text-[10px]">Attributed to {rows.length > 0 && `· ${totalShare}% allocated`}</span>
            {!adding && rows.length < 2 && (
              <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-[12px] text-track-gold hover:text-bone">
                <Plus size={12} strokeWidth={1.5} /> Add person
              </button>
            )}
          </div>

          {rows.length === 0 && !adding && (
            <p className="text-[11px] text-bone-mute">No one attributed — brand / referral origin (slot rolls to firm pool).</p>
          )}

          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 py-1">
              <span className="text-[13px] text-bone">{r.partnerName}</span>
              <div className="flex items-center gap-3">
                <span className="mono text-[12px] text-track-gold tabular-nums">{r.sharePct}%</span>
                <button onClick={() => run(() => deleteOrigination(r.id))} disabled={isPending} className="text-bone-mute hover:text-flag-red disabled:opacity-40" title="Remove">
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}

          {adding && (
            <OriginationForm
              partners={partners.filter((p) => !rows.some((r) => r.partnerId === p.id))}
              defaultShare={rows.length === 0 ? 100 : Math.max(0, 100 - totalShare)}
              isPending={isPending}
              onCancel={() => setAdding(false)}
              onSubmit={(v) => run(() => addOrigination(projectId, v), () => setAdding(false))}
            />
          )}
        </div>

        {error && <span className="text-[12px] text-flag-red">{error}</span>}
      </CardBody>
    </Card>
  );
}

function OriginationForm({
  partners,
  defaultShare,
  isPending,
  onCancel,
  onSubmit,
}: {
  partners: OriginationPartner[];
  defaultShare: number;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (v: { partnerId: string; sharePct: number; notes?: string | null }) => void;
}) {
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? "");
  const [share, setShare] = useState(String(defaultShare));

  return (
    <div className="flex items-center gap-2">
      <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="h-8 text-[13px] flex-1">
        {partners.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </Select>
      <Input type="number" min={0} max={100} step="1" value={share} onChange={(e) => setShare(e.target.value)} className="h-8 text-[13px] w-20" />
      <button
        onClick={() => partnerId && onSubmit({ partnerId, sharePct: Number(share || 0) })}
        disabled={isPending || !partnerId}
        className="inline-flex items-center gap-1 text-[12px] text-track-gold hover:text-bone disabled:opacity-40"
      >
        <Check size={14} strokeWidth={1.5} />
      </button>
      <button onClick={onCancel} disabled={isPending} className="inline-flex items-center gap-1 text-[12px] text-bone-mute hover:text-bone">
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
