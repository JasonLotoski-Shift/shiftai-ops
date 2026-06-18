"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, FileText, FileSearch, Pencil, Trash2, ClipboardList, CalendarPlus, FlaskConical, Presentation, FileQuestion, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui";
import { ActionsPanel, type ActionBox } from "@/components/actions-panel";
import { ConvertDealModal } from "@/components/convert-deal-modal";
import { DraftProposalModal } from "@/components/draft-proposal-modal";
import { DealEditModal } from "@/components/deal-edit-modal";
import { DeleteDealModal } from "@/components/delete-deal-modal";
import { DealDocModal, type DealDocSkill } from "@/components/deal-doc-modal";
import { DraftEmailModal } from "@/components/draft-email-modal";
import { ProposalEngineModal } from "@/components/proposal-engine-modal";
import { DeckBuildModal } from "@/components/deck-build-modal";
import { DiscoveryQuestionnaireModal } from "@/components/discovery-questionnaire-modal";
import { DiscoveryReportDealModal } from "@/components/discovery-report-deal-modal";
import type {
  DealModel as Deal,
  PartnerModel as Partner,
  ContactModel as Contact,
} from "@/lib/generated/prisma/models";

// Pre-filled follow-up email brief for the post-discovery step — seeds the
// shared DraftEmailModal (draft-email skill). Plain string helper; the existing
// email save/send path persists the result (Artifact + Interaction).
function followupEmailPurpose(company: string, surveyUrl?: string): string {
  const base = `Follow up after our discovery call with ${company}. Thank them for their time, recap the one or two things we heard (their pain, where they are with AI), restate the value of working with Shift, and propose the next step — a discussion call or a scoped proposal. Keep it short; use only real points from the logged interactions; invent nothing.`;
  return surveyUrl
    ? `${base} Include this short questionnaire link near the end and ask them to fill it in so we can tailor the next step to their business: ${surveyUrl}`
    : base;
}

