"use client";

// Scope-pricing ingest panel (project-scoped). Two states:
//   1. No pending proposal → a paste box + "Extract pricing" button.
//   2. A pending proposal → a review table (editable lines: consultant, hours,
//      pay/bill rate, extra) + "also generate 50/25/25" + Approve / Reject.
// Approving writes the economics lines via approveScopePricing.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Check, X, Sparkles } from "lucide-react";
import { Card, CardHeader, CardBody, Input, Select, Button, Badge, Textarea } from "@/components/ui";
import {
  extractScopePricing,
  approveScopePricing,
  rejectScopePricing,
} from "@/app/(app)/ingest/scope-pricing-actions";

export type ScopeReviewLine = {
  role: string;
  consultantId: string | null; // pre-resolved from consultantHint on the server
  consultantHint: string | null;
  hours: number;
  payRateCents: number | null;
  billRateCents: number;
  isExtra: boolean;
};

export type PendingScopeProposal = {
  id: string;
  total: number | null;
  notes: string[];
  lines: ScopeReviewLine[];
};

export type ScopeConsultant = { id: string; name: string; payRateCents: number };

export function ScopePricingPanel({
  projectId,
  consultants,
  pending,
}: {
  projectId: string;
  consultants: ScopeConsultant[];
  pending: PendingScopeProposal | null;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function extract() {
    setError(null);
    startTransition(async () => {
      try {
        await extractScopePricing({ projectId, content });
        setContent("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Extraction failed");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-center gap-2">
        <FileSpreadsheet size={14} strokeWidth={1.5} className="text-track-gold" />
        <h2 className="title-md">Scope-pricing ingest</h2>
      </CardHeader>

      {pending ? (
        <ReviewBody projectId={projectId} consultants={consultants} pending={pending} />
      ) : (
        <CardBody className="flex flex-col gap-3 pt-0">
          <p className="text-[12px] text-bone-mute leading-relaxed">
            Paste a scope/pricing document. It reads only the pricing — people, hours, and rates —
            and proposes economics lines for you to review before anything is saved.
          </p>
          <Textarea
            rows={6}
            placeholder="Paste the scope/pricing breakdown here…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isPending}
          />
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={extract} disabled={isPending || content.trim().length < 40}>
              <Sparkles size={13} strokeWidth={1.5} />
              {isPending ? "Reading…" : "Extract pricing"}
            </Button>
            {error && <span className="text-[12px] text-flag-red">{error}</span>}
          </div>
        </CardBody>
      )}
    </Card>
  );
}

function ReviewBody({
  projectId,
  consultants,
  pending,
}: {
  projectId: string;
  consultants: ScopeConsultant[];
  pending: PendingScopeProposal;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(pending.lines.map((l) => ({ ...l, keep: true })));
  const [generateSchedule, setGenerateSchedule] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function patch(i: number, p: Partial<(typeof rows)[number]>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }

  function approve() {
    setError(null);
    startTransition(async () => {
      try {
        await approveScopePricing(pending.id, {
          lines: rows
            .filter((r) => r.keep)
            .map((r) => ({
              role: r.role,
              consultantId: r.consultantId,
              hours: r.hours,
              payRateCents: r.payRateCents,
              billRateCents: r.billRateCents,
              isExtra: r.isExtra,
            })),
          generateSchedule,
          scheduleValue: null,
        });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Approve failed");
      }
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      try {
        await rejectScopePricing(pending.id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reject failed");
      }
    });
  }

  const keptCount = rows.filter((r) => r.keep).length;

  return (
    <>
      <div className="px-5 pb-2 flex items-center gap-2">
        <Badge tone="gold">pending review</Badge>
        {pending.total !== null && (
          <span className="text-[11px] text-bone-mute">Doc total: <span className="mono">${pending.total.toLocaleString()}</span></span>
        )}
      </div>

      {rows.length === 0 ? (
        <CardBody className="pt-0"><span className="text-[12px] text-bone-mute">No pricing lines were found in the document.</span></CardBody>
      ) : (
        <div className="flex flex-col">
          <div className="grid grid-cols-[28px_1.2fr_1.1fr_60px_84px_84px_50px] gap-2 px-5 py-2">
            <span />
            <span className="text-[11px] text-bone-dim">Role</span>
            <span className="text-[11px] text-bone-dim">Consultant</span>
            <span className="text-[11px] text-bone-dim text-right">Hrs</span>
            <span className="text-[11px] text-bone-dim text-right">Pay $/hr</span>
            <span className="text-[11px] text-bone-dim text-right">Bill $/hr</span>
            <span className="text-[11px] text-bone-dim text-center">Extra</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} className={`grid grid-cols-[28px_1.2fr_1.1fr_60px_84px_84px_50px] gap-2 px-5 py-2 border-t border-graphite/40 items-center ${r.keep ? "" : "opacity-40"}`}>
              <input type="checkbox" checked={r.keep} onChange={(e) => patch(i, { keep: e.target.checked })} className="accent-track-gold" />
              <Input value={r.role} onChange={(e) => patch(i, { role: e.target.value })} className="h-7 text-[12px]" />
              <Select
                value={r.consultantId ?? ""}
                onChange={(e) => patch(i, { consultantId: e.target.value || null })}
                className="h-7 text-[12px]"
              >
                <option value="">{r.consultantHint ? `Unmatched: ${r.consultantHint}` : "No consultant"}</option>
                {consultants.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <Input type="number" min={0} step="0.5" value={r.hours} onChange={(e) => patch(i, { hours: Number(e.target.value) })} className="h-7 text-[12px] text-right" />
              <Input
                type="number"
                min={0}
                step="1"
                value={r.payRateCents === null ? "" : r.payRateCents / 100}
                placeholder="roster"
                onChange={(e) => patch(i, { payRateCents: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) })}
                className="h-7 text-[12px] text-right"
              />
              <Input type="number" min={0} step="1" value={r.billRateCents / 100} onChange={(e) => patch(i, { billRateCents: Math.round(Number(e.target.value) * 100) })} className="h-7 text-[12px] text-right" />
              <div className="flex justify-center">
                <input type="checkbox" checked={r.isExtra} onChange={(e) => patch(i, { isExtra: e.target.checked })} className="accent-track-gold" />
              </div>
            </div>
          ))}
        </div>
      )}

      {pending.notes.length > 0 && (
        <div className="px-5 py-3 border-t border-graphite/40 flex flex-col gap-1">
          <span className="label text-[10px]">Notes from the doc</span>
          {pending.notes.map((n, i) => (
            <span key={i} className="text-[12px] text-bone-mute">• {n}</span>
          ))}
        </div>
      )}

      <CardBody className="pt-3 border-t border-graphite flex flex-col gap-3">
        <label className="flex items-center gap-2 text-[12px] text-bone-dim cursor-pointer">
          <input type="checkbox" checked={generateSchedule} onChange={(e) => setGenerateSchedule(e.target.checked)} className="accent-track-gold" />
          Also regenerate the 50/25/25 client schedule from the project value
        </label>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={approve} disabled={isPending || keptCount === 0}>
            <Check size={13} strokeWidth={1.5} />
            Approve {keptCount} line{keptCount === 1 ? "" : "s"}
          </Button>
          <Button variant="ghost" size="sm" onClick={reject} disabled={isPending}>
            <X size={13} strokeWidth={1.5} />
            Reject
          </Button>
          {error && <span className="text-[12px] text-flag-red">{error}</span>}
        </div>
      </CardBody>
    </>
  );
}
