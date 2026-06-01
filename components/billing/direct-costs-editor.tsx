"use client";

// Direct costs editor — pass-through costs (travel, SaaS, third-party tools)
// billed to the client AT COST. They add to the client price but carry no
// origination / firm-pool split / margin. Mirrors the economics-editor add/edit
// pattern. Self-contained Card for the project Financials tab.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Check, X, Trash2 } from "lucide-react";
import { Card, CardHeader, CardBody, Input, Button, EmptyState } from "@/components/ui";
import { formatCAD } from "@/lib/format";
import {
  createDirectCost,
  updateDirectCost,
  deleteDirectCost,
} from "@/app/(app)/projects/[id]/billing-actions";

export type DirectCostRow = { id: string; label: string; amount: number; notes: string | null };

const money = (n: number) => formatCAD(n).replace("CA$", "$");

export function DirectCostsEditor({
  projectId,
  costs,
}: {
  projectId: string;
  costs: DirectCostRow[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const total = costs.reduce((s, c) => s + c.amount, 0);

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
          <h2 className="title-md">Direct costs</h2>
          <span className="text-[11px] text-bone-mute">Pass-through, billed at cost — no margin, no split</span>
        </div>
        {!adding && (
          <Button variant="ghost" size="sm" onClick={() => { setAdding(true); setEditingId(null); }}>
            <Plus size={13} strokeWidth={1.5} />
            Add cost
          </Button>
        )}
      </CardHeader>

      {adding && (
        <div className="px-5 pb-3">
          <CostForm
            isPending={isPending}
            onCancel={() => setAdding(false)}
            onSubmit={(v) => run(() => createDirectCost(projectId, v), () => setAdding(false))}
          />
        </div>
      )}

      {costs.length === 0 && !adding ? (
        <EmptyState title="No direct costs" hint="Travel, client SaaS, third-party tools — billed straight through at cost." compact />
      ) : (
        <div className="flex flex-col">
          {costs.map((c) =>
            editingId === c.id ? (
              <div key={c.id} className="px-5 py-3 border-t border-graphite/40">
                <CostForm
                  initial={c}
                  isPending={isPending}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(v) => run(() => updateDirectCost(c.id, v), () => setEditingId(null))}
                />
              </div>
            ) : (
              <div key={c.id} className="grid grid-cols-[1.6fr_120px_64px] gap-2 px-5 py-2.5 border-t border-graphite/40 items-center">
                <span className="text-[13px] text-bone truncate">
                  {c.label}
                  {c.notes && <span className="text-[11px] text-bone-mute"> · {c.notes}</span>}
                </span>
                <span className="mono text-[12px] text-bone-dim tabular-nums text-right">{money(c.amount)}</span>
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={() => { setEditingId(c.id); setAdding(false); }} className="text-bone-mute hover:text-track-gold" title="Edit">
                    <Pencil size={13} strokeWidth={1.5} />
                  </button>
                  <button onClick={() => run(() => deleteDirectCost(c.id))} disabled={isPending} className="text-bone-mute hover:text-flag-red disabled:opacity-40" title="Delete">
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            ),
          )}
          <div className="grid grid-cols-[1.6fr_120px_64px] gap-2 px-5 py-3 border-t border-graphite items-center">
            <span className="text-[12px] text-bone-dim">Total direct costs</span>
            <span className="mono text-[13px] text-bone tabular-nums text-right">{money(total)}</span>
            <span />
          </div>
        </div>
      )}

      {error && <CardBody className="pt-0"><span className="text-[12px] text-flag-red">{error}</span></CardBody>}
    </Card>
  );
}

type CostFormValue = { label: string; amount: number; notes?: string | null };

function CostForm({
  initial,
  isPending,
  onCancel,
  onSubmit,
}: {
  initial?: DirectCostRow;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (v: CostFormValue) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-[1.6fr_120px] gap-2">
        <Input placeholder="Label (e.g. Travel — on-site)" value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 text-[13px]" />
        <Input type="number" min={0} step="1" placeholder="$ at cost" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8 text-[13px]" />
      </div>
      <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-8 text-[13px]" />
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => onSubmit({ label, amount: Number(amount || 0), notes: notes.trim() || null })}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 text-[12px] text-track-gold hover:text-bone disabled:opacity-40"
        >
          <Check size={14} strokeWidth={1.5} />
          {initial ? "Save" : "Add"}
        </button>
        <button onClick={onCancel} disabled={isPending} className="inline-flex items-center gap-1.5 text-[12px] text-bone-mute hover:text-bone">
          <X size={14} strokeWidth={1.5} />
          Cancel
        </button>
      </div>
    </div>
  );
}
