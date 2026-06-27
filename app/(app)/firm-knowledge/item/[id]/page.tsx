import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, ExternalLink, ShieldAlert, AlertTriangle } from "lucide-react";
import { Header } from "@/components/header";
import { Card, Badge, Avatar } from "@/components/ui";
import { KnowledgeApproveButton } from "@/components/knowledge-approve-button";
import { prisma } from "@/lib/prisma";
import { currentIsManagingPartner } from "@/lib/permissions";
import { createSignedDownloadUrl, FIRM_KNOWLEDGE_BUCKET } from "@/lib/storage";
import { formatDate } from "@/lib/format";

// KnowledgeItem detail — Tier-2 uploaded document. Shows the curated summary, the
// extracted full text, provenance/governance, version chain, and a signed
// download link to the original file. Approving flips reviewStatus to `approved`,
// the only state fetchHistoricalKnowledge() will return to a skill.

export default async function KnowledgeItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [item, isManaging] = await Promise.all([
    prisma.knowledgeItem.findUnique({
      where: { id },
      include: {
        owner: { select: { name: true, initials: true } },
        category: { select: { label: true, steward: { select: { name: true, initials: true } } } },
        supersedes: { select: { id: true, title: true, createdAt: true } },
        supersededBy: { select: { id: true, title: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        client: { select: { id: true, company: true } },
      },
    }),
    currentIsManagingPartner(),
  ]);

  if (!item) notFound();
  if (item.sensitivity === "managing_partner" && !isManaging) notFound();

  const downloadUrl = item.storagePath
    ? await createSignedDownloadUrl(FIRM_KNOWLEDGE_BUCKET, item.storagePath, 300)
    : null;

  const approved = item.reviewStatus === "approved";

  return (
    <>
      <Header eyebrow={item.category?.label ?? "Firm knowledge"} title={item.title} />

      <div className="px-8 py-8 flex flex-col gap-8 max-w-[1000px]">
        <Link href="/firm-knowledge" className="label hover:text-bone flex items-center gap-2 w-fit">
          <ArrowLeft size={12} strokeWidth={1.5} />
          Back to firm knowledge
        </Link>

        {/* Status + actions strip */}
        <div className="flex items-center gap-3 flex-wrap">
          <Badge tone="neutral" className="gap-1.5">
            <FileText size={11} strokeWidth={1.5} />
            {item.fileName ?? "Document"}
          </Badge>
          {item.sensitivity === "managing_partner" && (
            <Badge tone="gold" className="gap-1">
              <ShieldAlert size={11} strokeWidth={1.5} />
              MP only
            </Badge>
          )}
          <Badge tone={approved ? "green" : "neutral"}>{approved ? "Approved" : "Draft"}</Badge>
          {item.parseStatus === "pending" && <Badge tone="neutral">Parsing…</Badge>}
          {item.parseStatus === "failed" && <Badge tone="orange">Parse failed</Badge>}
          {item.parseStatus === "empty" && <Badge tone="orange">No extractable text</Badge>}

          <div className="ml-auto flex items-center gap-3">
            {downloadUrl && (
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="label hover:text-bone flex items-center gap-1.5"
              >
                <ExternalLink size={12} strokeWidth={1.5} />
                Download original
              </a>
            )}
            {!approved && item.parseStatus !== "pending" && <KnowledgeApproveButton id={item.id} kind="item" />}
          </div>
        </div>

        {item.parseError && (
          <div className="flex items-start gap-2 text-[12px] text-signal-warming">
            <AlertTriangle size={14} strokeWidth={1.5} className="shrink-0 mt-0.5" />
            <span>{item.parseError}</span>
          </div>
        )}

        {/* Summary */}
        <Card className="p-6 flex flex-col gap-2">
          <span className="label">Summary</span>
          {item.summary ? (
            <p className="text-[14px] text-bone leading-relaxed whitespace-pre-wrap">{item.summary}</p>
          ) : (
            <p className="text-[13px] text-bone-mute">
              {item.parseStatus === "pending" ? "Being parsed — refresh in a moment." : "No summary yet."}
            </p>
          )}
        </Card>

        {/* Provenance / governance */}
        <Card className="p-6 grid grid-cols-2 gap-x-8 gap-y-4">
          <Meta label="Owner">
            {item.owner ? (
              <span className="flex items-center gap-2">
                <Avatar initials={item.owner.initials} size="sm" />
                <span className="text-[13px] text-bone">{item.owner.name}</span>
              </span>
            ) : (
              <span className="text-bone-mute text-[13px]">Unassigned</span>
            )}
          </Meta>
          <Meta label="Category">
            <span className="text-[13px] text-bone-dim">{item.category?.label ?? "Uncategorised"}</span>
          </Meta>
          <Meta label="Source">
            <span className="text-[13px] text-bone-dim capitalize">{item.source}</span>
          </Meta>
          <Meta label="Confidence">
            <span className="text-[13px] text-bone-dim">{item.confidence ?? "—"}</span>
          </Meta>
          <Meta label="Added by">
            <span className="text-[13px] text-bone-dim">{item.createdBy} · {formatDate(item.createdAt.toISOString())}</span>
          </Meta>
          <Meta label="Last verified">
            <span className="text-[13px] text-bone-dim">
              {item.lastVerifiedAt ? formatDate(item.lastVerifiedAt.toISOString()) : "Never"}
            </span>
          </Meta>
          {item.client && (
            <Meta label="Source client">
              <Link href={`/clients/${item.client.id}`} className="text-[13px] text-track-gold hover:underline">
                {item.client.company}
              </Link>
            </Meta>
          )}
        </Card>

        {/* Versions */}
        {(item.supersedes || item.supersededBy.length > 0) && (
          <Card className="p-6 flex flex-col gap-3">
            <span className="label">Version history</span>
            {item.supersededBy.map((v) => (
              <Link key={v.id} href={`/firm-knowledge/item/${v.id}`} className="text-[13px] text-bone-dim hover:text-bone">
                Newer: {v.title} · {formatDate(v.createdAt.toISOString())}
              </Link>
            ))}
            {item.supersedes && (
              <Link
                href={`/firm-knowledge/item/${item.supersedes.id}`}
                className="text-[13px] text-bone-dim hover:text-bone"
              >
                Replaces: {item.supersedes.title} · {formatDate(item.supersedes.createdAt.toISOString())}
              </Link>
            )}
          </Card>
        )}

        {/* Full extracted text */}
        <Card className="p-6 flex flex-col gap-3">
          <span className="label">Extracted text</span>
          {item.extractedText ? (
            <pre className="text-[12px] text-bone-dim leading-relaxed whitespace-pre-wrap font-sans max-h-[600px] overflow-y-auto">
              {item.extractedText}
            </pre>
          ) : (
            <p className="text-[13px] text-bone-mute">No text extracted.</p>
          )}
        </Card>
      </div>
    </>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}
