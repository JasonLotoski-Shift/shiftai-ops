"use client";

// FEATURE 3 — Billing-schedule editor.
//
// Renders a project's BillingInstallment list (the planned invoicing
// structure) with add / edit / delete rows, and shows the schedule's
// total against the project's budgetFee so the partner can see coverage.
//
// Server-page → client-child pattern (see components/deal-actions.tsx):
// the project page is a server component; this stateful editor is the
// small client child it mounts. All writes go through billing-actions.ts.

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, Check, X, ShieldAlert } from "lucide-react";
import { Button, Label, Badge, Input, Select } from "@/components/ui";
import { formatCAD, formatDate } from "@/lib/format";
import {
  createInstallment,
  updateInstallment,
  deleteInstallment,
} from "@/app/(app)/projects/[id]/billing-actions";

type Trigger = "on_signing" | "milestone" | "date" | "manual";
type InstallmentStatus = "planned" | "invoiced" | "paid";

export type ScheduleInstallment = {
  id: string;
  label: string;
  amount: number;
  trigger: Trigger;
  dueDate: Date | string | null;
  sortOrder: number;
  status: InstallmentStatus;
  isExtra: boolean;
  invoiceId?: string | null;
};

const TRIGGER_LABELS: Record<Trigger, string> = {
  on_signing: "On signing",
  milestone: "Milestone",
  date: "On date",
  manual: "Manual",
};

const STATUS_TONE: Record<InstallmentStatus, "neutral" | "gold" | "steel"> = {
  planned: "neutral",
  invoiced: "gold",
  paid: "steel",
};

// Status display follows the @map convention: DB stores hyphenated, JS gets
// the underscored identifier, UI shows hyphenated for readability.
function statusLabel(s: InstallmentStatus) {
  return s.replace("_", "-");
}

type DraftRow = { label: string; amount: string; trigger: Trigger; dueDate: string; isExtra: boolean };

const EMPTY_DRAFT: DraftRow = { label: "", amount: "", trigger: "manual", dueDate: "", isExtra: false };

