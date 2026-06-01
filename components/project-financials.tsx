"use client";

// PROJECT FINANCIALS / AR SUMMARY
//
// Collapsed: two headline numbers — Project value and Received — with an
// expand chevron. Expanded: the AR breakdown (Invoiced, Invoices missing,
// Remaining to be billed, Extras) then the full BillingScheduleEditor inside.
//
// Server-page → client-child pattern (see components/billing-schedule-editor.tsx):
// the project page is a server component; this stateful wrapper is the small
// client child it mounts. It computes derived AR figures from invoices +
// installments and renders the editor below.

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui";
import { formatCAD } from "@/lib/format";
import { BillingScheduleEditor, type ScheduleInstallment } from "@/components/billing-schedule-editor";

type FinancialInvoice = {
  id: string;
  amount: number;
  status: string;
  issuedAt: Date | string | null;
  paidAt: Date | string | null;
  installmentId?: string | null;
};

const money = (n: number) => formatCAD(n).replace("CA$", "$");

export function ProjectFinancials({
  projectId,
  budgetFee,
  invoices,
  installments,
}: {
  projectId: string;
  budgetFee: number;
  invoices: FinancialInvoice[];
  installments: ScheduleInstallment[];
}) {
  const [expanded, setExpanded] = useState(false);

  const now = Date.now();

  // Installments flagged out-of-scope; their linked invoices are "extras",
  // not part of the base project AR.
  const extraInvoiceIds = new Set(
    installments
      .filter((i) => i.isExtra)
      .map((i) => i.invoiceId)
      .filter((id): id is string => Boolean(id)),
  );

  const baseInvoices = invoices.filter((inv) => !extraInvoiceIds.has(inv.id));

  // Received — cash in (paid invoices, all of them).
  const received = invoices
    .filter((inv) => inv.status === "paid")
    .reduce((s, inv) => s + inv.amount, 0);

  // Invoiced — actual base AR raised (anything not still a draft).
  const invoiced = baseInvoices
    .filter((inv) => inv.status !== "draft")
    .reduce((s, inv) => s + inv.amount, 0);

  // Extras — invoices tied to out-of-scope installments.
  const extras = invoices
    .filter((inv) => extraInvoiceIds.has(inv.id))
    .reduce((s, inv) => s + inv.amount, 0);

  // Remaining to be billed against the agreed project value.
  const remainingToBill = budgetFee - invoiced;

  // Invoices missing — base installments past due, planned, with no invoice yet.
  const missing = installments.filter(
    (i) =>
      !i.isExtra &&
      i.status === "planned" &&
      i.dueDate &&
      new Date(i.dueDate).getTime() < now &&
      !i.invoiceId,
  );
  const missingAmount = missing.reduce((s, i) => s + i.amount, 0);
  const missingCount = missing.length;

  return (
    <div className="flex flex-col">
      {/* Headline row — always visible; clicking toggles the breakdown. */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between px-5 pt-5 pb-5 text-left focus-gold rounded-[var(--radius)]"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-10">
          <div className="flex flex-col gap-1.5">
            <Label>Project value</Label>
            <span className="mono text-[24px] text-bone tabular-nums leading-none">
              {money(budgetFee)}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Received</Label>
            <span
              className={`mono text-[24px] tabular-nums leading-none ${
                received > 0 ? "text-signal-fresh" : "text-bone-mute"
              }`}
            >
              {money(received)}
            </span>
          </div>
        </div>
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          className={`text-bone-mute transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <>
          {/* AR breakdown */}
          <div className="border-t border-graphite flex flex-col">
            <FinancialRow label="Invoiced" value={money(invoiced)} hint="base, raised to date" />
            <FinancialRow
              label="Invoices missing"
              value={money(missingAmount)}
              hint={`${missingCount} past-due installment${missingCount === 1 ? "" : "s"} not yet invoiced`}
              tone={missingCount > 0 ? "warn" : "muted"}
            />
            <FinancialRow
              label="Remaining to be billed"
              value={money(remainingToBill)}
              hint="against project value"
              tone={remainingToBill < 0 ? "warn" : "default"}
            />
            <FinancialRow
              label="Extras"
              value={money(extras)}
              hint="out-of-scope, billed on top"
              tone={extras > 0 ? "gold" : "muted"}
            />
          </div>

          {/* Schedule editor lives inside the expanded panel. */}
          <div className="border-t border-graphite">
            <BillingScheduleEditor
              projectId={projectId}
              installments={installments}
              budgetFee={budgetFee}
            />
          </div>
        </>
      )}
    </div>
  );
}

function FinancialRow({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "muted" | "warn" | "gold";
}) {
  const valueTone =
    tone === "warn"
      ? "text-flag-red"
      : tone === "gold"
        ? "text-track-gold"
        : tone === "muted"
          ? "text-bone-mute"
          : "text-bone";
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[14px] text-bone-dim">{label}</span>
        {hint && <span className="text-[11px] text-bone-mute">{hint}</span>}
      </div>
      <span className={`mono text-[15px] tabular-nums shrink-0 ${valueTone}`}>{value}</span>
    </div>
  );
}
