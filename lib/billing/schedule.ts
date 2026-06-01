// Standard firm billing schedule — pure helpers (no "use server", no DB).
//
// The firm bills every fixed-fee project in three stages:
//   50% on signing · 25% at the mid-point · 25% on delivery.
// These functions turn a project value + start/target-end window into the
// three installment drafts, and reconcile that ideal against whatever rows a
// project already has — never clobbering an installment that's been invoiced.

import type { InstallmentTrigger, InstallmentStatus } from "@/lib/generated/prisma/enums";

// A placeholder default billable rate (CENTS/hr) used to seed firm economics
// before a real rate card is entered. Clearly a placeholder — partners edit
// the per-line billable rate in-app. $200/hr.
export const DEFAULT_BILLABLE_RATE_CENTS = 20000;

export type InstallmentDraft = {
  label: string;
  amount: number; // whole CAD
  trigger: InstallmentTrigger;
  // Days from the project start at which this stage is expected (drives dueDate).
  // 0 = at start; null = "on delivery" → anchored to targetEndDate instead.
  offsetFromStartDays: number | null;
};

// The three-stage 50/25/25 split. The remainder from integer rounding is
// pushed onto the final (delivery) row so the three amounts sum to `value`.
export function fiftyTwentyFiveSchedule(value: number): InstallmentDraft[] {
  const v = Math.max(0, Math.round(value));
  const first = Math.round(v * 0.5);
  const second = Math.round(v * 0.25);
  const third = v - first - second; // soaks up the rounding remainder
  return [
    { label: "50% — On signing", amount: first, trigger: "on_signing", offsetFromStartDays: 0 },
    { label: "25% — Mid-point", amount: second, trigger: "milestone", offsetFromStartDays: null },
    { label: "25% — On delivery", amount: third, trigger: "date", offsetFromStartDays: null },
  ];
}

// Resolve a draft's dueDate against the project window. on_signing → start;
// the mid-point → halfway between start and target end; delivery → target end.
export function draftDueDate(
  draft: InstallmentDraft,
  startDate: Date,
  targetEndDate: Date,
): Date {
  if (draft.trigger === "on_signing") return startDate;
  if (draft.trigger === "milestone") {
    return new Date((startDate.getTime() + targetEndDate.getTime()) / 2);
  }
  return targetEndDate; // delivery
}

export type ExistingInstallment = {
  id: string;
  status: InstallmentStatus;
  isExtra: boolean;
};

export type ScheduleReconcile = {
  // Whether the project already has a non-extra schedule we'd be replacing.
  hasSchedule: boolean;
  // Planned (not yet invoiced) non-extra rows we can safely delete + regenerate.
  deletableIds: string[];
  // Non-extra rows that are already invoiced/paid and must be preserved.
  lockedIds: string[];
  // True when some non-extra rows are locked — a clean regenerate isn't possible
  // without leaving the locked rows in place (caller should warn).
  blockedByInvoiced: boolean;
};

// Decide how to (re)generate the standard schedule given what already exists.
// Extras are never touched. Locked (invoiced/paid) rows are preserved.
export function reconcileSchedule(existing: ExistingInstallment[]): ScheduleReconcile {
  const base = existing.filter((i) => !i.isExtra);
  const deletableIds = base.filter((i) => i.status === "planned").map((i) => i.id);
  const lockedIds = base.filter((i) => i.status !== "planned").map((i) => i.id);
  return {
    hasSchedule: base.length > 0,
    deletableIds,
    lockedIds,
    blockedByInvoiced: lockedIds.length > 0,
  };
}
