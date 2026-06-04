"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users, ScanSearch, ArrowUpRight, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Badge, Button, Card, EmptyState, Label, Select } from "@/components/ui";
import type {
  ImportContactCompleteness,
  ImportContactPromotion,
  ImportLeadType,
  ImportScanStatus,
} from "@/lib/types";
import { startContactScan, getScanRunStatus } from "@/app/(app)/import/scan-actions";
import { promoteImportedContacts } from "@/app/(app)/import/promote-actions";

// The lean row shape the table renders (hydrated server-side in the page).
export type ImportedRow = {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  domain: string | null;
  linkedin: string | null;
  completeness: ImportContactCompleteness;
  scanStatus: ImportScanStatus;
  scanScore: number | null;
  leadType: ImportLeadType | null;
  matchedSegmentId: string | null;
  scanRationale: string | null;
  promotion: ImportContactPromotion;
  promotedProspectLeadId: string | null;
};

const LEAD_TYPE_LABEL: Record<ImportLeadType, string> = {
  decision_maker: "Decision-maker",
  connector: "Connector",
  none: "No fit",
};

function scoreTone(score: number): "gold" | "bone" | "neutral" {
  if (score >= 8) return "gold";
  if (score >= 5) return "bone";
  return "neutral";
}

// A row can be promoted into a firm-wide lead when it's scannable, has a company
// (the lead is keyed on the domain when present, else the company name), and
// isn't already promoted. A LinkedIn export rarely carries a domain, so we gate
// on the company name — enrichment resolves the domain later.
function isPromotable(r: ImportedRow): boolean {
  return r.completeness === "complete" && !!r.company && r.promotion === "none";
}

function promoteBlockReason(r: ImportedRow): string {
  if (r.promotion === "promoted") return "Already promoted to the pipeline.";
  if (r.completeness === "needs_identification") return "Name-only — identify this contact first.";
  if (!r.company) return "No company — can't create a company lead.";
  return "";
}

