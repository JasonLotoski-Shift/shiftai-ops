"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, FileText, Pencil, ClipboardList, ListChecks, CalendarPlus, FlaskConical, Presentation, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui";
import { ActionsPanel, type ActionBox } from "@/components/actions-panel";
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

/* ──────────────────────────────────────────────────────────────────────
   Header buttons — the deal's primary CTAs (Edit + Convert → Client). The
   AI/doc actions live in DealActionsPanel (under the title). Kept here so the
   header keeps its main workflow buttons.
   ────────────────────────────────────────────────────────────────────── */

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
  const [editOpen, setEditOpen] = useState(false);

  const signed = deal.stage === "signed";

  return (
    <>
      {!signed && (
        <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil size={13} strokeWidth={1.5} />
          Edit
        </Button>
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

      {editOpen && <DealEditModal deal={deal} onClose={() => setEditOpen(false)} />}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Actions panel — the AI/doc generators, as explainer boxes under the title.
   Hidden once the deal is signed (those actions belong to the open pipeline).
   ────────────────────────────────────────────────────────────────────── */

export function DealActionsPanel({
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
  const [proposalOpen, setProposalOpen] = useState(false);
  const [docSkill, setDocSkill] = useState<DealDocSkill | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [engineMode, setEngineMode] = useState<"prototype" | "deck" | null>(null);

  const signed = deal.stage === "signed";

  // Auto-open from the dashboard Quick Action (routes here with ?qa=proposal).
  const searchParams = useSearchParams();
  const qaProposal = searchParams.get("qa") === "proposal";
  useEffect(() => {
    if (qaProposal) setProposalOpen(true);
  }, [qaProposal]);

  if (signed) return null;

  const actions: ActionBox[] = [
    {
      key: "discovery-prep",
      icon: ClipboardList,
      title: "Discovery prep",
      description: "Brief for the discovery call — goals and questions to ask.",
      onClick: () => setDocSkill("discovery-prep"),
    },
    ...(contact
      ? [
          {
            key: "followup",
            icon: Mail,
            title: "Follow-up email",
            description: "Recap the call and propose the next step.",
            onClick: () => setEmailOpen(true),
          } as ActionBox,
        ]
      : []),
    {
      key: "survey",
      icon: ListChecks,
      title: "Survey",
      description: "Post-call survey to confirm fit and priorities.",
      onClick: () => setDocSkill("client-survey"),
    },
    {
      key: "book-meeting",
      icon: CalendarPlus,
      title: "Book meeting",
      description: "Draft a short message to book the next call.",
      onClick: () => setDocSkill("book-meeting"),
    },
    {
      key: "draft-proposal",
      icon: FileText,
      title: "Draft proposal",
      description: "Draft a tailored SOW from the IP library.",
      onClick: () => setProposalOpen(true),
    },
    {
      key: "build-prototype",
      icon: FlaskConical,
      title: "Build prototype",
      description: "Build an HTML prototype of what we'd ship.",
      onClick: () => setEngineMode("prototype"),
    },
    {
      key: "build-deck",
      icon: Presentation,
      title: "Build deck",
      description: "Turn the prototype into a pitch deck.",
      onClick: () => setEngineMode("deck"),
      disabled: !hasPrototype,
      disabledReason: "Build a prototype first — the deck links to it",
    },
  ];

  return (
    <>
      <ActionsPanel actions={actions} forceOpen={qaProposal} />

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
    </>
  );
}
