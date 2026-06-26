import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { FirmKnowledgeDetail, type KnowledgeDetail } from "@/components/firm-knowledge-detail";
import { prisma } from "@/lib/prisma";
import { currentIsManagingPartner } from "@/lib/permissions";

export default async function FirmKnowledgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [artifact, isManaging] = await Promise.all([
    prisma.artifact.findUnique({
      where: { id },
      include: {
        owner: { select: { name: true, initials: true } },
        knowledgeCategory: {
          select: { label: true, slug: true, steward: { select: { name: true, initials: true } } },
        },
        supersedes: { select: { id: true, title: true, createdAt: true } },
        supersededBy: { select: { id: true, title: true, createdAt: true }, orderBy: { createdAt: "desc" } },
      },
    }),
    currentIsManagingPartner(),
  ]);

  if (!artifact) notFound();
  // Don't even reveal that a managing-partner item exists to a non-MP session.
  if (artifact.sensitivity === "managing_partner" && !isManaging) notFound();

  const item: KnowledgeDetail = {
    id: artifact.id,
    title: artifact.title,
    type: artifact.type,
    driveUrl: artifact.driveUrl,
    categoryLabel: artifact.knowledgeCategory?.label ?? null,
    stewardName: artifact.knowledgeCategory?.steward?.name ?? null,
    stewardInitials: artifact.knowledgeCategory?.steward?.initials ?? null,
    ownerName: artifact.owner?.name ?? null,
    ownerInitials: artifact.owner?.initials ?? null,
    sensitivity: artifact.sensitivity,
    confidence: artifact.confidence ?? null,
    createdBy: artifact.createdBy,
    generatedFromSkill: artifact.generatedFromSkill,
    createdAt: artifact.createdAt.toISOString(),
    lastVerifiedAt: artifact.lastVerifiedAt ? artifact.lastVerifiedAt.toISOString() : null,
    supersedes: artifact.supersedes
      ? { id: artifact.supersedes.id, title: artifact.supersedes.title, createdAt: artifact.supersedes.createdAt.toISOString() }
      : null,
    supersededBy: artifact.supersededBy.map((v) => ({
      id: v.id,
      title: v.title,
      createdAt: v.createdAt.toISOString(),
    })),
  };

  return (
    <>
      <Header eyebrow={item.categoryLabel ?? "Firm knowledge"} title={item.title} />

      <div className="px-8 py-8 flex flex-col gap-8">
        <Link href="/firm-knowledge" className="label hover:text-bone flex items-center gap-2 w-fit">
          <ArrowLeft size={12} strokeWidth={1.5} />
          Back to firm knowledge
        </Link>

        <FirmKnowledgeDetail item={item} />
      </div>
    </>
  );
}