export function BillingScheduleEditor({
  projectId,
  installments,
  budgetFee,
}: {
  projectId: string;
  installments: ScheduleInstallment[];
  budgetFee: number;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftRow>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const scheduled = installments.reduce((s, i) => s + i.amount, 0);
  const coverage = budgetFee > 0 ? Math.round((scheduled / budgetFee) * 100) : 0;
  const remaining = budgetFee - scheduled;

  function run(fn: () => Promise<unknown>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      }
    });
  }

  function startAdd() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setAdding(true);
    setError(null);
  }

  function startEdit(row: ScheduleInstallment) {
    setAdding(false);
    setEditingId(row.id);
    setDraft({
      label: row.label,
      amount: String(row.amount),
      trigger: row.trigger,
      dueDate: row.dueDate ? new Date(row.dueDate).toISOString().slice(0, 10) : "",
      isExtra: row.isExtra,
    });
    setError(null);
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
  }

  function submitAdd() {
    run(
      () =>
        createInstallment(projectId, {
          label: draft.label,
          amount: Number(draft.amount),
          trigger: draft.trigger,
          dueDate: draft.dueDate || null,
          isExtra: draft.isExtra,
        }),
      cancel,
    );
  }

  function submitEdit(id: string) {
    run(
      () =>
        updateInstallment(id, {
          label: draft.label,
          amount: Number(draft.amount),
          trigger: draft.trigger,
          dueDate: draft.dueDate || null,
          isExtra: draft.isExtra,
        }),
      cancel,
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="title-md">Billing schedule</h2>
        {!adding && editingId === null && (
          <Button variant="secondary" size="sm" onClick={startAdd}>
            <Plus size={13} strokeWidth={1.5} />
            Add installment
          </Button>
        )}
      </div>

      {/* Coverage summary — scheduled total vs project budget */}
      <div className="grid grid-cols-3 gap-4 px-5 pb-4">
        <div className="bg-bitumen rounded-[var(--radius)] p-3 flex flex-col gap-1.5">
          <Label>Scheduled</Label>
          <span className="mono text-[16px] text-bone tabular-nums">
            {formatCAD(scheduled).replace("CA$", "$")}
          </span>
        </div>
        <div className="bg-bitumen rounded-[var(--radius)] p-3 flex flex-col gap-1.5">
          <Label>Project budget</Label>
          <span className="mono text-[16px] text-bone-dim tabular-nums">
            {formatCAD(budgetFee).replace("CA$", "$")}
          </span>
        </div>
        <div className="bg-bitumen rounded-[var(--radius)] p-3 flex flex-col gap-1.5">
          <Label>Coverage</Label>
          <span
            className={`mono text-[16px] tabular-nums ${
              remaining < 0 ? "text-flag-red" : coverage >= 100 ? "text-track-gold" : "text-bone-dim"
            }`}
          >
            {coverage}%
            {remaining < 0 && (
              <span className="block label text-[10px] text-flag-red mt-0.5">
                {formatCAD(Math.abs(remaining)).replace("CA$", "$")} over budget
              </span>
            )}
            {remaining > 0 && (
              <span className="block label text-[10px] text-bone-mute mt-0.5">
                {formatCAD(remaining).replace("CA$", "$")} unscheduled
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[1fr_120px_120px_120px_80px] gap-4 px-5 py-2">
        <span className="text-[11px] text-bone-dim">Installment</span>
        <span className="text-[11px] text-bone-dim">Trigger</span>
        <span className="text-[11px] text-bone-dim text-right">Amount</span>
        <span className="text-[11px] text-bone-dim text-right">Status</span>
        <span className="text-[11px] text-bone-dim text-right">Edit</span>
      </div>

      {installments.length === 0 && !adding && (
        <div className="px-5 py-6 text-[13px] text-bone-mute">
          No installments yet. Add the first to define how this engagement bills.
        </div>
      )}

      {installments.map((row) =>
        editingId === row.id ? (
          <DraftRowEditor
            key={row.id}
            draft={draft}
            setDraft={setDraft}
            isPending={isPending}
            onSubmit={() => submitEdit(row.id)}
            onCancel={cancel}
          />
        ) : (
          <div
            key={row.id}
            className="grid grid-cols-[1fr_120px_120px_120px_80px] gap-4 px-5 py-3 items-center"
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[14px] text-bone truncate flex items-center gap-2">
                <span className="truncate">{row.label}</span>
                {row.isExtra && (
                  <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] font-medium rounded-[var(--radius-pill)] border border-track-gold/40 bg-track-gold-dim/20 text-track-gold">
                    Extra
                  </span>
                )}
              </span>
              {row.dueDate && (
                <span className="text-[11px] text-bone-mute tabular-nums">
                  Due {formatDate(row.dueDate)}
                </span>
              )}
            </div>
            <span className="text-[12px] text-bone-dim">{TRIGGER_LABELS[row.trigger]}</span>
            <span className="mono text-[14px] text-bone tabular-nums text-right">
              {formatCAD(row.amount).replace("CA$", "$")}
            </span>
            <div className="flex justify-end">
              <Badge tone={STATUS_TONE[row.status]}>{statusLabel(row.status)}</Badge>
            </div>
            <div className="flex justify-end gap-1">
              {row.status === "planned" ? (
                <>
                  <button
                    onClick={() => startEdit(row)}
                    className="text-bone-mute hover:text-bone p-1"
                    aria-label="Edit installment"
                  >
                    <Pencil size={13} strokeWidth={1.5} />
                  </button>
                  <button
                    onClick={() => run(() => deleteInstallment(row.id))}
                    disabled={isPending}
                    className="text-bone-mute hover:text-flag-red p-1 disabled:opacity-40"
                    aria-label="Delete installment"
                  >
                    <Trash2 size={13} strokeWidth={1.5} />
                  </button>
                </>
              ) : (
                <span className="text-[10px] text-bone-mute self-center">invoiced</span>
              )}
            </div>
          </div>
        ),
      )}

      {adding && (
        <DraftRowEditor
          draft={draft}
          setDraft={setDraft}
          isPending={isPending}
          onSubmit={submitAdd}
          onCancel={cancel}
        />
      )}

      {error && (
        <div className="flex items-start gap-2 mx-5 my-3 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
          <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
          <span className="text-[12px] text-bone-dim">{error}</span>
        </div>
      )}
    </div>
  );
}

function DraftRowEditor({
  draft,
  setDraft,
  isPending,
  onSubmit,
  onCancel,
}: {
  draft: DraftRow;
  setDraft: (d: DraftRow) => void;
  isPending: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_120px_120px_120px_80px] gap-4 px-5 py-3 items-start bg-bitumen/40">
      <div className="flex flex-col gap-2">
        <Input
          placeholder="Label (e.g. On signing)"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          autoFocus
        />
        <Input
          type="date"
          value={draft.dueDate}
          onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
        />
        <label className="flex items-center gap-2 text-[12px] text-bone-dim cursor-pointer select-none pt-0.5">
          <input
            type="checkbox"
            checked={draft.isExtra}
            onChange={(e) => setDraft({ ...draft, isExtra: e.target.checked })}
            className="accent-track-gold w-3.5 h-3.5"
          />
          Out-of-scope extra
        </label>
      </div>
      <Select
        value={draft.trigger}
        onChange={(e) => setDraft({ ...draft, trigger: e.target.value as Trigger })}
      >
        <option value="on_signing">On signing</option>
        <option value="milestone">Milestone</option>
        <option value="date">On date</option>
        <option value="manual">Manual</option>
      </Select>
      <Input
        type="number"
        min={0}
        placeholder="0"
        className="text-right tabular-nums"
        value={draft.amount}
        onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
      />
      <div />
      <div className="flex justify-end gap-1 pt-1">
        <button
          onClick={onSubmit}
          disabled={isPending || !draft.label.trim() || draft.amount === ""}
          className="text-track-gold hover:text-track-gold/80 p-1 disabled:opacity-40"
          aria-label="Save installment"
        >
          <Check size={15} strokeWidth={1.5} />
        </button>
        <button
          onClick={onCancel}
          disabled={isPending}
          className="text-bone-mute hover:text-bone p-1 disabled:opacity-40"
          aria-label="Cancel"
        >
          <X size={15} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
