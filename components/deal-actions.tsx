"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui";
import { ConvertDealModal } from "@/components/convert-deal-modal";
import { DraftProposalModal } from "@/components/draft-proposal-modal";
import type {
  DealModel as Deal,
  PartnerModel as Partner,
  ContactModel as Contact,
} from "@/lib/generated/prisma/models";

export function DealActions({
  deal,
  partner,
  contact,
}: {
  deal: Deal;
  partner: Partner | null;
  contact: Contact | null;
}) {
  const [convertOpen, setConvertOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);

  // Auto-open from the dashboard Quick Action (routes here with ?qa=proposal).
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("qa") === "proposal") setProposalOpen(true);
  }, [searchParams]);

  return (
    <>
      <Button variant="ghost" size="sm">
        <Mail size={13} strokeWidth={1.5} />
        Log email
      </Button>
      <Button variant="ghost" size="sm">
        <Calendar size={13} strokeWidth={1.5} />
        Log call
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setProposalOpen(true)}>
        <FileText size={13} strokeWidth={1.5} />
        Draft proposal
      </Button>
      <Button variant="primary" size="sm" onClick={() => setConvertOpen(true)}>
        Convert → Client
      </Button>

      <ConvertDealModal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        deal={deal}
        partner={partner}
        contact={contact}
      />

      {proposalOpen && (
        <DraftProposalModal
          dealId={deal.id}
          company={deal.company}
          onClose={() => setProposalOpen(false)}
        />
      )}
    </>
  );
}
