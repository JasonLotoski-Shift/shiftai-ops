"use client";

// Green (financial) lane review card — Phase 3 of the ingest 3-lane redesign.
//
// Owns every financial-lane proposal end to end, whichever source it arrived from:
// a Gmail finance-label email (attachment + bill already filed at poll time) OR a
// dropped/pasted invoice through the composer (filed at ingest by
// extractFinanceFromComposer). Both store the SAME v1 finance shape
// (financeType / payer / bill / ar / attachment), so this one card reads it.
//
// What it does that the legacy ProposalCard finance branch did not:
//  - inline PDF/image preview of the filed document,
//  - editable + confirmable bill fields (vendor / amount / currency / # / due),
//  - a project picker that can re-point the bill or set it firm-level (no project),
//  - a roster payer (partners + consultants) for reimbursements.
// It still proposes-never-auto-writes: a finance action is the only path to a Bill
// / Expense / paid Invoice, and each clears the item.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Receipt,
  ChevronDown,
  ChevronRight,
  X,
  Link2,
  CircleAlert,
  ShieldAlert,
  Info,
  ExternalLink,
} from "lucide-react";
import { Card, Badge, Button, Input, Label, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/format";
import { convertToCad } from "@/lib/finance";
import {
  createBillFromProposal,
  createExpenseFromProposal,
  reconcileInvoiceFromProposal,
  rejectProposal,
  type ExtractedProposal,
  type FinanceType,
} from "@/app/(app)/ingest/actions";
import type { ProposalProp, IngestPayoutOption } from "@/components/ingest-view";

const SOURCE_LABEL: Record<string, string> = { paste: "Pasted", fireflies: "Fireflies", drop: "Dropped file", gmail: "Gmail" };

// A small hover (i) explaining a finance action (native title tooltip).
function FinanceTip({ text }: { text: string }) {
  return (
    <span title={text} aria-label={text} tabIndex={0} className="text-bone-mute hover:text-[var(--color-lane-green)] cursor-help">
      <Info size={13} strokeWidth={1.5} />
    </span>
  );
}

type Attachment = { driveUrl?: string | null; driveFileId?: string | null; fileName?: string | null };

export default function FinancialProposalCard({
  p,
  open,
  onToggle,
  partners,
  consultants,
  projects,
  canLinkPayouts = false,
  payoutOptions = [],
}: {
  p: ProposalProp;
  open: boolean;
  onToggle: () => void;
  partners: { id: string; name: string }[];
  consultants: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  currentPartnerId?: string;
  canLinkPayouts?: boolean;
  payoutOptions?: IngestPayoutOption[];
}) {
  const router = useRouter();
  const prop = p.proposal as ExtractedProposal & { attachment?: Attachment | null };

  const financeType: FinanceType =
    prop.financeType ?? (prop.billCandidate ? "ap_bill" : prop.arCandidate ? "ar_payment" : "none");
  const isAr = financeType === "ar_payment";

  // Editable, confirmable bill fields — pre-filled from the detected values. The
  // partner corrects them before filing (handles imperfect extraction); for a
  // link-only email the amount starts blank for them to complete.
  const [vendor, setVendor] = useState(prop.bill?.vendor ?? "");
  const [amount, setAmount] = useState(prop.bill?.amount ? String(prop.bill.amount) : "");
  const [currency, setCurrency] = useState(prop.bill?.currency ?? "CAD");
  const [invoiceNumber, setInvoiceNumber] = useState(prop.bill?.invoiceNumber ?? "");
  const [dueDate, setDueDate] = useState(prop.bill?.dueDate ?? "");

  // Project: "" = firm-level (no project) — a valid firm-overhead state. Pre-filled
  // from whatever the source matched.
  const [projectId, setProjectId] = useState(p.matchedProjectId ?? "");
  const projectUnchanged = (p.matchedProjectId ?? "") === projectId;

  // Reimburse payer (partner OR consultant), encoded "p:<id>" / "c:<id>". Pre-select
  // only on a confident name match; else leave empty so money is never mis-attributed.
  const defaultPayer = (() => {
    const name = (prop.payer ?? "").toLowerCase().trim();
    if (!name) return "";
    const first = name.split(" ")[0];
    const hit = (list: { id: string; name: string }[]) =>
      list.find((x) => x.name.toLowerCase().includes(name) || (first && x.name.toLowerCase().includes(first)));
    const c = hit(consultants);
    if (c) return `c:${c.id}`;
    const pt = hit(partners);
    if (pt) return `p:${pt.id}`;
    return "";
  })();
  const [payerSel, setPayerSel] = useState(defaultPayer);

  const [linkPayoutIds, setLinkPayoutIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const att = prop.attachment ?? null;
  const previewUrl = att?.driveFileId ? `https://drive.google.com/file/d/${att.driveFileId}/preview` : null;

  // The reviewed bill payload sent to the server (the confirmed/edited values).
  function reviewedBill() {
    const amt = Number(amount);
    if (!vendor.trim()) throw new Error("Enter the vendor / who it's from");
    if (!Number.isFinite(amt) || amt <= 0) throw new Error("Enter a valid amount");
    return {
      vendor: vendor.trim(),
      amount: amt,
      currency: currency.trim() || "CAD",
      invoiceNumber: invoiceNumber.trim() || undefined,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? dueDate : undefined,
    };
  }

  const projectArg = projectId || null; // "" → firm-level (no project)

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function addToBill() {
    let bill;
    try {
      bill = reviewedBill();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the bill details");
      return;
    }
    run(() =>
      createBillFromProposal(p.id, {
        projectId: projectArg,
        bill,
        settledPayoutIds: linkPayoutIds.length ? linkPayoutIds : undefined,
      }),
    );
  }

  function reimburse() {
    const [kindTag, payeeId] = payerSel.split(":");
    if (!payeeId) {
      setError("Pick who to reimburse");
      return;
    }
    let bill;
    try {
      bill = reviewedBill();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the bill details");
      return;
    }
    run(() =>
      createExpenseFromProposal(p.id, {
        kind: "reimbursable",
        paidById: kindTag === "p" ? payeeId : null,
        paidByConsultantId: kindTag === "c" ? payeeId : null,
        projectId: projectArg,
        bill,
      }),
    );
  }

  function logFirmPaid() {
    let bill;
    try {
      bill = reviewedBill();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the bill details");
      return;
    }
    run(() => createExpenseFromProposal(p.id, { kind: "firm_paid", projectId: projectArg, bill }));
  }

  function markPaid() {
    run(() =>
      reconcileInvoiceFromProposal(p.id, {
        ar: {
          invoiceNumber: prop.ar?.invoiceNumber,
          amount: prop.ar?.amount,
          paidDate: prop.ar?.paidDate,
        },
      }),
    );
  }

  function reject() {
    if (!confirm("Reject this finance item? Nothing will be filed.")) return;
    run(() => rejectProposal(p.id));
  }

  // CAD preview for the editable amount (the books are in CAD; foreign amounts
  // convert on file). Recomputes as the partner edits amount / currency.
  const amtNum = Number(amount);
  const fx = Number.isFinite(amtNum) && amtNum > 0 ? convertToCad(amtNum, currency || "CAD") : null;
  const cadPreview = fx && fx.origCurrency ? ` → ${formatCAD(fx.cad).replace("CA$", "$")}` : "";

  const matchedClientLabel = p.matchedClientId ? "client matched" : "firm-level";

  return (
    <Card className={cn(isPending && "opacity-60")}>
      <button onClick={onToggle} className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[var(--color-row-hover)] transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          {open ? <ChevronDown size={15} strokeWidth={1.5} className="text-[var(--color-lane-green)] shrink-0" /> : <ChevronRight size={15} strokeWidth={1.5} className="text-bone-mute shrink-0" />}
          <Receipt size={14} strokeWidth={1.5} className="text-[var(--color-lane-green)] shrink-0" />
          <div className="min-w-0">
            <span className="text-[14px] text-bone truncate">{p.title}</span>
            <p className="text-[11px] text-bone-mute">
              {SOURCE_LABEL[p.source] ?? p.source} · {new Date(p.meetingDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })} · {matchedClientLabel}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center px-2 py-0.5 rounded-[var(--radius-pill)] text-[10px] uppercase tracking-wide border border-[var(--color-lane-green)]/50 text-[var(--color-lane-green)]">
            Financials
          </span>
          {financeType === "ap_bill" && <Badge tone="steel">AP bill</Badge>}
          {financeType === "reimbursable" && <Badge tone="steel">reimburse</Badge>}
          {financeType === "firm_paid" && <Badge tone="steel">firm-paid</Badge>}
          {financeType === "ar_payment" && <Badge tone="steel">payment (AR)</Badge>}
          {prop.financeIncomplete && <Badge tone="red">needs detail</Badge>}
        </span>
      </button>

      {open && (
        <div className="px-5 py-5 flex flex-col gap-5">
          {/* Inline document preview (the filed invoice/receipt) */}
          {previewUrl ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Document</Label>
                {att?.driveUrl && (
                  <a href={att.driveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-[var(--color-lane-green)] hover:underline">
                    <ExternalLink size={11} strokeWidth={1.5} /> Open in Drive
                  </a>
                )}
              </div>
              <iframe src={previewUrl} title={att?.fileName ?? "Document"} className="w-full h-[420px] rounded-[var(--radius)] border border-graphite bg-bitumen" />
            </div>
          ) : (
            <div className="flex items-start gap-2 px-3 py-2 border border-graphite bg-bitumen rounded-[var(--radius)]">
              <CircleAlert size={13} strokeWidth={1.5} className="text-bone-mute mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">
                No document on file{prop.financeIncomplete ? " — the source only linked out to the invoice. Open it, then confirm the amounts below." : " — the details were in the email body. Confirm the amounts below."}
                {prop.financeLinks && prop.financeLinks.length > 0 && (
                  <span className="flex flex-col gap-1 pt-1.5">
                    {prop.financeLinks.map((href, i) => (
                      <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-lane-green)] hover:underline truncate">
                        <Link2 size={11} strokeWidth={1.5} className="shrink-0" /> {href}
                      </a>
                    ))}
                  </span>
                )}
              </span>
            </div>
          )}

          {isAr ? (
            /* ── AR: mark an invoice WE issued as paid (never creates a record) ── */
            <div className="flex flex-col gap-3 px-4 py-3 border border-graphite bg-bitumen rounded-[var(--radius)]">
              <span className="text-[13px] text-bone font-medium">Payment on an invoice we issued (AR)</span>
              <span className="text-[12px] text-bone-dim">
                {prop.ar?.invoiceNumber ?? "no invoice # cited"}
                {typeof prop.ar?.amount === "number" ? ` · ${formatCAD(prop.ar.amount).replace("CA$", "$")}` : ""}
                {prop.ar?.paidDate ? ` · paid ${prop.ar.paidDate}` : ""}
              </span>
              {prop.arMatch ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-[var(--color-lane-green)]">
                    Matches invoice {prop.arMatch.number} · {formatCAD(prop.arMatch.amount).replace("CA$", "$")} (outstanding)
                  </span>
                  <Button variant="secondary" size="sm" onClick={markPaid} disabled={isPending}>{isPending ? "…" : "Mark paid"}</Button>
                </div>
              ) : (
                <span className="text-[11px] text-bone-mute">No matching outstanding invoice found — reconcile manually on the Invoices page if it&apos;s one we sent.</span>
              )}
            </div>
          ) : (
            /* ── Payable / expense: confirm the bill, then file it ── */
            <>
              <div className="flex flex-col gap-3">
                <Label gold>Bill details (confirm before filing)</Label>
                <div className="grid grid-cols-[1fr_140px] gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Vendor / from</Label>
                    <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. Anthropic" disabled={isPending} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Amount{cadPreview ? <span className="text-bone-mute font-normal">{cadPreview}</span> : null}</Label>
                    <div className="flex gap-1.5">
                      <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="flex-1" disabled={isPending} />
                      <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="w-[60px] text-center" maxLength={3} disabled={isPending} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Invoice # (optional)</Label>
                    <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="none" disabled={isPending} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Due date (optional)</Label>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="text-[12px]" disabled={isPending} />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <Button variant={financeType === "ap_bill" ? "secondary" : "ghost"} size="sm" onClick={addToBill} disabled={isPending}>Add to AP</Button>
                  <FinanceTip text="A vendor bill the firm owes (accounts payable). Files it under Financials → AP / AR → Payable, ready to pay. Use this when it's an invoice billing the firm." />
                </span>
                <span className="flex items-center gap-1.5">
                  <Select value={payerSel} onChange={(e) => setPayerSel(e.target.value)} disabled={isPending} className="h-8 text-[12px] w-auto">
                    <option value="">who paid…</option>
                    {partners.length > 0 && (
                      <optgroup label="Partners">
                        {partners.map((pt) => <option key={pt.id} value={`p:${pt.id}`}>{pt.name}</option>)}
                      </optgroup>
                    )}
                    {consultants.length > 0 && (
                      <optgroup label="Team">
                        {consultants.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}
                      </optgroup>
                    )}
                  </Select>
                  <Button variant={financeType === "reimbursable" ? "secondary" : "ghost"} size="sm" onClick={reimburse} disabled={isPending}>Reimburse</Button>
                  <FinanceTip text="Someone paid this on their OWN card and the firm owes them back. Pick who paid — it's tracked as owed to them until you mark it reimbursed on the AP / AR tab." />
                </span>
                <span className="inline-flex items-center gap-1">
                  <Button variant={financeType === "firm_paid" ? "secondary" : "ghost"} size="sm" onClick={logFirmPaid} disabled={isPending}>Log firm-paid</Button>
                  <FinanceTip text="Already paid on a FIRM card or account. Records the receipt only, for the books — nothing is owed to anyone. Use this for firm-card purchases and subscriptions." />
                </span>
              </div>

              {/* Project / firm-level */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Project (or firm-level)</Label>
                  <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={isPending}>
                    <option value="">Firm-level (no project)</option>
                    {projects.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                  </Select>
                </div>
              </div>

              {/* Contractor payout link (MP-only, AP bills, only when the project is unchanged) */}
              {canLinkPayouts && financeType === "ap_bill" && projectUnchanged && payoutOptions.length > 0 && (
                <div className="flex flex-col gap-1.5 px-4 py-3 border border-graphite bg-bitumen rounded-[var(--radius)]">
                  <span className="text-[11px] text-bone-dim">
                    Settle a contractor payout{p.projectLabel ? ` on ${p.projectLabel}` : ""}? Linking counts the payment once and clears its &ldquo;needs an invoice&rdquo; flag.
                  </span>
                  <div className="flex flex-col gap-1">
                    {payoutOptions.map((po) => {
                      const on = linkPayoutIds.includes(po.id);
                      return (
                        <label key={po.id} className="flex items-center gap-2 text-[12px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => setLinkPayoutIds((ids) => (e.target.checked ? [...ids, po.id] : ids.filter((x) => x !== po.id)))}
                            className="accent-[var(--color-lane-green)]"
                          />
                          <span className="text-bone">{po.consultantName}</span>
                          <span className="mono text-bone-dim tabular-nums">{formatCAD(po.amount).replace("CA$", "$")}</span>
                          <Badge tone="neutral">{po.status}</Badge>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <span className="text-[11px] text-bone-mute">
                Suggested: {financeType === "reimbursable" ? "Reimburse" : financeType === "firm_paid" ? "Log firm-paid" : "Add to AP"}. Pick the right one — filing also clears this item.
              </span>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-1">
            <Button variant="ghost" size="sm" onClick={reject} disabled={isPending}>Reject</Button>
            <span className="flex items-center gap-1.5 text-[11px] text-bone-mute">
              <X size={11} strokeWidth={1.5} /> File it with an action above, or Reject.
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
