"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { CheckCircle2, Loader2 } from "lucide-react";
import { approveKnowledgeItem, approveDecisionRecord } from "@/app/(app)/firm-knowledge/actions";

// Promote a draft Tier-2 record to `approved` — the only state a skill can
// retrieve. One button, two record kinds (knowledge item / decision).
export function KnowledgeApproveButton({
  id,
  kind,
}: {
  id: string;
  kind: "item" | "decision";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    start(async () => {
      const res = kind === "item" ? await approveKnowledgeItem(id) : await approveDecisionRecord(id);
      if (!res.ok) setError(res.error ?? "Could not approve.");
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button size="sm" onClick={onClick} disabled={pending} className="gap-1.5">
        {pending ? <Loader2 size={14} strokeWidth={1.5} className="animate-spin" /> : <CheckCircle2 size={14} strokeWidth={1.5} />}
        Approve for skills
      </Button>
      {error && <span className="text-[12px] text-flag-red">{error}</span>}
    </div>
  );
}
