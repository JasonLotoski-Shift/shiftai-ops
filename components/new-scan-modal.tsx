"use client";

import { useState, useTransition } from "react";
import { X, ScanSearch, ShieldAlert } from "lucide-react";
import { Button, Label, Input, Select } from "@/components/ui";
import { startContactScan } from "@/app/(app)/import/scan-actions";
import type { ScanCriteria } from "@/lib/types";

// A Target Segment, reduced to the fields the scan criteria seed from.
export type SegmentSeed = {
  id: string;
  name: string;
  industries: string[];
  employeeMin: number | null;
  employeeMax: number | null;
  revenueMin: number | null;
  revenueMax: number | null;
  geographies: string[];
  keywords: string[];
};

const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const arr = (a: string[]) => a.join(", ");
const numOrUndef = (s: string) => {
  const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
};

export function NewScanModal({
  segments,
  onClose,
  onStarted,
}: {
  segments: SegmentSeed[];
  onClose: () => void;
  onStarted: (scanRunId: string) => void;
}) {
  const [seedId, setSeedId] = useState("");
  const [title, setTitle] = useState("");
  const [industries, setIndustries] = useState("");
  const [geographies, setGeographies] = useState("");
  const [keywords, setKeywords] = useState("");
  const [empMin, setEmpMin] = useState("");
  const [empMax, setEmpMax] = useState("");
  const [revMin, setRevMin] = useState("");
  const [revMax, setRevMax] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function seedFrom(id: string) {
    setSeedId(id);
    const s = segments.find((x) => x.id === id);
    if (!s) return;
    setIndustries(arr(s.industries));
    setGeographies(arr(s.geographies));
    setKeywords(arr(s.keywords));
    setEmpMin(s.employeeMin != null ? String(s.employeeMin) : "");
    setEmpMax(s.employeeMax != null ? String(s.employeeMax) : "");
    setRevMin(s.revenueMin != null ? String(s.revenueMin) : "");
    setRevMax(s.revenueMax != null ? String(s.revenueMax) : "");
    if (!title.trim()) setTitle(`${s.name} — ${new Date().toLocaleDateString()}`);
  }

  function run() {
    setError(null);
    const seed = segments.find((s) => s.id === seedId);
    const criteria: ScanCriteria = {
      industries: csv(industries),
      geographies: csv(geographies),
      keywords: csv(keywords),
      employeeMin: numOrUndef(empMin),
      employeeMax: numOrUndef(empMax),
      revenueMin: numOrUndef(revMin),
      revenueMax: numOrUndef(revMax),
      seededFromSegmentId: seed?.id,
      seededFromName: seed?.name,
    };
    const finalTitle = title.trim() || `Scan — ${new Date().toLocaleDateString()}`;
    startTransition(async () => {
      try {
        const { scanRunId } = await startContactScan({ title: finalTitle, criteria });
        onStarted(scanRunId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't start the scan");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-bitumen/85 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-graphite">
          <div className="flex items-center gap-3">
            <ScanSearch size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>New scan</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone" disabled={isPending}>
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          <p className="text-[12px] text-bone-mute">
            Set what a good company looks like — the scan rates every contact 1–10 against it and
            saves the result as its own report. Seed from a Target Segment, then tweak. Leave a field
            blank for &ldquo;any&rdquo;.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Seed from segment</Label>
              <Select value={seedId} onChange={(e) => seedFrom(e.target.value)} disabled={isPending}>
                <option value="">— start blank —</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Report title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Construction owners" disabled={isPending} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Industries (comma-separated)</Label>
            <Input value={industries} onChange={(e) => setIndustries(e.target.value)} placeholder="automotive, construction, engineering" disabled={isPending} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Company-type / signal keywords</Label>
            <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="family-owned, expanding, fleet, multi-site" disabled={isPending} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Geographies</Label>
            <Input value={geographies} onChange={(e) => setGeographies(e.target.value)} placeholder="British Columbia, Alberta, Canada" disabled={isPending} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Employees (min – max)</Label>
              <div className="flex items-center gap-2">
                <Input value={empMin} onChange={(e) => setEmpMin(e.target.value)} placeholder="min" disabled={isPending} />
                <span className="text-bone-mute">–</span>
                <Input value={empMax} onChange={(e) => setEmpMax(e.target.value)} placeholder="max" disabled={isPending} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Revenue CAD (min – max)</Label>
              <div className="flex items-center gap-2">
                <Input value={revMin} onChange={(e) => setRevMin(e.target.value)} placeholder="25000000" disabled={isPending} />
                <span className="text-bone-mute">–</span>
                <Input value={revMax} onChange={(e) => setRevMax(e.target.value)} placeholder="200000000" disabled={isPending} />
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-graphite">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={run} disabled={isPending}>
            <ScanSearch size={13} strokeWidth={1.5} />
            {isPending ? "Starting…" : "Run scan"}
          </Button>
        </div>
      </div>
    </div>
  );
}
