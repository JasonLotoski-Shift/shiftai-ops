import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { Button } from "@/components/ui";
import { ClientDetailTabs } from "@/components/client-detail-tabs";
import { prisma } from "@/lib/prisma";
import { industryLabels } from "@/lib/data/seed";
import { ArrowLeft, FolderOpen, Terminal } from "lucide-react";

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
    },
  });
  if (!client) notFound();

  return (
    <>
      <Header
        eyebrow={`${industryLabels[client.industry]} · ${client.revenue}`}
        title={client.company}
        actions={
          <>
            <Button variant="ghost" size="sm">
              <FolderOpen size={13} strokeWidth={1.5} />
              Open Drive folder
            </Button>
            <Button variant="secondary" size="sm">
              <Terminal size={13} strokeWidth={1.5} />
              Open workspace
            </Button>
            <Button variant="primary" size="sm">+ New project</Button>
          </>
        }
      />

      <div className="px-8 py-6">
        <Link href="/clients" className="label hover:text-bone flex items-center gap-2">
          <ArrowLeft size={12} strokeWidth={1.5} />
          Back to clients
        </Link>
      </div>

      <div className="px-8 pb-12">
        <ClientDetailTabs
          client={client}
          partner={client.partnerLead}
          contact={client.primaryContact}
          billingContact={client.billingContact ?? client.primaryContact}
          clientProjects={client.projects}
          clientInvoices={client.invoices}
        />
      </div>
    </>
  );
}
