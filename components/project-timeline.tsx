"use client";

// Project delivery timeline — interactive wrapper around DeliveryTimeline.
//
// Server-page → client-child pattern (see components/billing-schedule-editor.tsx):
// the project page is a server component; this stateful wrapper is the small
// client child it mounts full-width under the back-to-projects link.
//
// Responsibilities:
//   1. Build the flat marker list the presentational bar consumes:
//        - dated milestones → M1, M2… (by date order)
//        - dated installments → B1, B2… (by date order)
//        - each non-draft invoice → an "invoice-sent" marker at issuedAt
//        - each paid invoice → an "invoice-paid" marker at paidAt
//      Undated milestones / installments are EXCLUDED from the bar and listed
//      below in an "Undated" group.
//   2. Render M#/B# legend rows below the bar with click-to-edit dates:
//        - milestone date → updateMilestone(id, { dueDate }) (clearable to null)
//        - installment date → updateInstallment(id, { dueDate }) — planned only
//   3. router.refresh() after each edit so the bar re-flows.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Check, X, Pencil } from "lucide-react";
import { Card, CardHeader, CardBody, Input } from "@/components/ui";
import { formatCAD, formatDate } from "@/lib/format";
import { updateMilestone } from "@/app/(app)/projects/[id]/actions";
import { updateInstallment } from "@/app/(app)/projects/[id]/billing-actions";
import {
  DeliveryTimeline,
  type TimelineMarker,
  type TimelineMarkerTone,
} from "@/components/delivery-timeline";

// ── input shapes (mirror Prisma rows, dates may arrive as strings) ──────
type MilestoneStatus = "pending" | "in_progress" | "complete" | "at_risk";
type InstallmentStatus = "planned" | "invoiced" | "paid";

export type TimelineMilestone = {
  id: string;
  title: string;
  status: MilestoneStatus;
  dueDate: string | Date | null;
};

export type TimelineInstallment = {
  id: string;
  label: string;
  amount: number;
  status: InstallmentStatus;
  dueDate: string | Date | null;
};

export type TimelineInvoice = {
  id: string;
  number: string;
  status: string; // draft | sent | paid | overdue …
  issuedAt: string | Date;
  paidAt: string | Date | null;
};

interface ProjectTimelineProps {
  startDate: string | Date;
  targetEndDate: string | Date;
  milestones: TimelineMilestone[];
  installments: TimelineInstallment[];
  invoices: TimelineInvoice[];
}

function toDate(d: string | Date): Date {
  return typeof d === "string" ? new Date(d) : d;
}

function toInputValue(d: string | Date | null): string {
  if (!d) return "";
  return toDate(d).toISOString().slice(0, 10);
}

// Milestone tone by status (complete→steel, in_progress→gold, at_risk→red, pending→neutral).
const MILESTONE_TONE: Record<MilestoneStatus, TimelineMarkerTone> = {
  complete: "steel",
  in_progress: "gold",
  at_risk: "red",
  pending: "neutral",
};

// Installment tone by status (paid→steel, invoiced→gold, planned→bone-mute).
const INSTALLMENT_TONE: Record<InstallmentStatus, TimelineMarkerTone> = {
  paid: "steel",
  invoiced: "gold",
  planned: "bone-mute",
};

const cad = (n: number) => formatCAD(n).replace("CA$", "$");
const statusLabel = (s: string) => s.replace("_", "-");

