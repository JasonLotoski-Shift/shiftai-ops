"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users, ScanSearch, Trash2, ShieldAlert } from "lucide-react";
import { Badge, Button, Card, EmptyState, Select } from "@/components/ui";
import { deleteImportedContacts } from "@/app/(app)/import/manage-actions";
import type { ImportContactCompleteness, ImportContactPromotion } from "@/lib/types";

export type MasterRow = {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  domain: string | null;
  completeness: ImportContactCompleteness;
  promotion: ImportContactPromotion;
  scanned: boolean;
};

export function ImportMasterTable({
  rows,
  totalContacts,
  cap,
  batchCount,
  reportCount,
  onNewScan,
  canScan,
}: {
  rows: MasterRow[];
  totalContacts: number;
  cap: number;
  batchCount: number;
  reportCount: number;
  onNewScan: () => void;
  canScan: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [completeness, setCompleteness] = useState<"all" | ImportContactCompleteness>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (completeness !== "all" && r.completeness !== completeness) return false;
      if (q) {
        const hay = `${r.name} ${r.company ?? ""} ${r.email ?? ""} ${r.title ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, completeness]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

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
      filtered.forEach((r) => n.add(r.id));
      return n;
    });
  }

  function removeSelected() {
    if (selected.size === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteImportedContacts([...selected]);
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed");
      }
    });
  }

  if (totalContacts === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Users size={28} strokeWidth={1.5} />}
          title="No imported contacts yet"
          hint="Upload a CSV above to build your private master list, then run a scan to rank it for fit."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] text-bone">
            {totalContacts} contact{totalContacts === 1 ? "" : "s"}
            <span className="text-bone-mute"> · {batchCount} import{batchCount === 1 ? "" : "s"} · {reportCount} report{reportCount === 1 ? "" : "s"}</span>
          </span>
          {totalContacts > cap && (
            <span className="text-[11px] text-bone-mute">Showing the first {cap} — filter to find the rest.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button variant="secondary" size="sm" onClick={removeSelected} disabled={isPending}>
              <Trash2 size={13} strokeWidth={1.5} />
              Delete ({selected.size})
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={onNewScan} disabled={!canScan} title={canScan ? "Set criteria and scan for fit" : "Import contacts first"}>
            <ScanSearch size={13} strokeWidth={1.5} />
            New scan
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
          <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
          <span className="text-[12px] text-bone-dim">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, company…"
          className="h-9 px-3 bg-bitumen border border-graphite text-bone text-[13px] rounded-[var(--radius)] placeholder:text-bone-mute focus:border-track-gold focus:outline-none transition-colors col-span-2"
        />
        <Select value={completeness} onChange={(e) => setCompleteness(e.target.value as typeof completeness)}>
          <option value="all">All rows</option>
          <option value="complete">Scannable</option>
          <option value="needs_identification">Needs identification</option>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[32px_2.4fr_2.2fr_1fr_1fr] gap-4 px-5 py-3 border-b border-graphite items-center">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-track-gold" title="Select all" />
          <span className="text-[11px] text-bone-dim">Contact</span>
          <span className="text-[11px] text-bone-dim">Company</span>
          <span className="text-[11px] text-bone-dim">State</span>
          <span className="text-[11px] text-bone-dim">Pipeline</span>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-bone-mute">No contacts match these filters.</div>
        ) : (
          filtered.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[32px_2.4fr_2.2fr_1fr_1fr] gap-4 px-5 py-3.5 border-b border-graphite last:border-0 items-center hover:bg-[var(--color-row-hover)] transition-colors"
            >
              <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="accent-track-gold" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[13px] text-bone truncate">{r.name}</span>
                <span className="text-[11px] text-bone-mute truncate">{r.title ?? "—"}</span>
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[13px] text-bone-dim truncate">{r.company ?? "—"}</span>
                <span className="text-[11px] text-bone-mute truncate">{r.email ?? r.domain ?? ""}</span>
              </div>
              <div>
                {r.completeness === "needs_identification" ? (
                  <Badge tone="steel">Needs ID</Badge>
                ) : r.scanned ? (
                  <Badge tone="bone">Scanned</Badge>
                ) : (
                  <Badge tone="neutral">Not scanned</Badge>
                )}
              </div>
              <div>{r.promotion === "promoted" && <Badge tone="gold">Promoted</Badge>}</div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
