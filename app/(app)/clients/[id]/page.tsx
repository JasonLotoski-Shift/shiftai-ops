import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { Button } from "@/components/ui";
import { ClientDetailTabs } from "@/components/client-detail-tabs";
import { ClientActionsPanel } from "@/components/client-header-actions";
import { prisma } from "@/lib/prisma";
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
    },
  });
  if (!client) notFound();

  return (
    <>
      <Header
        eyebrow={`${industryLabels[client.industry]} · ${client.revenue}`}
        title={client.company}
        actions={<Button variant="primary" size="sm">+ New project</Button>}
      />

      <div className="px-8 py-8 flex flex-col gap-8">
        <ClientActionsPanel
          clientId={client.id}
          company={client.company}
          driveFolderUrl={client.driveFolderUrl}
          workspacePath={client.workspacePath}
        />

        <Link href="/clients" className="label hover:text-bone flex items-center gap-2 w-fit">
          <ArrowLeft size={12} strokeWidth={1.5} />
          Back to clients
        </Link>

        <ClientDetailTabs
          client={client}
          partner={client.partnerLead}
          contact={client.primaryContact}
          billingContact={client.billingContact ?? client.primaryContact}
          clientProjects={client.projects}
          clientInvoices={client.invoices}
          clientArtifacts={client.artifacts}
        />
      </div>
    </>
  );
}
