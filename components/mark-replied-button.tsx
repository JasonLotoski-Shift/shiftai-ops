"use client";

// MarkRepliedButton — the deal-detail control for a cold-emailed lead-stage
// deal that's awaiting a reply (D36). Marking it replied promotes the deal
// lead → qualified, stamps outreachRepliedAt, and logs an email_received
// Interaction. Kept as a small client child so the deal-detail page stays a
// server component (per CLAUDE.md).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { markDealReplied } from "@/app/(app)/pipeline/[id]/actions";
import { MailCheck } from "lucide-react";

export function MarkRepliedButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      try {
        await markDealReplied(dealId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't mark replied");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <Button variant="primary" size="sm" onClick={onClick} disabled={pending}>
          <MailCheck size={13} strokeWidth={1.5} />
          {pending ? "Updating…" : "Mark replied → Qualify"}
        </Button>
      </div>
      {error && <p className="text-[12px] text-flag-red">{error}</p>}
    </div>
  );
}