export function ImportedContactsTable({
  rows,
  totalContacts,
  cap,
  batchCount,
  segmentNames,
  hasSegments,
  activeScanRunId,
  pendingScanCount,
}: {
  rows: ImportedRow[];
  totalContacts: number;
  cap: number;
  batchCount: number;
  segmentNames: Record<string, string>;
  hasSegments: boolean;
  activeScanRunId: string | null;
  pendingScanCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filters
  const [search, setSearch] = useState("");
  const [completeness, setCompleteness] = useState<"all" | ImportContactCompleteness>("all");
  const [scanStatus, setScanStatus] = useState<"all" | ImportScanStatus>("all");
  const [leadType, setLeadType] = useState<"all" | ImportLeadType>("all");
  const [minScore, setMinScore] = useState(0);

  // Selection (for promotion)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Scan progress
  const [scanRunId, setScanRunId] = useState<string | null>(activeScanRunId);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
  const scanning = scanRunId !== null;

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Poll an active scan until it finishes, then refresh server data.
  const refreshRef = useRef(router.refresh);
  refreshRef.current = router.refresh;
  useEffect(() => {
    if (!scanRunId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const s = await getScanRunStatus(scanRunId);
        if (cancelled) return;
        if (!s) {
          setScanRunId(null);
          setScanProgress(null);
          return;
        }
        setScanProgress({ done: s.done, total: s.total });
        if (s.status === "done" || s.status === "error") {
          setScanRunId(null);
          setScanProgress(null);
          refreshRef.current();
          return;
        }
        timer = setTimeout(poll, 8000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 8000);
      }
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [scanRunId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (completeness !== "all" && r.completeness !== completeness) return false;
      if (scanStatus !== "all" && r.scanStatus !== scanStatus) return false;
      if (leadType !== "all" && r.leadType !== leadType) return false;
      if (minScore > 0 && (r.scanScore ?? 0) < minScore) return false;
      if (q) {
        const hay = `${r.name} ${r.company ?? ""} ${r.email ?? ""} ${r.title ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, completeness, scanStatus, leadType, minScore]);

  const promotableFiltered = filtered.filter(isPromotable);
  const allPromotableSelected =
    promotableFiltered.length > 0 && promotableFiltered.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((s) => {
      if (allPromotableSelected) return new Set();
      const next = new Set(s);
      promotableFiltered.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function startScan() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const { scanRunId: id } = await startContactScan();
        setScanRunId(id);
        setScanProgress({ done: 0, total: pendingScanCount });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't start the scan");
      }
    });
  }

  function promote() {
    if (selected.size === 0) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const res = await promoteImportedContacts([...selected]);
        setSelected(new Set());
        const parts = [`Promoted ${res.promoted} to the pipeline`];
        if (res.skipped) parts.push(`${res.skipped} skipped`);
        if (res.errors) parts.push(`${res.errors} errored`);
        setNotice(parts.join(" · "));
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Promotion failed");
      }
    });
  }

  if (totalContacts === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Users size={28} strokeWidth={1.5} />}
          title="No imported contacts yet"
          hint="Upload a CSV above to build your private contact list, then scan it for fit."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] text-bone">
            {totalContacts} imported contact{totalContacts === 1 ? "" : "s"}
            <span className="text-bone-mute"> · {batchCount} import{batchCount === 1 ? "" : "s"}</span>
          </span>
          {totalContacts > cap && (
            <span className="text-[11px] text-bone-mute">
              Showing the top {cap} by fit — narrow with filters to find the rest.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={startScan}
            disabled={isPending || scanning || pendingScanCount === 0 || !hasSegments}
            title={
              !hasSegments
                ? "Define at least one active Target Segment first."
                : pendingScanCount === 0
                  ? "Nothing new to scan."
                  : "Score every unscanned contact for fit."
            }
          >
            <ScanSearch size={13} strokeWidth={1.5} />
            {scanning
              ? scanProgress
                ? `Scanning ${scanProgress.done}/${scanProgress.total}…`
                : "Scanning…"
              : `Scan contacts${pendingScanCount ? ` (${pendingScanCount})` : ""}`}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={promote}
            disabled={isPending || selected.size === 0}
          >
            <ArrowUpRight size={13} strokeWidth={1.5} />
            Add to Pipeline Leads{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
        </div>
      </div>

      {!hasSegments && (
        <div className="flex items-start gap-2 px-3 py-2 border border-graphite bg-asphalt rounded-[var(--radius)]">
          <ShieldAlert size={13} strokeWidth={1.5} className="text-bone-mute mt-0.5 shrink-0" />
          <span className="text-[12px] text-bone-dim">
            Scanning uses your active Target Segments as the &ldquo;fitting company&rdquo;
            definition. Add one on the Targeting page to enable it.
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
          <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
          <span className="text-[12px] text-bone-dim">{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 px-3 py-2 border border-track-gold/40 bg-track-gold-dim/10 rounded-[var(--radius)]">
          <CheckCircle2 size={13} strokeWidth={1.5} className="text-track-gold shrink-0" />
          <span className="text-[12px] text-bone-dim">{notice}</span>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, company…"
          className="h-9 px-3 bg-bitumen border border-graphite text-bone text-[13px] rounded-[var(--radius)] placeholder:text-bone-mute focus:border-track-gold focus:outline-none transition-colors col-span-2 md:col-span-1"
        />
        <Select value={completeness} onChange={(e) => setCompleteness(e.target.value as typeof completeness)}>
          <option value="all">All rows</option>
          <option value="complete">Scannable</option>
          <option value="needs_identification">Needs identification</option>
        </Select>
        <Select value={scanStatus} onChange={(e) => setScanStatus(e.target.value as typeof scanStatus)}>
          <option value="all">Any scan status</option>
          <option value="pending">Unscanned</option>
          <option value="scored">Scored</option>
          <option value="skipped">Skipped</option>
          <option value="error">Errored</option>
        </Select>
        <Select value={leadType} onChange={(e) => setLeadType(e.target.value as typeof leadType)}>
          <option value="all">Any type</option>
          <option value="decision_maker">Decision-maker</option>
          <option value="connector">Connector</option>
          <option value="none">No fit</option>
        </Select>
        <Select value={String(minScore)} onChange={(e) => setMinScore(Number(e.target.value))}>
          <option value="0">Any score</option>
          <option value="5">Score ≥ 5</option>
          <option value="7">Score ≥ 7</option>
          <option value="8">Score ≥ 8</option>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[32px_2.2fr_2fr_1.3fr_1.2fr_1fr] gap-4 px-5 py-3 border-b border-graphite items-center">
          <input
            type="checkbox"
            checked={allPromotableSelected}
            onChange={toggleAll}
            disabled={promotableFiltered.length === 0}
            className="accent-track-gold"
            title="Select all promotable rows"
          />
          <span className="text-[11px] text-bone-dim">Contact</span>
          <span className="text-[11px] text-bone-dim">Company</span>
          <span className="text-[11px] text-bone-dim">Fit</span>
          <span className="text-[11px] text-bone-dim">Segment</span>
          <span className="text-[11px] text-bone-dim">Status</span>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-bone-mute">
            No contacts match these filters.
          </div>
        ) : (
          filtered.map((r) => {
            const promotable = isPromotable(r);
            const blockReason = promoteBlockReason(r);
            return (
              <div
                key={r.id}
                className="grid grid-cols-[32px_2.2fr_2fr_1.3fr_1.2fr_1fr] gap-4 px-5 py-3.5 border-b border-graphite last:border-0 items-center hover:bg-[var(--color-row-hover)] transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                  disabled={!promotable}
                  className="accent-track-gold disabled:opacity-30"
                  title={promotable ? "Select to promote" : blockReason}
                />
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[13px] text-bone truncate">{r.name}</span>
                  <span className="text-[11px] text-bone-mute truncate">{r.title ?? "—"}</span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[13px] text-bone-dim truncate">{r.company ?? "—"}</span>
                  <span className="text-[11px] text-bone-mute truncate">{r.domain ?? ""}</span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  {r.scanScore != null ? (
                    <>
                      <Badge tone={scoreTone(r.scanScore)}>{r.scanScore}/10</Badge>
                      {r.leadType && (
                        <span
                          className="text-[11px] text-bone-mute truncate"
                          title={r.scanRationale ?? undefined}
                        >
                          {LEAD_TYPE_LABEL[r.leadType]}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-[11px] text-bone-mute">—</span>
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-[12px] text-bone-dim truncate">
                    {r.matchedSegmentId ? segmentNames[r.matchedSegmentId] ?? "—" : "—"}
                  </span>
                </div>
                <div className="min-w-0">
                  {r.promotion === "promoted" ? (
                    <Badge tone="gold">Promoted</Badge>
                  ) : r.completeness === "needs_identification" ? (
                    <Badge tone="steel">Needs ID</Badge>
                  ) : r.scanStatus === "scored" ? (
                    <Badge tone="bone">Scored</Badge>
                  ) : r.scanStatus === "skipped" ? (
                    <Badge tone="neutral">Skipped</Badge>
                  ) : r.scanStatus === "error" ? (
                    <Badge tone="red">Error</Badge>
                  ) : (
                    <Badge tone="neutral">Unscanned</Badge>
                  )}
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
