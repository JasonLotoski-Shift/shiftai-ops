"use client";

// RestoreLeadButton — the detail-page panel for a ghosted lead. Brings it back
// to the New (pending) review queue. Mirrors the inline Restore on the Filtered
// lane card, in the panel framing the rest of the detail page uses.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Label, Button } from "@/components/ui";
import { restoreLead } from "@/app/(app)/pipeline/leads/actions";
import { RotateCcw } from "lucide-react";

export function RestoreLeadButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onRestore() {
    setError(null);
    startTransition(async () => {
      try {
        await restoreLead(leadId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Restore failed");
      }
    });
  }

  return (
    <Card className="p-5 flex flex-col gap-3">
      <Label gold>Set aside</Label>
      <p className="text-[13px] text-bone-dim">
        This lead was declined. Restore it to send it back to the review queue.
      </p>
      {error && <p className="text-[12px] text-flag-red">{error}</p>}
      <div>
        <Button variant="secondary" size="sm" onClick={onRestore} disabled={pending}>
          <RotateCcw size={13} strokeWidth={1.5} />
          {pending ? "Restoring…" : "Restore to leads"}
        </Button>
      </div>
    </Card>
  );
}
