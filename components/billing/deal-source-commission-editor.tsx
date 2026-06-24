"use client";

// Deal-source commission editor — who gets paid for sourcing this deal. Up to
// two payees, each a Partner OR a typed external referrer, each earning 1-10% of
// a chosen base (the build value, or the total 6/12-month value). Unlike the
// Origination editor (a partner-only pool that sums to 100), these are
// INDEPENDENT payees. Firm money — managing-partner gated at the page + action
// level. Read-only once the deal is signed (commission carries to the project).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, X, Trash2 } from "lucide-react";
import { Card, CardHeader, CardBody, Input, Select } from "@/components/ui";
import {
  addDealSourceCommission,
  deleteDealSourceCommission,
} from "@/app/(app)/pipeline/[id]/actions";

export type CommissionBaseValue = "deal_value" | "total_6mo" | "total_12mo";

export type DealCommissionRow = {
  id: string;
  partnerId: string | null;
  externalName: string | null;
  partnerName: string; // resolved label (partner name, external name, or —)
  pct: number;
  base: CommissionBaseValue;
  notes: string | null;
};

export type CommissionPartner = { id: string; name: string };

const BASE_LABELS: Record<CommissionBaseValue, string> = {
  deal_value: "Deal value (one-time build)",
  total_6mo: "6-month total",
  total_12mo: "12-month total",
};

export function DealSourceCommissionEditor({
  dealId,
  rows,
  partners,
  readOnly = false,
}: {
  dealId: string;
  rows: DealCommissionRow[];
  partners: CommissionPartner[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
          <h2 className="title-md">Deal-source commission</h2>
          <span className="text-[11px] text-bone-mute">Who gets paid for sourcing this · up to two payees</span>
        </div>
      </CardHeader>

      <CardBody className="flex flex-col gap-3 pt-0">
        {rows.length === 0 && !adding && (
          <p className="text-[11px] text-bone-mute">
            No commission set. Add a partner or an outside referrer who earns a cut for bringing in this deal.
          </p>
        )}

        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 py-1">
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] text-bone truncate">{r.partnerName}</span>
              <span className="text-[11px] text-bone-mute">{BASE_LABELS[r.base]}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="mono text-[12px] text-track-gold tabular-nums">{r.pct}%</span>
              {!readOnly && (
                <button
                  onClick={() => run(() => deleteDealSourceCommission(r.id))}
                  disabled={isPending}
                  className="text-bone-mute hover:text-flag-red disabled:opacity-40"
                  title="Remove"
                >
                  <Trash2 size={13} strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>
        ))}

        {!readOnly ? (
          <>
            {!adding && rows.length < 2 && (
              <div>
                <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-[12px] text-track-gold hover:text-bone">
                  <Plus size={12} strokeWidth={1.5} /> Add payee
                </button>
              </div>
            )}

            {adding && (
              <CommissionForm
                partners={partners}
                isPending={isPending}
                onCancel={() => setAdding(false)}
                onSubmit={(v) => run(() => addDealSourceCommission(dealId, v), () => setAdding(false))}
              />
            )}

            <p className="text-[11px] text-bone-mute">
              6- and 12-month bases apply only if this deal converts to a subscription. On convert the commission carries to
              the project, and a subscription also tracks it month by month on a service contract.
            </p>
          </>
        ) : (
          <p className="text-[11px] text-bone-mute">Signed — commission carried to the project and service contract.</p>
        )}

        {error && <span className="text-[12px] text-flag-red">{error}</span>}
      </CardBody>
    </Card>
  );
}

function CommissionForm({
  partners,
  isPending,
  onCancel,
  onSubmit,
}: {
  partners: CommissionPartner[];
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (v: { partnerId?: string; externalName?: string; pct: number; base: CommissionBaseValue }) => void;
}) {
  const [payeeKind, setPayeeKind] = useState<"partner" | "external">("partner");
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? "");
  const [externalName, setExternalName] = useState("");
  const [pct, setPct] = useState("5");
  const [base, setBase] = useState<CommissionBaseValue>("deal_value");

  const canSubmit = payeeKind === "partner" ? !!partnerId : !!externalName.trim();

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      partnerId: payeeKind === "partner" ? partnerId : undefined,
      externalName: payeeKind === "external" ? externalName.trim() : undefined,
      pct: Number(pct || 0),
      base,
    });
  }

  return (
    <div className="flex flex-col gap-2 p-3 border border-graphite rounded-[var(--radius)]">
      <div className="flex items-center gap-1">
        {(["partner", "external"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setPayeeKind(k)}
            className={`px-2.5 py-1 border text-[11px] rounded-[var(--radius-pill)] transition-colors ${
              payeeKind === k
                ? "border-track-gold/40 text-track-gold bg-track-gold-dim/10"
                : "border-graphite-2 text-bone-mute hover:text-bone-dim"
            }`}
          >
            {k === "partner" ? "Partner" : "External"}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {payeeKind === "partner" ? (
          <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="h-8 text-[13px] flex-1">
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            value={externalName}
            onChange={(e) => setExternalName(e.target.value)}
            placeholder="External referrer name"
            className="h-8 text-[13px] flex-1"
          />
        )}
        <Input
          type="number"
          min={1}
          max={10}
          step="0.5"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          className="h-8 text-[13px] w-16"
          title="Commission % (1-10)"
        />
      </div>

      <div className="flex items-center gap-2">
        <Select value={base} onChange={(e) => setBase(e.target.value as CommissionBaseValue)} className="h-8 text-[13px] flex-1">
          {(Object.keys(BASE_LABELS) as CommissionBaseValue[]).map((b) => (
            <option key={b} value={b}>
              {BASE_LABELS[b]}
            </option>
          ))}
        </Select>
        <button
          onClick={submit}
          disabled={isPending || !canSubmit}
          className="inline-flex items-center gap-1 text-[12px] text-track-gold hover:text-bone disabled:opacity-40"
          title="Save"
        >
          <Check size={14} strokeWidth={1.5} />
        </button>
        <button onClick={onCancel} disabled={isPending} className="inline-flex items-center gap-1 text-[12px] text-bone-mute hover:text-bone">
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
