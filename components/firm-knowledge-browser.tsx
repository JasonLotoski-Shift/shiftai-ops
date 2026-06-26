"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, Badge, SearchInput, EmptyState, Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { Library, AlertTriangle, ChevronRight, ShieldAlert } from "lucide-react";

export type KnowledgeRow = {
  id: string;
  title: string;
  type: string;
  categorySlug: string | null;
  categoryLabel: string | null;
  ownerName: string | null;
  ownerInitials: string | null;
  confidence: string | null;
  sensitivity: string;
  createdBy: string;
  generatedFromSkill: string | null;
  createdAt: string;
  lastVerifiedAt: string | null;
  driveUrl: string;
  isStale: boolean;
};

export type CategoryCard = {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  stewardName: string | null;
  stewardInitials: string | null;
  count: number;
  staleCount: number;
};

const UNCAT = "__uncategorised";

export function humanizeType(t: string): string {
  return t.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function confidenceTone(c: string | null): "green" | "neutral" | "orange" {
  if (c === "high") return "green";
  if (c === "low") return "orange";
  return "neutral";
}

export function FirmKnowledgeBrowser({
  categories,
  rows,
  uncategorised,
}: {
  categories: CategoryCard[];
  rows: KnowledgeRow[];
  uncategorised: number;
}) {
  const [q, setQ] = useState("");
  // null = all; a slug; or UNCAT for the uncategorised bucket.
  const [cat, setCat] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (cat === UNCAT && r.categorySlug) return false;
      if (cat && cat !== UNCAT && r.categorySlug !== cat) return false;
      if (!needle) return true;
      return (
        r.title.toLowerCase().includes(needle) ||
        (r.categoryLabel?.toLowerCase().includes(needle) ?? false) ||
        (r.ownerName?.toLowerCase().includes(needle) ?? false) ||
        humanizeType(r.type).toLowerCase().includes(needle)
      );
    });
  }, [rows, q, cat]);

  const activeLabel =
    cat === UNCAT ? "Uncategorised" : cat ? categories.find((c) => c.slug === cat)?.label ?? null : null;

  return (
    <div className="flex flex-col gap-8">
      {/* Category spine — click a card to filter the table below. */}
      <div className="grid grid-cols-3 gap-4">
        {categories.map((c) => {
          const active = cat === c.slug;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(active ? null : c.slug)}
              className={cn(
                "text-left rounded-[var(--radius-lg)] bg-asphalt shadow-[var(--shadow-sm)] p-5 flex flex-col gap-3 transition-colors",
                "border border-transparent hover:border-bone-mute/40",
                active && "border-track-gold",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="title-md text-bone">{c.label}</span>
                <span className="font-mono tabular-nums text-[20px] leading-none text-bone">{c.count}</span>
              </div>
              {c.description && (
                <p className="text-[12px] text-bone-dim leading-relaxed line-clamp-2">{c.description}</p>
              )}
              <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                <span className="flex items-center gap-2 min-w-0">
                  {c.stewardInitials ? (
                    <>
                      <Avatar initials={c.stewardInitials} size="sm" />
                      <span className="text-[11px] text-bone-mute truncate">{c.stewardName}</span>
                    </>
                  ) : (
                    <span className="label text-[9px]">No steward</span>
                  )}
                </span>
                {c.staleCount > 0 && (
                  <Badge tone="orange" className="gap-1">
                    <AlertTriangle size={11} strokeWidth={1.5} />
                    {c.staleCount} to review
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="w-[360px]">
          <SearchInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search firm knowledge…"
          />
        </div>
        {activeLabel && (
          <button
            type="button"
            onClick={() => setCat(null)}
            className="label hover:text-bone flex items-center gap-1.5"
          >
            {activeLabel} ✕
          </button>
        )}
        <span className="ml-auto label">
          {filtered.length} item{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Table */}
      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Library size={28} strokeWidth={1.5} />}
            title={rows.length === 0 ? "No firm knowledge yet" : "Nothing matches that filter"}
            hint={
              rows.length === 0
                ? "Firm-wide documents show up here. Document upload and ingest arrive in a later phase."
                : "Try a different category or search term."
            }
          />
        ) : (
          <div>
            {/* Header row */}
            <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-graphite">
              <span className="label">Title</span>
              <span className="label">Category</span>
              <span className="label">Steward / verified</span>
              <span className="label sr-only">Open</span>
            </div>
            {filtered.map((r) => (
              <Link
                key={r.id}
                href={`/firm-knowledge/${r.id}`}
                className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 px-5 py-3.5 items-center border-b border-graphite/60 last:border-0 hover:bg-[var(--color-row-hover)] transition-colors"
              >
                {/* Title + type + flags */}
                <span className="flex flex-col gap-1 min-w-0">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[14px] text-bone truncate">{r.title}</span>
                    {r.sensitivity === "managing_partner" && (
                      <Badge tone="gold" className="gap-1 shrink-0">
                        <ShieldAlert size={11} strokeWidth={1.5} />
                        MP only
                      </Badge>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone="neutral">{humanizeType(r.type)}</Badge>
                    {r.confidence && <Badge tone={confidenceTone(r.confidence)}>{r.confidence} confidence</Badge>}
                  </span>
                </span>

                {/* Category */}
                <span className="text-[13px] text-bone-dim truncate">
                  {r.categoryLabel ?? <span className="text-bone-mute">Uncategorised</span>}
                </span>

                {/* Steward + verified / stale */}
                <span className="flex items-center gap-2 min-w-0">
                  {r.ownerInitials ? (
                    <Avatar initials={r.ownerInitials} size="sm" />
                  ) : (
                    <span className="text-[11px] text-bone-mute">—</span>
                  )}
                  {r.isStale ? (
                    <Badge tone="orange" className="gap-1">
                      <AlertTriangle size={11} strokeWidth={1.5} />
                      Review
                    </Badge>
                  ) : (
                    <span className="text-[11px] text-bone-mute">
                      {r.lastVerifiedAt ? `Verified ${formatDate(r.lastVerifiedAt)}` : formatDate(r.createdAt)}
                    </span>
                  )}
                </span>

                <ChevronRight size={15} strokeWidth={1.5} className="text-bone-mute" />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
