"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Trash2, ShieldAlert, CheckCircle2, Loader2 } from "lucide-react";
import { Badge, Button, Card, Select } from "@/components/ui";
import { getScanReport, deleteScanReport, type ScanReportRow } from "@/app/(app)/import/manage-actions";
import { promoteImportedContacts } from "@/app/(app)/import/promote-actions";
import type { ImportLeadType, ScanCriteria } from "@/lib/types";

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

function isPromotable(r: ScanReportRow): boolean {
  return r.completeness === "complete" && !!r.company && r.promotion === "none";
}

function criteriaSummary(c: ScanCriteria | null | undefined): string {
  if (!c) return "";
  const band = (min?: number, max?: number) => (min == null && max == null ? null : `${min ?? "?"}–${max ?? "?"}`);
  const parts: string[] = [];
  if (c.industries.length) parts.push(c.industries.join(", "));
  const emp = band(c.employeeMin, c.employeeMax);
  if (emp) parts.push(`${emp} emp`);
  const rev = band(c.revenueMin, c.revenueMax);
  if (rev) parts.push(`$${rev}`);
  if (c.geographies.length) parts.push(c.geographies.join(", "));
  return parts.join(" · ");
}

export function ScanReportView({
  scanRunId,
  title,
  criteria,
  status,
  scanning,
  onDeleted,
}: {
  scanRunId: string;
  title: string;
  criteria: ScanCriteria | null;
  status: string;
  scanning: boolean;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ScanReportRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [leadType, setLeadType] = useState<"all" | ImportLeadType>("all");
  const [minScore, setMinScore] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await getScanReport(scanRunId));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanRunId, status]);

  const filtered = useMemo(() => {
    const list = rows ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((r) => {
      if (leadType !== "all" && r.leadType !== leadType) return false;
      if (minScore > 0 && r.score < minScore) return false;
      if (q) {
        const hay = `${r.name} ${r.company ?? ""} ${r.title ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, leadType, minScore]);

  const promotable = filtered.filter(isPromotable);
  const allSelected = promotable.length > 0 && promotable.every((r) => selected.has(r.contactId));

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((s) => {
      if (allSelected) return new Set();
      const n = new Set(s);
      promotable.forEach((r) => n.add(r.contactId));
      return n;
    });
  }

  function promote() {
    if (selected.size === 0) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const res = await promoteImportedContacts([...selected], scanRunId);
        setSelected(new Set());
        const parts = [`Promoted ${res.promoted} to the pipeline`];
        if (res.skipped) parts.push(`${res.skipped} skipped`);
        setNotice(parts.join(" · "));
        await load();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Promotion failed");
      }
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteScanReport(scanRunId);
        onDeleted();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't delete the report");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[14px] text-bone truncate">{title}</span>
          {criteria && <span className="text-[11px] text-bone-mute truncate">{criteriaSummary(criteria) || "any company"}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={promote} disabled={isPending || selected.size === 0}>
            <ArrowUpRight size={13} strokeWidth={1.5} />
            Add to Pipeline Leads{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
          <Button variant="ghost" size="sm" onClick={remove} disabled={isPending} title="Delete this report">
            <Trash2 size={13} strokeWidth={1.5} />
            Delete report
          </Button>
        </div>
      </div>

      {scanning && (
        <div className="flex items-center gap-2 px-3 py-2 border border-graphite bg-asphalt rounded-[var(--radius)]">
          <Loader2 size={13} strokeWidth={1.5} className="text-track-gold animate-spin" />
          <span className="text-[12px] text-bone-dim">Scanning… scores will fill in as they finish.</span>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, company…"
          className="h-9 px-3 bg-bitumen border border-graphite text-bone text-[13px] rounded-[var(--radius)] placeholder:text-bone-mute focus:border-track-gold focus:outline-none transition-colors col-span-2"
        />
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

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[32px_2.2fr_2fr_1.3fr_1fr] gap-4 px-5 py-3 border-b border-graphite items-center">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={promotable.length === 0} className="accent-track-gold" title="Select all promotable" />
          <span className="text-[11px] text-bone-dim">Contact</span>
          <span className="text-[11px] text-bone-dim">Company</span>
          <span className="text-[11px] text-bone-dim">Fit</span>
          <span className="text-[11px] text-bone-dim">Pipeline</span>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-[13px] text-bone-mute">Loading report…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-bone-mute">
            {(rows?.length ?? 0) === 0 ? "No scored contacts in this report yet." : "No rows match these filters."}
          </div>
        ) : (
          filtered.map((r) => {
            const promotableRow = isPromotable(r);
            return (
              <div
                key={r.contactId}
                className="grid grid-cols-[32px_2.2fr_2fr_1.3fr_1fr] gap-4 px-5 py-3.5 border-b border-graphite last:border-0 items-center hover:bg-[var(--color-row-hover)] transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.has(r.contactId)}
                  onChange={() => toggle(r.contactId)}
                  disabled={!promotableRow}
                  className="accent-track-gold disabled:opacity-30"
                  title={promotableRow ? "Select to promote" : r.promotion === "promoted" ? "Already promoted" : "Needs a company to promote"}
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
                  <Badge tone={scoreTone(r.score)}>{r.score}/10</Badge>
                  <span className="text-[11px] text-bone-mute truncate" title={r.rationale ?? undefined}>
                    {LEAD_TYPE_LABEL[r.leadType]}
                  </span>
                </div>
                <div>{r.promotion === "promoted" && <Badge tone="gold">Promoted</Badge>}</div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
