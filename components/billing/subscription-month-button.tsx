"use client";

// Subscription billing control (Business model v2). A subscription bills
// month-by-month and open-ended, so there's no fixed schedule to generate — the
// project opens with month 1 and a partner adds the next month when they bill
// it. (A future scheduled agent can append months automatically.)
//
// Server-page → client-child pattern. Calls addSubscriptionMonth in
// billing-actions.ts; the monthly price is the project value (budgetFee).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, ShieldAlert } from "lucide-react";
import { Card, CardBody, Button } from "@/components/ui";
import { formatCAD } from "@/lib/format";
import { addSubscriptionMonth } from "@/app/(app)/projects/[id]/billing-actions";

const money = (n: number) => formatCAD(n).replace("CA$", "$");

export function SubscriptionMonthButton({
  projectId,
  monthlyFee,
  monthsScheduled,
}: {
  projectId: string;
  monthlyFee: number;
  monthsScheduled: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      try {
        await addSubscriptionMonth(projectId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't add the month");
      }
    });
  }

  return (
    <Card>
      <CardBody className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="title-md">Subscription billing</h2>
          <span className="text-[11px] text-bone-mute">
            Month-by-month · {monthsScheduled} month{monthsScheduled === 1 ? "" : "s"} scheduled · {money(monthlyFee)}/mo
          </span>
          {error && (
            <span className="flex items-center gap-1.5 text-[11px] text-flag-red mt-1">
              <ShieldAlert size={11} strokeWidth={1.5} />
              {error}
            </span>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={add} disabled={isPending}>
          <CalendarPlus size={13} strokeWidth={1.5} />
          {isPending ? "Adding…" : "Add next month"}
        </Button>
      </CardBody>
    </Card>
  );
}
