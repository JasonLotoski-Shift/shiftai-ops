import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { Card, CardBody } from "@/components/ui";
import { MemoryEditor, type MemoryBlockItem } from "@/components/memory-editor";
import { prisma } from "@/lib/prisma";

// Recent memory — the few small, partner-approved blocks that load into every
// AI skill's context. Manual in this phase: partners write a draft and approve
// it; a later phase regenerates the drafts weekly from the firm's activity.

export default async function RecentMemoryPage() {
  const blocks = await prisma.memoryBlock.findMany({
    orderBy: { key: "asc" },
    select: {
      key: true,
      label: true,
      description: true,
      draftBody: true,
      approvedBody: true,
      asOf: true,
      approvedAt: true,
      approvedBy: { select: { name: true } },
    },
  });

  const items: MemoryBlockItem[] = blocks.map((b) => ({
    key: b.key,
    label: b.label,
    description: b.description,
    draftBody: b.draftBody,
    approvedBody: b.approvedBody,
    asOf: b.asOf ? b.asOf.toISOString() : null,
    approvedAt: b.approvedAt ? b.approvedAt.toISOString() : null,
    approvedByName: b.approvedBy?.name ?? null,
  }));

  return (
    <>
      <Header eyebrow="Firm knowledge · recent memory" title="Recent memory." />

      <div className="px-8 py-8 flex flex-col gap-8">
        <Link href="/firm-knowledge" className="label hover:text-bone flex items-center gap-2 w-fit">
          <ArrowLeft size={12} strokeWidth={1.5} />
          Back to firm knowledge
        </Link>

        <Card>
          <CardBody className="flex flex-col gap-2">
            <p className="text-[13px] text-bone-dim leading-relaxed max-w-[70ch]">
              These few short notes are the firm's working memory. Every AI action reads the{" "}
              <span className="text-bone">approved</span> version as live context, so it always knows where things
              stand. Edit a draft freely — nothing reaches the AI until you press{" "}
              <span className="text-bone">Approve</span>. Keep each one tight (a few lines, the things that changed),
              and re-approve when it's current.
            </p>
          </CardBody>
        </Card>

        {items.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-[13px] text-bone-mute">
                The recent-memory blocks haven't been created yet. Run the Phase 2 migration to seed them.
              </p>
            </CardBody>
          </Card>
        ) : (
          <MemoryEditor items={items} />
        )}
      </div>
    </>
  );
}