export function ProjectTimeline({
  startDate,
  targetEndDate,
  milestones,
  installments,
  invoices,
}: ProjectTimelineProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Dated vs undated split + M#/B# numbering by date order.
  const datedMilestones = useMemo(
    () =>
      milestones
        .filter((m) => m.dueDate)
        .sort((a, b) => toDate(a.dueDate as string | Date).getTime() - toDate(b.dueDate as string | Date).getTime())
        .map((m, i) => ({ ...m, numberLabel: `M${i + 1}` })),
    [milestones],
  );
  const undatedMilestones = useMemo(() => milestones.filter((m) => !m.dueDate), [milestones]);

  const datedInstallments = useMemo(
    () =>
      installments
        .filter((i) => i.dueDate)
        .sort((a, b) => toDate(a.dueDate as string | Date).getTime() - toDate(b.dueDate as string | Date).getTime())
        .map((inst, i) => ({ ...inst, numberLabel: `B${i + 1}` })),
    [installments],
  );
  const undatedInstallments = useMemo(() => installments.filter((i) => !i.dueDate), [installments]);

  // The flat marker list for the presentational bar.
  const markers: TimelineMarker[] = useMemo(() => {
    const out: TimelineMarker[] = [];

    for (const m of datedMilestones) {
      out.push({
        id: `m-${m.id}`,
        kind: "milestone",
        date: toDate(m.dueDate as string | Date),
        numberLabel: m.numberLabel,
        title: m.title,
        detail: statusLabel(m.status),
        tone: MILESTONE_TONE[m.status],
      });
    }

    for (const inst of datedInstallments) {
      out.push({
        id: `b-${inst.id}`,
        kind: "installment",
        date: toDate(inst.dueDate as string | Date),
        numberLabel: inst.numberLabel,
        title: inst.label,
        detail: `${cad(inst.amount)} · ${statusLabel(inst.status)}`,
        tone: INSTALLMENT_TONE[inst.status],
      });
    }

    for (const inv of invoices) {
      if (inv.status !== "draft") {
        out.push({
          id: `inv-sent-${inv.id}`,
          kind: "invoice-sent",
          date: toDate(inv.issuedAt),
          title: `Invoice ${inv.number} sent`,
          detail: statusLabel(inv.status),
          tone: "gold",
        });
      }
      if (inv.paidAt) {
        out.push({
          id: `inv-paid-${inv.id}`,
          kind: "invoice-paid",
          date: toDate(inv.paidAt),
          title: `Invoice ${inv.number} paid`,
          tone: "steel",
        });
      }
    }

    return out;
  }, [datedMilestones, datedInstallments, invoices]);

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setEditingId(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save the date");
      }
    });
  }

  function startEdit(key: string, current: string | Date | null) {
    setError(null);
    setEditingId(key);
    setDraftDate(toInputValue(current));
  }

  function saveMilestone(id: string) {
    run(() => updateMilestone(id, { dueDate: draftDate || null }));
  }

  function saveInstallment(id: string) {
    run(() => updateInstallment(id, { dueDate: draftDate || null }));
  }

  const hasBarMarkers = markers.length > 0;

  return (
    <Card>
      <CardHeader>
        <h2 className="title-md">Delivery timeline</h2>
      </CardHeader>
      <CardBody>
        <div className="flex flex-col gap-6">
          {hasBarMarkers ? (
            <DeliveryTimeline startDate={startDate} targetEndDate={targetEndDate} markers={markers} />
          ) : (
            <div className="text-[13px] text-bone-mute py-4">
              No dated milestones, installments, or invoices yet — add a due date to put work on the timeline.
            </div>
          )}

          {/* M# milestone legend rows — click date to edit */}
          {datedMilestones.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="label text-[10px]">Milestones</span>
              {datedMilestones.map((m) => {
                const key = `m-${m.id}`;
                const editing = editingId === key;
                return (
                  <div key={m.id} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 py-1.5 border-b border-graphite/40 last:border-b-0">
                    <span className={`mono text-[11px] tabular-nums ${toneText(MILESTONE_TONE[m.status])}`}>{m.numberLabel}</span>
                    <span className="text-[13px] text-bone truncate">{m.title}</span>
                    <div className="flex items-center gap-2 justify-end">
                      {editing ? (
                        <DateEditor
                          value={draftDate}
                          onChange={setDraftDate}
                          onSave={() => saveMilestone(m.id)}
                          onCancel={() => setEditingId(null)}
                          isPending={isPending}
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(key, m.dueDate)}
                          className="group flex items-center gap-1.5 text-[12px] text-bone-dim hover:text-bone tabular-nums"
                          title="Edit date"
                        >
                          <Calendar size={12} strokeWidth={1.5} className="text-bone-mute" />
                          {m.dueDate ? formatDate(m.dueDate) : "set date"}
                          <Pencil size={11} strokeWidth={1.5} className="opacity-0 group-hover:opacity-100 text-bone-mute" />
                        </button>
                      )}
                      <span className={`text-[11px] ${toneText(MILESTONE_TONE[m.status])}`}>{statusLabel(m.status)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* B# installment legend rows — click date to edit (planned only) */}
          {datedInstallments.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="label text-[10px]">Billing</span>
              {datedInstallments.map((inst) => {
                const key = `b-${inst.id}`;
                const editing = editingId === key;
                const editable = inst.status === "planned";
                return (
                  <div key={inst.id} className="grid grid-cols-[40px_1fr_auto_auto] items-center gap-3 py-1.5 border-b border-graphite/40 last:border-b-0">
                    <span className={`mono text-[11px] tabular-nums ${toneText(INSTALLMENT_TONE[inst.status])}`}>{inst.numberLabel}</span>
                    <span className="text-[13px] text-bone truncate">{inst.label}</span>
                    <span className="mono text-[12px] text-bone-dim tabular-nums text-right">{cad(inst.amount)}</span>
                    <div className="flex items-center gap-2 justify-end">
                      {editing && editable ? (
                        <DateEditor
                          value={draftDate}
                          onChange={setDraftDate}
                          onSave={() => saveInstallment(inst.id)}
                          onCancel={() => setEditingId(null)}
                          isPending={isPending}
                        />
                      ) : editable ? (
                        <button
                          onClick={() => startEdit(key, inst.dueDate)}
                          className="group flex items-center gap-1.5 text-[12px] text-bone-dim hover:text-bone tabular-nums"
                          title="Edit date"
                        >
                          <Calendar size={12} strokeWidth={1.5} className="text-bone-mute" />
                          {inst.dueDate ? formatDate(inst.dueDate) : "set date"}
                          <Pencil size={11} strokeWidth={1.5} className="opacity-0 group-hover:opacity-100 text-bone-mute" />
                        </button>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[12px] text-bone-mute tabular-nums">
                          <Calendar size={12} strokeWidth={1.5} />
                          {inst.dueDate ? formatDate(inst.dueDate) : "—"}
                        </span>
                      )}
                      <span className={`text-[11px] ${toneText(INSTALLMENT_TONE[inst.status])}`}>{statusLabel(inst.status)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Undated group — off the bar, listed for completeness */}
          {(undatedMilestones.length > 0 || undatedInstallments.length > 0) && (
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="label text-[10px]">Undated — not on the timeline</span>
              {undatedMilestones.map((m) => {
                const key = `m-${m.id}`;
                const editing = editingId === key;
                return (
                  <div key={m.id} className="grid grid-cols-[1fr_auto] items-center gap-3 py-1.5 border-b border-graphite/40 last:border-b-0">
                    <span className="text-[13px] text-bone-dim truncate">
                      <span className="text-bone-mute mr-2 text-[11px] uppercase tracking-[0.06em]">Milestone</span>
                      {m.title}
                    </span>
                    {editing ? (
                      <DateEditor
                        value={draftDate}
                        onChange={setDraftDate}
                        onSave={() => saveMilestone(m.id)}
                        onCancel={() => setEditingId(null)}
                        isPending={isPending}
                      />
                    ) : (
                      <button
                        onClick={() => startEdit(key, null)}
                        className="flex items-center gap-1.5 text-[12px] text-track-gold hover:text-bone justify-self-end"
                        title="Add a date"
                      >
                        <Calendar size={12} strokeWidth={1.5} />
                        Add date
                      </button>
                    )}
                  </div>
                );
              })}
              {undatedInstallments.map((inst) => {
                const key = `b-${inst.id}`;
                const editing = editingId === key;
                const editable = inst.status === "planned";
                return (
                  <div key={inst.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-1.5 border-b border-graphite/40 last:border-b-0">
                    <span className="text-[13px] text-bone-dim truncate">
                      <span className="text-bone-mute mr-2 text-[11px] uppercase tracking-[0.06em]">Billing</span>
                      {inst.label}
                    </span>
                    <span className="mono text-[12px] text-bone-mute tabular-nums text-right">{cad(inst.amount)}</span>
                    {editing && editable ? (
                      <DateEditor
                        value={draftDate}
                        onChange={setDraftDate}
                        onSave={() => saveInstallment(inst.id)}
                        onCancel={() => setEditingId(null)}
                        isPending={isPending}
                      />
                    ) : editable ? (
                      <button
                        onClick={() => startEdit(key, null)}
                        className="flex items-center gap-1.5 text-[12px] text-track-gold hover:text-bone justify-self-end"
                        title="Add a date"
                      >
                        <Calendar size={12} strokeWidth={1.5} />
                        Add date
                      </button>
                    ) : (
                      <span className="text-[11px] text-bone-mute justify-self-end">{statusLabel(inst.status)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {error && <span className="text-[12px] text-flag-red">{error}</span>}
        </div>
      </CardBody>
    </Card>
  );
}

function toneText(tone: TimelineMarkerTone): string {
  switch (tone) {
    case "steel":
      return "text-diagnostic-steel";
    case "gold":
      return "text-track-gold";
    case "red":
      return "text-flag-red";
    default:
      return "text-bone-mute";
  }
}

function DateEditor({
  value,
  onChange,
  onSave,
  onCancel,
  isPending,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="date"
        value={value}
        autoFocus
        disabled={isPending}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
        className="h-7 text-[12px] w-[150px]"
      />
      <button onClick={onSave} disabled={isPending} className="text-track-gold hover:text-bone p-1 disabled:opacity-40" title="Save">
        <Check size={14} strokeWidth={1.5} />
      </button>
      <button onClick={onCancel} disabled={isPending} className="text-bone-mute hover:text-bone p-1 disabled:opacity-40" title="Cancel">
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
