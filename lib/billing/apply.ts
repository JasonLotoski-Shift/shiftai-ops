// Standard-schedule writer — the DB side of the 50/25/25 generator.
//
// Pure schedule math lives in ./schedule.ts; this module performs the writes
// against a Prisma transaction client so BOTH the project billing action
// (generateStandardSchedule) and convertDeal can produce the same schedule
// inside their own transactions. No "use server" — it's imported by server
// actions, never called from the client. Mirrors lib/ingest/apply.ts.

import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  fiftyTwentyFiveSchedule,
  monthlyEvenSchedule,
  monthlyDueDate,
  draftDueDate,
  reconcileSchedule,
  type ExistingInstallment,
} from "@/lib/billing/schedule";
import type { ScheduleType } from "@/lib/generated/prisma/enums";

// Only the billingInstallment delegate is needed; a $transaction tx client
// satisfies this (same narrowing trick as lib/audit.ts).
type Tx = Pick<PrismaClient, "billingInstallment">;

export type ApplyScheduleResult = {
  skipped: boolean;
  reason?: "exists" | "invoiced";
  created: number;
  deleted: number;
  lockedKept: number;
};

// (Re)generate the standard 50/25/25 schedule for a project.
//   - No existing non-extra schedule → generate.
//   - Existing schedule + !force → skip (reason "exists"); caller can offer force.
//   - force + any invoiced/paid non-extra row → skip (reason "invoiced"); we never
//     clobber billed installments. Caller warns and the partner adjusts manually.
//   - force + only planned rows → delete the planned rows and regenerate fresh.
// Extras are never touched.
export async function applyStandardScheduleTx(
  tx: Tx,
  args: {
    projectId: string;
    value: number;
    startDate: Date;
    targetEndDate: Date;
    scheduleType?: ScheduleType;
    force?: boolean;
  },
): Promise<ApplyScheduleResult> {
  const existing = (await tx.billingInstallment.findMany({
    where: { projectId: args.projectId },
    select: { id: true, status: true, isExtra: true },
  })) as ExistingInstallment[];

  const rec = reconcileSchedule(existing);

  if (rec.hasSchedule && !args.force) {
    return { skipped: true, reason: "exists", created: 0, deleted: 0, lockedKept: rec.lockedIds.length };
  }
  if (rec.blockedByInvoiced) {
    return { skipped: true, reason: "invoiced", created: 0, deleted: 0, lockedKept: rec.lockedIds.length };
  }

  // Safe to regenerate: drop the planned non-extra rows, then create the schedule.
  if (rec.deletableIds.length > 0) {
    await tx.billingInstallment.deleteMany({ where: { id: { in: rec.deletableIds } } });
  }

  // Schedule shape depends on the project's scheduleType. 'custom' falls through
  // to 50/25/25 here (a deliberate generate is still an explicit 50/25/25 ask).
  const monthly = args.scheduleType === "monthly_even";
  const drafts = monthly
    ? monthlyEvenSchedule(args.value, args.startDate, args.targetEndDate)
    : fiftyTwentyFiveSchedule(args.value);

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    await tx.billingInstallment.create({
      data: {
        projectId: args.projectId,
        label: d.label,
        amount: d.amount,
        trigger: d.trigger,
        dueDate: monthly ? monthlyDueDate(args.startDate, i) : draftDueDate(d, args.startDate, args.targetEndDate),
        sortOrder: i,
        status: "planned",
        isExtra: false,
      },
    });
  }

  return { skipped: false, created: drafts.length, deleted: rec.deletableIds.length, lockedKept: 0 };
}
