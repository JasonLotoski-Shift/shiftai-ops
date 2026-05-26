import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { Button } from "@/components/ui";
import { ClientDetailTabs } from "@/components/client-detail-tabs";
import { clientById, industryLabels } from "@/lib/data/seed";
import { ArrowLeft, FolderOpen, Terminal } from "lucide-react";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = clientById(id);
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
        <ClientDetailTabs clientId={client.id} />
      </div>
    </>
  );
}
