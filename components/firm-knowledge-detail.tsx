"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Card, CardBody, Badge, Tabs, Avatar, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { humanizeType } from "@/components/firm-knowledge-browser";
import { ExternalLink, FileText, History, Activity, ShieldAlert } from "lucide-react";

export type KnowledgeDetail = {
  id: string;
  title: string;
  type: string;
  driveUrl: string;
  categoryLabel: string | null;
  stewardName: string | null;
  stewardInitials: string | null;
  ownerName: string | null;
  ownerInitials: string | null;
  sensitivity: string;
  confidence: string | null;
  createdBy: string;
  generatedFromSkill: string | null;
  createdAt: string;
  lastVerifiedAt: string | null;
  supersedes: { id: string; title: string; createdAt: string } | null;
  supersededBy: { id: string; title: string; createdAt: string }[];
};

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-3 border-b border-graphite/60 last:border-0">
      <span className="label shrink-0">{label}</span>
      <span className="text-[13px] text-bone text-right min-w-0">{children}</span>
    </div>
  );
}

export function FirmKnowledgeDetail({ item }: { item: KnowledgeDetail }) {
  const [tab, setTab] = useState("content");

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        tabs={[
          { key: "content", label: "Content" },
          { key: "metadata", label: "Metadata & provenance" },
          { key: "versions", label: "Versions", count: item.supersededBy.length + (item.supersedes ? 1 : 0) + 1 },
          { key: "usage", label: "Usage" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "content" && (
        <Card>
          <CardBody className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Badge tone="neutral">{humanizeType(item.type)}</Badge>
              {item.sensitivity === "managing_partner" && (
                <Badge tone="gold" className="gap-1">
                  <ShieldAlert size={11} strokeWidth={1.5} />
                  Managing partner only
                </Badge>
              )}
            </div>
            <p className="text-[13px] text-bone-dim leading-relaxed max-w-[60ch]">
              This document lives in the firm's Drive. Inline preview and full-text — so AI skills can read the
              contents — arrive with the upload + ingest phase. For now, open it in Drive.
            </p>
            <a
              href={item.driveUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 h-9 px-4 w-fit rounded-[var(--radius)] bg-asphalt border border-graphite text-bone text-[13px] hover:border-bone-mute transition-colors"
            >
              <ExternalLink size={14} strokeWidth={1.5} />
              Open in Drive
            </a>
          </CardBody>
        </Card>
      )}

      {tab === "metadata" && (
        <Card>
          <CardBody>
            <MetaRow label="Category">
              {item.categoryLabel ?? <span className="text-bone-mute">Uncategorised</span>}
            </MetaRow>
            <MetaRow label="Steward">
              {item.stewardName ? (
                <span className="inline-flex items-center gap-2">
                  <Avatar initials={item.stewardInitials ?? ""} size="sm" />
                  {item.stewardName}
                </span>
              ) : (
                <span className="text-bone-mute">No steward</span>
              )}
            </MetaRow>
            <MetaRow label="Owner">
              {item.ownerName ? (
                <span className="inline-flex items-center gap-2">
                  <Avatar initials={item.ownerInitials ?? ""} size="sm" />
                  {item.ownerName}
                </span>
              ) : (
                <span className="text-bone-mute">Unassigned</span>
              )}
            </MetaRow>
            <MetaRow label="Sensitivity">
              {item.sensitivity === "managing_partner" ? "Managing partner only" : "Firm-wide"}
            </MetaRow>
            <MetaRow label="Confidence">
              {item.confidence ? (
                <span className="capitalize">{item.confidence}</span>
              ) : (
                <span className="text-bone-mute">Not set</span>
              )}
            </MetaRow>
            <MetaRow label="Source">
              {item.generatedFromSkill ? `${item.createdBy} · ${item.generatedFromSkill}` : item.createdBy}
            </MetaRow>
            <MetaRow label="Added">{formatDate(item.createdAt)}</MetaRow>
            <MetaRow label="Last verified">
              {item.lastVerifiedAt ? formatDate(item.lastVerifiedAt) : <span className="text-bone-mute">Never</span>}
            </MetaRow>
          </CardBody>
        </Card>
      )}

      {tab === "versions" && (
        <Card>
          <CardBody className="flex flex-col gap-1">
            {item.supersededBy.map((v) => (
              <Link
                key={v.id}
                href={`/firm-knowledge/${v.id}`}
                className="flex items-center justify-between gap-3 py-2.5 border-b border-graphite/60 hover:text-bone"
              >
                <span className="flex items-center gap-2 text-[13px] text-bone-dim">
                  <History size={13} strokeWidth={1.5} />
                  {v.title}
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone="neutral">Newer</Badge>
                  <span className="text-[11px] text-bone-mute">{formatDate(v.createdAt)}</span>
                </span>
              </Link>
            ))}

            <div className="flex items-center justify-between gap-3 py-2.5 border-b border-graphite/60">
              <span className="flex items-center gap-2 text-[13px] text-bone">
                <FileText size={13} strokeWidth={1.5} />
                {item.title}
              </span>
              <span className="flex items-center gap-2">
                <Badge tone="gold">This version</Badge>
                <span className="text-[11px] text-bone-mute">{formatDate(item.createdAt)}</span>
              </span>
            </div>

            {item.supersedes && (
              <Link
                href={`/firm-knowledge/${item.supersedes.id}`}
                className="flex items-center justify-between gap-3 py-2.5 hover:text-bone"
              >
                <span className="flex items-center gap-2 text-[13px] text-bone-dim">
                  <History size={13} strokeWidth={1.5} />
                  {item.supersedes.title}
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone="neutral">Replaced</Badge>
                  <span className="text-[11px] text-bone-mute">{formatDate(item.supersedes.createdAt)}</span>
                </span>
              </Link>
            )}

            {!item.supersedes && item.supersededBy.length === 0 && (
              <p className="text-[12px] text-bone-mute py-2">Only version — nothing has replaced this and it replaces nothing.</p>
            )}
          </CardBody>
        </Card>
      )}

      {tab === "usage" && (
        <Card>
          <EmptyState
            icon={<Activity size={28} strokeWidth={1.5} />}
            title="No usage yet"
            hint="Once AI skills can retrieve firm knowledge, this tab will show which skills and deliverables referenced this item."
          />
        </Card>
      )}
    </div>
  );
}
