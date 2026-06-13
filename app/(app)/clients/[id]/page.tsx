import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { ClientDetailTabs } from "@/components/client-detail-tabs";
import { ClientActionsPanel } from "@/components/client-header-actions";
import { NewProjectButton } from "@/components/new-project-modal";
import { DiscoverySurveyCard } from "@/components/discovery-survey-card";
import { prisma } from "@/lib/prisma";
import { ranAtBySkill, savedAtBySkill } from "@/lib/action-status";
import { industryLabels } from "@/lib/data/seed";
import { ArrowLeft } from "lucide-react";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      partnerLead: true,
      primaryContact: true,
      billingContact: true,
      projects: { orderBy: { startDate: "desc" } },
      invoices: { orderBy: { issuedAt: "desc" } },
      artifacts: { orderBy: { createdAt: "desc" } },
      discoverySurveys: { orderBy: { createdAt: "desc" }, take: 1 },
      // People card (D40) — everyone linked to this company, primaries first
      contactLinks: {
        include: { contact: { select: { id: true, name: true, title: true, company: true } } },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!client) notFound();

  // Picker universe for the add-person flow — every contact on file.
  const allContacts = await prisma.contact.findMany({
    select: { id: true, name: true, title: true, company: true },
    orderBy: { name: "asc" },
  });

  // Actions panel run-status (green) + saved step-1 drafts (orange). Box keys
  // map to generatedFromSkill: discovery-report → "discovery-report", sow → "sow".
  const [clientRanAt, clientSavedAt] = await Promise.all([
    ranAtBySkill({ clientId: id }),
    savedAtBySkill({ clientId: id }),
  ]);
  const actionRanAt: Record<string, Date | undefined> = {
    "discovery-report": clientRanAt["discovery-report"],
    sow: clientRanAt["sow"],
  };
  const actionSavedAt: Record<string, Date | undefined> = {
    "discovery-report": clientSavedAt["discovery-report"],
    sow: clientSavedAt["sow"],
  };

  const survey = client.discoverySurveys[0];
  const surveyCard = survey
    ? {
        status: survey.status as "draft" | "sent" | "responded",
        title: survey.title,
        tallyFormUrl: survey.tallyFormUrl,
        respondentName: survey.respondentName,
        respondentEmail: survey.respondentEmail,
        submittedAt: survey.submittedAt ? survey.submittedAt.toISOString() : null,
        driveUrl: survey.driveUrl,
        answers: Array.isArray(survey.answers) ? (survey.answers as { label: string; value: string }[]) : null,
      }
    : null;

  return (
    <>
      <Header
        eyebrow={`${industryLabels[client.industry]} · ${client.revenue}`}
        title={client.company}
        actions={<NewProjectButton clientId={client.id} />}
      />

      <div className="px-8 py-8 flex flex-col gap-8">
        <ClientActionsPanel
          clientId={client.id}
          company={client.company}
          driveFolderUrl={client.driveFolderUrl}
          workspacePath={client.workspacePath}
          ranAt={actionRanAt}
          savedAt={actionSavedAt}
        />

        <Link href="/clients" className="label hover:text-bone flex items-center gap-2 w-fit">
          <ArrowLeft size={12} strokeWidth={1.5} />
          Back to clients
        </Link>

        {surveyCard && (
          <DiscoverySurveyCard survey={surveyCard} dealId={survey?.dealId ?? null} company={client.company} />
        )}

        <ClientDetailTabs
          client={client}
          partner={client.partnerLead}
          contact={client.primaryContact}
          billingContact={client.billingContact ?? client.primaryContact}
          clientProjects={client.projects}
          clientInvoices={client.invoices}
          clientArtifacts={client.artifacts}
          contactLinks={client.contactLinks}
          allContacts={allContacts}
        />
      </div>
    </>
  );
}
