"use client";

// Team ledger — the money-OUT side. Consultant payouts grouped by client stage.
// Per payout: owed amount (editable), status (owed → paid → confirmed), pay
// method, and whether the client paid that stage first. Mark-paid / confirm /
// recompute call the payout actions. Warn-only on fronting money.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, RefreshCw, Clock, CircleCheck, TriangleAlert } from "lucide-react";
import { Card, CardHeader, CardBody, Input, Select, Badge, Button, EmptyState } from "@/components/ui";
import { formatCAD } from "@/lib/format";
import {
  recomputeAllPayouts,
  updatePayout,
  markPayoutPaid,
  markPayoutConfirmed,
} from "@/app/(app)/projects/[id]/payout-actions";
import { PayoutInvoiceLink, type PayoutLinkCandidate, type PayoutLinkState } from "@/components/billing/payout-invoice-link";

const money = (n: number) => formatCAD(n).replace("CA$", "$");

export type LedgerPayout = {
  id: string;
  consultantName: string;
  amount: number;
  status: "owed" | "paid" | "confirmed";
  method: string | null;
  clientPaidFirst: boolean | null;
  // Phase 2 cross-reference: the vendor invoice this payment is settled by, or an
  // MP's "no invoice required" reason. Either clears the missing-document flag.
  settledByBill: { vendor: string; number: string | null; driveUrl: string | null } | null;
  invoiceWaivedReason: string | null;
};

export type LedgerStage = {
  installmentId: string;
  label: string;
  amount: number;
  invoiceStatus: string | null;
  payouts: LedgerPayout[];
};

// Unlinked, non-void bills on THIS project a payout can be attached to.
export type ProjectBillOption = { id: string; vendor: string; number: string | null; amount: number; hasDoc: boolean };

const statusTone = { owed: "neutral", paid: "gold", confirmed: "steel" } as const;

