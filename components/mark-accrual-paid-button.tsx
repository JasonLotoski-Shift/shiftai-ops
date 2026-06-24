"use client";

// Small client child for the service-contract accrual ledger — marks one month's
// recurring commission paid. Keeps the detail page a server component.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { markAccrualPaid } from "@/app/(app)/service-contracts/actions";

export function MarkAccrualPaidButton({ accrualId }: { accrualId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function onClick() {
    setError(false);
    startTransition(async () => {
      try {
        await markAccrualPaid(accrualId);
        router.refresh();
      } catch {
        setError(true);
      }
    });
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      title={error ? "Couldn't mark paid — try again" : "Mark this month paid"}
      className={`inline-flex items-center gap-1 px-2 py-0.5 border font-mono text-[9px] uppercase tracking-wide rounded-[var(--radius-pill)] transition-colors disabled:opacity-50 ${
        error
          ? "border-flag-red/40 text-flag-red"
          : "border-graphite-2 text-bone-mute hover:text-track-gold hover:border-track-gold/40"
      }`}
    >
      <Check size={11} strokeWidth={1.5} />
      {pending ? "…" : error ? "Retry" : "Paid"}
    </button>
  );
}
