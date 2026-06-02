"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, FileText, Pencil, ClipboardList, ListChecks, CalendarPlus, FlaskConical, Presentation, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui";
import { ConvertDealModal } from "@/components/convert-deal-modal";
import { DraftProposalModal } from "@/components/draft-proposal-modal";
import { DealEditModal } from "@/components/deal-edit-modal";
import { DealDocModal, type DealDocSkill } from "@/components/deal-doc-modal";
import { DraftEmailModal } from "@/components/draft-email-modal";
import { ProposalEngineModal } from "@/components/proposal-engine-modal";
import type {
  DealModel as Deal,
  PartnerModel as Partner,
  ContactModel as Contact,
} from "@/lib/generated/prisma/models";

// Pre-filled follow-up email brief for the post-discovery step — seeds the
// shared DraftEmailModal (draft-email skill). Plain string helper; the existing
// email save/send path persists the result (Artifact + Interaction).
function followupEmailPurpose(company: string): string {
  return `Follow up after our discovery call with ${company}. Thank them for their time, recap the one or two things we heard (their pain, where they are with AI), restate the value of working with Shift, and propose the next step — a discussion call or a scoped proposal. Keep it short; use only real points from the logged interactions; invent nothing.`;
}

// Per-skill copy for the generic deal-doc modal.
const DOC_META: Record<DealDocSkill, { title: string; icon: LucideIcon; focusLabel: string; focusPlaceholder: string }> = {
  "discovery-prep": {
    title: "Discovery prep",
    icon: ClipboardList,
    focusLabel: "What do you want out of this discovery call?",
    focusPlaceholder: "e.g. Understand their ops pain and AI maturity; qualify budget + decision process; earn a discussion call",
  },
  "client-survey": {
    title: "Post-call survey",
    icon: ListChecks,
    focusLabel: "What should the survey find out?",
    focusPlaceholder: "e.g. Confirm the pain we heard, their priorities, and appetite for a paid pilot",
  },
  "book-meeting": {
    title: "Book a meeting",
    icon: CalendarPlus,
    focusLabel: "What's the meeting for?",
    focusPlaceholder: "e.g. Book the discussion call to walk through what we'd build — propose Tue/Thu next week",
  },
};

export function DealActions({
  deal,
  partner,
  contact,
  hasPrototype = false,
}: {
  deal: Deal;
  partner: Partner | null;
  contact: Contact | null;
  /** Whether a prototype Artifact already exists — gates the deck action. */
  hasPrototype?: boolean;
}) {
  const [convertOpen, setConvertOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [docSkill, setDocSkill] = useState<DealDocSkill | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [engineMode, setEngineMode] = useState<"prototype" | "deck" | null>(null);

  const signed = deal.stage === "signed";

  // Emphasize an action on the stage(s) it belongs to; available (ghost) elsewhere.
  const v = (stages: Deal["stage"][]) => (stages.includes(deal.stage) ? "secondary" : "ghost");

  // Auto-open from the dashboard Quick Action (routes here with ?qa=proposal).
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("qa") === "proposal") setProposalOpen(true);
  }, [searchParams]);

  return (
    <>
      {!signed && (
        <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil size={13} strokeWidth={1.5} />
          Edit
        </Button>
      )}

      {!signed && (
        <>
          <Button variant={v(["discovery"])} size="sm" onClick={() => setDocSkill("discovery-prep")}>
            <ClipboardList size={13} strokeWidth={1.5} />
            Discovery prep
          </Button>
          {contact && (
            <Button variant={v(["discovery", "discussion"])} size="sm" onClick={() => setEmailOpen(true)}>
              <Mail size={13} strokeWidth={1.5} />
              Follow-up email
            </Button>
          )}
          <Button variant={v(["discovery", "discussion"])} size="sm" onClick={() => setDocSkill("client-survey")}>
            <ListChecks size={13} strokeWidth={1.5} />
            Survey
          </Button>
          <Button variant={v(["qualified", "discovery"])} size="sm" onClick={() => setDocSkill("book-meeting")}>
            <CalendarPlus size={13} strokeWidth={1.5} />
            Book meeting
          </Button>
          <Button variant={v(["proposal", "negotiation"])} size="sm" onClick={() => setProposalOpen(true)}>
            <FileText size={13} strokeWidth={1.5} />
            Draft proposal
          </Button>
          <Button variant={v(["proposal"])} size="sm" onClick={() => setEngineMode("prototype")}>
            <FlaskConical size={13} strokeWidth={1.5} />
            Build prototype
          </Button>
          <Button
            variant={v(["proposal"])}
            size="sm"
            onClick={() => setEngineMode("deck")}
            disabled={!hasPrototype}
            title={hasPrototype ? undefined : "Build a prototype first — the deck links to it"}
          >
            <Presentation size={13} strokeWidth={1.5} />
            Build deck
          </Button>
        </>
      )}

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

      {docSkill && (
        <DealDocModal
          dealId={deal.id}
          company={deal.company}
          skill={docSkill}
          title={DOC_META[docSkill].title}
          icon={DOC_META[docSkill].icon}
          focusLabel={DOC_META[docSkill].focusLabel}
          focusPlaceholder={DOC_META[docSkill].focusPlaceholder}
          onClose={() => setDocSkill(null)}
        />
      )}

      {emailOpen && contact && (
        <DraftEmailModal
          contactId={contact.id}
          contactName={contact.name}
          partnerName={partner?.name}
          defaultPurpose={followupEmailPurpose(deal.company)}
          onClose={() => setEmailOpen(false)}
        />
      )}

      {engineMode && (
        <ProposalEngineModal
          dealId={deal.id}
          company={deal.company}
          mode={engineMode}
          onClose={() => setEngineMode(null)}
        />
      )}

      {editOpen && <DealEditModal deal={deal} onClose={() => setEditOpen(false)} />}
    </>
  );
}