export function TeamLedger({
  projectId,
  stages,
  canManage = false,
  projectBills = [],
}: {
  projectId: string;
  stages: LedgerStage[];
  canManage?: boolean;
  projectBills?: ProjectBillOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftAmount, setDraftAmount] = useState("");
  const [methodFor, setMethodFor] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const totalOwed = stages.flatMap((s) => s.payouts).filter((p) => p.status === "owed").reduce((s, p) => s + p.amount, 0);
  const totalPaid = stages.flatMap((s) => s.payouts).filter((p) => p.status !== "owed").reduce((s, p) => s + p.amount, 0);
  const hasAny = stages.some((s) => s.payouts.length > 0);

  // Every project bill is same-project for the attach picker.
  const candidates: PayoutLinkCandidate[] = projectBills.map((b) => ({ ...b, sameProject: true }));
  const linkState = (p: LedgerPayout): PayoutLinkState => ({
    payoutId: p.id,
    amount: p.amount,
    linked: p.settledByBill,
    waiverReason: p.invoiceWaivedReason,
  });

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
          <h2 className="title-md">Team payouts</h2>
          <span className="text-[11px] text-bone-mute">What we owe the team, per stage</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => run(() => recomputeAllPayouts(projectId))} disabled={isPending}>
          <RefreshCw size={13} strokeWidth={1.5} />
          Recompute
        </Button>
      </CardHeader>

      {!hasAny ? (
        <EmptyState
          title="No payouts yet"
          hint="Add economics lines tied to consultants, then recompute — payouts split across the billing stages."
          compact
        />
      ) : (
        <div className="flex flex-col">
          {stages.map((stage) => (
            <div key={stage.installmentId} className="border-t border-graphite/40 first:border-t-0">
              <div className="flex items-center justify-between px-5 py-2.5">
                <span className="text-[12px] text-bone-dim">
                  {stage.label} <span className="text-bone-mute">· {money(stage.amount)}</span>
                </span>
                {stage.invoiceStatus === "paid" ? (
                  <Badge tone="steel">client paid</Badge>
                ) : stage.invoiceStatus ? (
                  <Badge tone="gold">client {stage.invoiceStatus}</Badge>
                ) : (
                  <Badge tone="neutral">not invoiced</Badge>
                )}
              </div>
              {stage.payouts.length === 0 ? (
                <div className="px-5 pb-2.5 text-[11px] text-bone-mute">No payouts for this stage.</div>
              ) : (
                stage.payouts.map((p) => (
                  <div key={p.id} className="border-t border-graphite/30">
                  <div className="grid grid-cols-[1.3fr_110px_1fr_auto] gap-3 px-5 py-2.5 items-center">
                    <span className="text-[13px] text-bone truncate">{p.consultantName}</span>

                    {editingId === p.id ? (
                      <div className="flex items-center gap-1">
                        <Input type="number" min={0} value={draftAmount} autoFocus onChange={(e) => setDraftAmount(e.target.value)} className="h-7 text-[12px]" />
                        <button onClick={() => run(() => updatePayout(p.id, { amount: Number(draftAmount || 0) }), () => setEditingId(null))} disabled={isPending} className="text-track-gold hover:text-bone">
                          <Check size={14} strokeWidth={1.5} />
                        </button>
                      </div>
                    ) : (
                      <span className="mono text-[13px] text-bone tabular-nums flex items-center gap-1.5">
                        {money(p.amount)}
                        {p.status === "owed" && (
                          <button onClick={() => { setEditingId(p.id); setDraftAmount(String(p.amount)); }} className="text-bone-mute hover:text-track-gold" title="Edit amount">
                            <Pencil size={11} strokeWidth={1.5} />
                          </button>
                        )}
                      </span>
                    )}

                    <div className="flex items-center gap-2">
                      <Badge tone={statusTone[p.status]}>{p.status}</Badge>
                      {p.status !== "owed" && p.clientPaidFirst === false && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-signal-warming" title="Paid before the client paid this stage">
                          <TriangleAlert size={11} strokeWidth={1.5} /> fronted
                        </span>
                      )}
                      {p.status !== "owed" && p.method && <span className="text-[10px] text-bone-mute">{p.method}</span>}
                    </div>

                    <div className="flex items-center justify-end gap-1.5">
                      {p.status === "owed" && (
                        <>
                          <Select
                            value={methodFor[p.id] ?? "etransfer"}
                            onChange={(e) => setMethodFor((m) => ({ ...m, [p.id]: e.target.value }))}
                            className="h-7 text-[11px] w-[96px]"
                          >
                            <option value="etransfer">e-transfer</option>
                            <option value="wire">wire</option>
                            <option value="cheque">cheque</option>
                            <option value="other">other</option>
                          </Select>
                          <button
                            onClick={() => run(() => markPayoutPaid(p.id, { method: methodFor[p.id] ?? "etransfer" }))}
                            disabled={isPending}
                            className="inline-flex items-center gap-1 text-[11px] text-track-gold hover:text-bone disabled:opacity-40"
                            title="Mark paid"
                          >
                            <Clock size={12} strokeWidth={1.5} /> Pay
                          </button>
                        </>
                      )}
                      {p.status === "paid" && (
                        <button
                          onClick={() => run(() => markPayoutConfirmed(p.id))}
                          disabled={isPending}
                          className="inline-flex items-center gap-1 text-[11px] text-diagnostic-steel hover:text-bone disabled:opacity-40"
                          title="Confirm receipt"
                        >
                          <CircleCheck size={12} strokeWidth={1.5} /> Confirm
                        </button>
                      )}
                      {p.status === "confirmed" && <CircleCheck size={14} strokeWidth={1.5} className="text-diagnostic-steel" />}
                    </div>
                    </div>
                    {canManage && (p.status !== "owed" || p.settledByBill || p.invoiceWaivedReason) && (
                      <div className="px-5 pb-2.5 flex justify-end">
                        <PayoutInvoiceLink payout={linkState(p)} candidates={candidates} align="end" />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ))}

          <div className="flex items-center justify-between px-5 py-3 border-t border-graphite text-[12px]">
            <span className="text-bone-dim">Owed <span className="mono text-bone tabular-nums">{money(totalOwed)}</span></span>
            <span className="text-bone-dim">Paid out <span className="mono text-signal-fresh tabular-nums">{money(totalPaid)}</span></span>
          </div>
        </div>
      )}

      {error && <CardBody className="pt-0"><span className="text-[12px] text-flag-red">{error}</span></CardBody>}
    </Card>
  );
}
