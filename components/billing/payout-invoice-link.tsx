"use client";

// PayoutInvoiceLink — the attach-invoice / "no invoice required" control for a
// contractor payout. Shared by the Financials Ledger "needs a document" worklist
// and the project Team Ledger. A payout's missing-invoice flag clears the moment
// an MP attaches the vendor bill that documents it, OR marks it as legitimately
// needing none (with a reason). Managing partners only — the three server actions
// are requireManagingPartner()-gated and this control renders only where canManage.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, Ban, ExternalLink, X, Check } from "lucide-react";
import { Badge, Button, Select, Input } from "@/components/ui";
import { formatCAD } from "@/lib/format";
import { linkPayoutToBill, unlinkPayoutBill, waivePayoutInvoice } from "@/app/(app)/financials/finance-actions";

const cad = (n: number) => formatCAD(n).replace("CA$", "$");

// An unlinked Bill a payout could be attached to.
export type PayoutLinkCandidate = {
  id: string; // Bill id
  vendor: string;
  number: string | null;
  amount: number; // whole CAD
  sameProject: boolean;
  hasDoc: boolean;
};

export type PayoutLinkState = {
  payoutId: string;
  amount: number; // payout amount (for amount-match hinting)
  linked: { vendor: string; number: string | null; driveUrl: string | null } | null;
  waiverReason: string | null;
};

export function PayoutInvoiceLink({
  payout,
  candidates,
  align = "start",
}: {
  payout: PayoutLinkState;
  candidates: PayoutLinkCandidate[];
  align?: "start" | "end";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"idle" | "attach" | "waive">("idle");
  const [billId, setBillId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Most-likely invoices first: same project + exact amount, then same project,
  // then exact amount, then the rest. Linking is NOT restricted to these (a lump
  // invoice may differ in amount) — they are only ordered to the top.
  const ordered = useMemo(() => {
    const score = (b: PayoutLinkCandidate) => (b.sameProject ? 2 : 0) + (b.amount === payout.amount ? 1 : 0);
    return [...candidates].sort((a, b) => score(b) - score(a));
  }, [candidates, payout.amount]);

  function run(fn: () => Promise<unknown>, onDone?: () => void) {
    setError(null);
    start(async () => {
      try {
        await fn();
        onDone?.();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const wrap = `flex flex-col gap-1.5 ${align === "end" ? "items-end" : "items-start"}`;

  // Linked → show the invoice + a detach.
  if (payout.linked) {
    const { vendor, number, driveUrl } = payout.linked;
    return (
      <div className={wrap}>
        <span className="flex items-center gap-1.5">
          <Badge tone="steel" title="Settled by this invoice">
            <Link2 size={11} strokeWidth={1.5} className="inline -mt-px mr-1" />
            {vendor}{number ? ` · ${number}` : ""}
          </Badge>
          {driveUrl ? (
            <a href={driveUrl} target="_blank" rel="noreferrer" className="text-bone-mute hover:text-track-gold" title="Open invoice">
              <ExternalLink size={12} strokeWidth={1.5} />
            </a>
          ) : (
            <span className="text-[10px] text-signal-warming" title="Linked, but no PDF on file yet">no PDF</span>
          )}
          <button onClick={() => run(() => unlinkPayoutBill(payout.payoutId))} disabled={pending} className="text-bone-mute hover:text-flag-red disabled:opacity-40" title="Detach invoice">
            <X size={12} strokeWidth={1.5} />
          </button>
        </span>
        {error && <span className="text-[11px] text-flag-red">{error}</span>}
      </div>
    );
  }

  // Waived → show the reason + undo.
  if (payout.waiverReason) {
    return (
      <div className={wrap}>
        <span className="flex items-center gap-1.5">
          <Badge tone="bone" title={payout.waiverReason}>
            <Ban size={11} strokeWidth={1.5} className="inline -mt-px mr-1" />
            No invoice required
          </Badge>
          <button onClick={() => run(() => waivePayoutInvoice(payout.payoutId, null))} disabled={pending} className="text-bone-mute hover:text-track-gold disabled:opacity-40" title="Undo — flag again">
            <X size={12} strokeWidth={1.5} />
          </button>
        </span>
        <span className="text-[10px] text-bone-mute truncate max-w-[220px]" title={payout.waiverReason}>{payout.waiverReason}</span>
        {error && <span className="text-[11px] text-flag-red">{error}</span>}
      </div>
    );
  }

  // Missing → attach an invoice or waive it.
  return (
    <div className={wrap}>
      {mode === "idle" && (
        <span className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setMode("attach"); setBillId(ordered[0]?.id ?? ""); }} disabled={pending}>
            <Link2 size={12} strokeWidth={1.5} /> Attach invoice
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode("waive")} disabled={pending}>
            No invoice needed
          </Button>
        </span>
      )}

      {mode === "attach" &&
        (ordered.length === 0 ? (
          <span className="flex items-center gap-2 text-[11px] text-bone-mute">
            No unlinked invoices — file the vendor bill on the AP / AR tab first.
            <button onClick={() => setMode("idle")} className="text-bone-mute hover:text-bone" title="Cancel">
              <X size={12} strokeWidth={1.5} />
            </button>
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Select value={billId} onChange={(e) => setBillId(e.target.value)} className="h-7 text-[11px] w-[230px]">
              {ordered.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.vendor}{b.number ? ` · ${b.number}` : ""} · {cad(b.amount)}{b.amount === payout.amount ? " ✓" : ""}{b.sameProject ? "" : " · other project"}
                </option>
              ))}
            </Select>
            <button onClick={() => billId && run(() => linkPayoutToBill(payout.payoutId, billId), () => setMode("idle"))} disabled={pending || !billId} className="text-track-gold hover:text-bone disabled:opacity-40" title="Link invoice">
              <Check size={14} strokeWidth={1.5} />
            </button>
            <button onClick={() => setMode("idle")} className="text-bone-mute hover:text-bone" title="Cancel">
              <X size={13} strokeWidth={1.5} />
            </button>
          </span>
        ))}

      {mode === "waive" && (
        <span className="flex items-center gap-1.5">
          <Input value={reason} autoFocus placeholder="Reason (e.g. informal e-transfer)" onChange={(e) => setReason(e.target.value)} className="h-7 text-[11px] w-[230px]" />
          <button onClick={() => run(() => waivePayoutInvoice(payout.payoutId, reason), () => { setMode("idle"); setReason(""); })} disabled={pending || !reason.trim()} className="text-track-gold hover:text-bone disabled:opacity-40" title="Save reason">
            <Check size={14} strokeWidth={1.5} />
          </button>
          <button onClick={() => { setMode("idle"); setReason(""); }} className="text-bone-mute hover:text-bone" title="Cancel">
            <X size={13} strokeWidth={1.5} />
          </button>
        </span>
      )}

      {error && <span className="text-[11px] text-flag-red">{error}</span>}
    </div>
  );
}