// Per-skill copy for the generic deal-doc modal.
const DOC_META: Record<DealDocSkill, { title: string; icon: LucideIcon; focusLabel: string; focusPlaceholder: string }> = {
  "discovery-prep": {
    title: "Discovery prep",
    icon: ClipboardList,
    focusLabel: "What do you want out of this discovery call?",
    focusPlaceholder: "e.g. Understand their ops pain and AI maturity; qualify budget + decision process; earn a discussion call",
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
  const [deleteOpen, setDeleteOpen] = useState(false);

  const signed = deal.stage === "signed";

  return (
    <>
      {!signed && (
        <>
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil size={13} strokeWidth={1.5} />
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={13} strokeWidth={1.5} className="text-flag-red" />
            Delete
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

      {editOpen && <DealEditModal deal={deal} onClose={() => setEditOpen(false)} />}
      {deleteOpen && (
        <DeleteDealModal dealId={deal.id} company={deal.company} onClose={() => setDeleteOpen(false)} />
      )}
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
  hasSow = false,
  surveyUrl,
  surveyResponded = false,
  ranAt = {},
  savedAt = {},
}: {
  deal: Deal;
  partner: Partner | null;
  contact: Contact | null;
  /** Whether a prototype Artifact already exists — gates the deck action. */
  hasPrototype?: boolean;
  /** Whether a scope-of-work Artifact already exists — also gates the deck action. */
  hasSow?: boolean;
  /** Latest sent discovery-questionnaire URL — injected into the follow-up email. */
  surveyUrl?: string;
  /** Whether a completed questionnaire backs the deal — drives the discovery
   *  report modal's copy (answers-primary vs best-guess-from-call). */
  surveyResponded?: boolean;
  /** box key → last run date (green "last ran" state). */
  ranAt?: Record<string, Date | undefined>;
  /** box key → saved step-1 draft date (orange "step 1 of 2 saved" state). */
  savedAt?: Record<string, Date | undefined>;
}) {
  const [proposalOpen, setProposalOpen] = useState(false);
  const [docSkill, setDocSkill] = useState<DealDocSkill | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [prototypeOpen, setPrototypeOpen] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // Which boxes are being reopened from a saved draft (preload + jump to editor).
  const [reopen, setReopen] = useState<Record<string, boolean>>({});

  const signed = deal.stage === "signed";

  // Auto-open from a deep link (?qa=proposal | ?qa=questionnaire).
  const searchParams = useSearchParams();
  const qa = searchParams.get("qa");
  const qaProposal = qa === "proposal";
  useEffect(() => {
    if (qaProposal) setProposalOpen(true);
    if (qa === "questionnaire") setQuestionnaireOpen(true);
  }, [qaProposal, qa]);

  if (signed) return null;

  // Attach run/saved status by box key + route an orange (saved) box's click to
  // reopen the editor preloaded from the ActionDraft.
  const status = (key: string): Pick<ActionBox, "ranAt" | "stepOneSavedAt"> => ({
    ranAt: ranAt[key],
    stepOneSavedAt: savedAt[key],
  });
  const openReopen = (key: string, open: () => void) => () => {
    if (savedAt[key]) setReopen((r) => ({ ...r, [key]: true }));
    open();
  };

  // Boxes are grouped into numbered steps by `stage` — the deal's order of work:
  // Discovery → Prototype → Proposal (the scope of work, then the deck built from it).
  const actions: ActionBox[] = [
    {
      key: "discovery-prep",
      icon: ClipboardList,
      title: "Discovery prep",
      description: "Brief for the discovery call — goals and questions to ask.",
      onClick: openReopen("discovery-prep", () => setDocSkill("discovery-prep")),
      stage: "Discovery",
      info: {
        does: "Reads everything logged on this deal and writes an internal brief for the discovery call: the goals to hit and the questions to ask.",
        happens: "Drafts a prep doc you can edit, then saves it to the deal's Drive folder.",
      },
      ...status("discovery-prep"),
    },
    {
      key: "questionnaire",
      icon: FileQuestion,
      title: "Discovery questionnaire",
      description: "Generate a client-specific Tally form to send after the call.",
      onClick: openReopen("questionnaire", () => setQuestionnaireOpen(true)),
      stage: "Discovery",
      info: {
        does: "Generates a short, client-specific Tally questionnaire to send after the discovery call.",
        happens: "Creates a live Tally form; the link goes in the follow-up email and the answers feed the discovery report.",
      },
      ...status("questionnaire"),
    },
    {
      key: "discovery-report",
      icon: FileSearch,
      title: "Discovery report",
      description: surveyResponded
        ? "Client-facing report from the questionnaire answers."
        : "Client-facing report from the call, notes + research (no survey needed).",
      onClick: openReopen("discovery-report", () => setReportOpen(true)),
      stage: "Discovery",
      info: {
        does: "Writes a client-facing report from the call, your notes, the questionnaire answers (if any), and web research.",
        happens: "Drafts a report you edit, then saves it to Drive as a deal Artifact.",
      },
      ...status("discovery-report"),
    },
    ...(contact
      ? [
          {
            key: "followup",
            icon: Mail,
            title: "Follow-up email",
            description: "Recap the call and propose the next step.",
            onClick: () => setEmailOpen(true),
            stage: "Discovery",
            info: {
              does: "Drafts a short email that recaps the call and proposes the next step, using only what's logged.",
              happens: "Drafts an email you edit; sending or saving logs it on the contact and files a copy.",
            },
            ...status("followup"),
          } as ActionBox,
        ]
      : []),
    {
      key: "book-meeting",
      icon: CalendarPlus,
      title: "Book meeting",
      description: "Draft a short message to book the next call.",
      onClick: openReopen("book-meeting", () => setDocSkill("book-meeting")),
      stage: "Discovery",
      info: {
        does: "Drafts a short, specific message to book the next call.",
        happens: "Drafts a note you can edit and save.",
      },
      ...status("book-meeting"),
    },
    {
      key: "build-prototype",
      icon: FlaskConical,
      title: "Build prototype",
      description: "Build an interactive HTML prototype of what we'd ship.",
      onClick: () => setPrototypeOpen(true),
      stage: "Prototype",
      info: {
        does: "Builds an interactive HTML prototype of what we'd ship, from the deal's files — multi-tab, clickable, with mockup data.",
        happens: "Opens a build view in a new tab; an agent drafts, screenshots, and improves it over a few rounds. Saves as a draft you refine once and approve.",
      },
      ...status("build-prototype"),
    },
    {
      key: "draft-sow",
      icon: FileText,
      title: "Draft scope",
      description: "High-level scope of work, built from the prototype.",
      onClick: openReopen("draft-sow", () => setProposalOpen(true)),
      stage: "Proposal",
      info: {
        does: "Reads the prototype and everything logged on this deal and writes a high-level scope: the problem, what we'll build, the foundation we set up first (environment, data and API connections, access), phases, what you own, what we need from you, timeline, and fixed fee.",
        happens: "Saves an editable scope of work to the deal's Drive folder. Won't save if it had to guess a fee or date — those show as [NEEDS INPUT] for you to fill.",
      },
      ...status("draft-sow"),
    },
    {
      key: "build-deck",
      icon: Presentation,
      title: "Build deck",
      description: "Render the scope + prototype into an on-brand pitch deck.",
      onClick: () => setDeckOpen(true),
      disabled: !hasPrototype || !hasSow,
      disabledReason: !hasPrototype
        ? "Build a prototype first — the deck links to it"
        : "Draft the scope of work first — the deck is built from it",
      stage: "Proposal",
      info: {
        does: "Turns the approved scope of work and the prototype into an on-brand HTML pitch deck that carries the scope and has a live Demo prototype button.",
        happens: "Opens a build view in a new tab; an agent renders the deck and improves it over a few rounds. Saves as a draft you refine once and approve. Needs a prototype and a scope of work first.",
      },
      ...status("build-deck"),
    },
  ];

  return (
    <>
      <ActionsPanel actions={actions} forceOpen={qaProposal || qa === "questionnaire"} />

      {proposalOpen && (
        <DraftProposalModal
          dealId={deal.id}
          company={deal.company}
          reopenDraft={!!reopen["draft-sow"]}
          onClose={() => {
            setProposalOpen(false);
            setReopen((r) => ({ ...r, "draft-sow": false }));
          }}
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
          reopenDraft={!!reopen[docSkill]}
          onClose={() => {
            const skill = docSkill;
            setDocSkill(null);
            setReopen((r) => ({ ...r, [skill]: false }));
          }}
        />
      )}

      {emailOpen && contact && (
        <DraftEmailModal
          contactId={contact.id}
          contactName={contact.name}
          partnerName={partner?.name}
          defaultPurpose={followupEmailPurpose(deal.company, surveyUrl)}
          onClose={() => setEmailOpen(false)}
        />
      )}

      {/* Note: the follow-up email persists to the deal's contact, so its
          run-status + saved-draft live on the contact page, not here. */}

      {prototypeOpen && (
        <ProposalEngineModal
          dealId={deal.id}
          company={deal.company}
          onClose={() => setPrototypeOpen(false)}
        />
      )}

      {deckOpen && (
        <DeckBuildModal
          dealId={deal.id}
          company={deal.company}
          onClose={() => setDeckOpen(false)}
        />
      )}

      {questionnaireOpen && (
        <DiscoveryQuestionnaireModal
          dealId={deal.id}
          company={deal.company}
          reopenDraft={!!reopen["questionnaire"]}
          onClose={() => {
            setQuestionnaireOpen(false);
            setReopen((r) => ({ ...r, questionnaire: false }));
          }}
        />
      )}

      {reportOpen && (
        <DiscoveryReportDealModal
          dealId={deal.id}
          company={deal.company}
          surveyResponded={surveyResponded}
          reopenDraft={!!reopen["discovery-report"]}
          onClose={() => {
            setReportOpen(false);
            setReopen((r) => ({ ...r, "discovery-report": false }));
          }}
        />
      )}
    </>
  );
}
