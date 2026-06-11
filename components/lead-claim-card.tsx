"use client";

// LeadClaimCard — who's working this lead. Claim it yourself in one click, or
// assign it to another partner from the select. Read-only once the lead has
// been resolved (added/ghost). Claims are firm-visible: the owner shows on the
// lead cards and the Cold email sent tab.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Button, Card, Label, Select } from "@/components/ui";
import { claimLead } from "@/app/(app)/pipeline/leads/actions";
import { UserCheck } from "lucide-react";

function initialsOf(name?: string | null): string {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function LeadClaimCard({
  leadId,
  claimedById,
  claimedBy,
  partners,
  currentPartnerId,
  readOnly = false,
}: {
  leadId: string;
  claimedById?: string;
  claimedBy?: string;
  partners: { id: string; name: string }[];
  currentPartnerId?: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function assign(partnerId: string | null) {
    setError(null);
    startTransition(async () => {
      try {
        await claimLead(leadId, partnerId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't update the claim");
      }
    });
  }

  if (readOnly) {
    if (!claimedBy) return null;
    return (
      <Card className="p-5 flex flex-col gap-3">
        <Label gold>Lead owner</Label>
        <div className="flex items-center gap-2.5">
          <Avatar initials={initialsOf(claimedBy)} size="lg" />
          <span className="text-[14px] text-bone">{claimedBy}</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 flex flex-col gap-3">
      <Label gold>Lead owner</Label>
      {claimedBy ? (
        <div className="flex items-center gap-2.5">
          <Avatar initials={initialsOf(claimedBy)} size="lg" />
          <span className="text-[14px] text-bone">{claimedBy}</span>
        </div>
      ) : (
        <p className="text-[12px] text-bone-mute">
          Nobody's on this one yet — claim it or hand it to a partner.
        </p>
      )}
      <div className="flex items-center gap-2">
        <Select
          value={claimedById ?? ""}
          onChange={(e) => assign(e.target.value || null)}
          disabled={pending}
        >
          <option value="">Unclaimed</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        {!claimedById && currentPartnerId && (
          <Button
            variant="secondary"
            size="md"
            className="shrink-0"
            onClick={() => assign(currentPartnerId)}
            disabled={pending}
          >
            <UserCheck size={13} strokeWidth={1.5} />
            {pending ? "Claiming…" : "Claim"}
          </Button>
        )}
      </div>
      {error && <p className="text-[12px] text-flag-red">{error}</p>}
    </Card>
  );
}
