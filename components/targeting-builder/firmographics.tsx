"use client";

import { Input, Label } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/format";

type Band = { label: string; min: number; max: number | null };

const REVENUE_PRESETS: Band[] = [
  { label: "$25M–$200M", min: 25_000_000, max: 200_000_000 },
  { label: "$50M–$500M", min: 50_000_000, max: 500_000_000 },
  { label: "$100M–$1B", min: 100_000_000, max: 1_000_000_000 },
];

const EMPLOYEE_PRESETS: Band[] = [
  { label: "100–2,000", min: 100, max: 2000 },
  { label: "250–5,000", min: 250, max: 5000 },
  { label: "1,000+", min: 1000, max: null },
];

function parse(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function PresetChip({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-2 py-0.5 text-[11px] rounded-[var(--radius-pill)] border transition-colors",
        active
          ? "border-track-gold/40 text-track-gold bg-track-gold-dim/10"
          : "border-graphite text-bone-mute hover:text-bone hover:border-bone-mute",
      )}
    >
      {label}
    </button>
  );
}

function bandActive(preset: Band, min: string, max: string): boolean {
  return (
    parse(min) === preset.min &&
    parse(max) === (preset.max === null ? null : preset.max)
  );
}

export function RevenueBand({
  min,
  max,
  onMin,
  onMax,
  disabled = false,
}: {
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  disabled?: boolean;
}) {
  const minN = parse(min);
  const maxN = parse(max);
  return (
    <div className="flex flex-col gap-2">
      <Label>Revenue (CAD)</Label>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <Input
            type="number"
            value={min}
            onChange={(e) => onMin(e.target.value)}
            placeholder="Min — 25000000"
            disabled={disabled}
          />
          {minN !== null && <span className="text-[11px] text-bone-mute">{formatCAD(minN)}</span>}
        </div>
        <div className="flex flex-col gap-1">
          <Input
            type="number"
            value={max}
            onChange={(e) => onMax(e.target.value)}
            placeholder="Max — 200000000"
            disabled={disabled}
          />
          {maxN !== null && <span className="text-[11px] text-bone-mute">{formatCAD(maxN)}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {REVENUE_PRESETS.map((p) => (
          <PresetChip
            key={p.label}
            label={p.label}
            active={bandActive(p, min, max)}
            disabled={disabled}
            onClick={() => {
              onMin(String(p.min));
              onMax(p.max === null ? "" : String(p.max));
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function EmployeeBand({
  min,
  max,
  onMin,
  onMax,
  disabled = false,
}: {
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  disabled?: boolean;
}) {
  const minN = parse(min);
  const maxN = parse(max);
  return (
    <div className="flex flex-col gap-2">
      <Label>Employees</Label>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <Input
            type="number"
            value={min}
            onChange={(e) => onMin(e.target.value)}
            placeholder="Min — 100"
            disabled={disabled}
          />
          {minN !== null && (
            <span className="text-[11px] text-bone-mute">{minN.toLocaleString()}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Input
            type="number"
            value={max}
            onChange={(e) => onMax(e.target.value)}
            placeholder="Max — 2000"
            disabled={disabled}
          />
          {maxN !== null && (
            <span className="text-[11px] text-bone-mute">{maxN.toLocaleString()}</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EMPLOYEE_PRESETS.map((p) => (
          <PresetChip
            key={p.label}
            label={p.label}
            active={bandActive(p, min, max)}
            disabled={disabled}
            onClick={() => {
              onMin(String(p.min));
              onMax(p.max === null ? "" : String(p.max));
            }}
          />
        ))}
      </div>
    </div>
  );
}
