"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Star, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { LOCATIONS } from "@/lib/data/locations";

// Searchable geography picker. Selecting a location adds it as a chip to
// `value` (String[]). Each chip has a ⭐ toggle that sets `priorityLocation`
// (single-select). Removing the starred chip clears priorityLocation.
export function GeographyPicker({
  value,
  priorityLocation,
  onChange,
  onPriorityChange,
  disabled = false,
}: {
  value: string[];
  priorityLocation: string | null;
  onChange: (next: string[]) => void;
  onPriorityChange: (loc: string | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return LOCATIONS.filter(
      (l) => l.label.toLowerCase().includes(q) && !value.includes(l.label),
    ).slice(0, 8);
  }, [query, value]);

  function addLocation(label: string) {
    if (!value.includes(label)) onChange([...value, label]);
    setQuery("");
    setOpen(false);
  }

  function removeLocation(label: string) {
    onChange(value.filter((v) => v !== label));
    if (priorityLocation === label) onPriorityChange(null);
  }

  function toggleStar(label: string) {
    onPriorityChange(priorityLocation === label ? null : label);
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={wrapRef} className="relative">
        <div className="flex items-center gap-2 w-full h-9 px-3 bg-bitumen border border-graphite rounded-[var(--radius)] focus-within:border-track-gold transition-colors">
          <Search size={14} strokeWidth={1.5} className="text-bone-mute shrink-0" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search a country, province, or state…"
            disabled={disabled}
            className="w-full bg-transparent text-bone text-[13px] placeholder:text-bone-mute focus:outline-none"
          />
        </div>
        {open && matches.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-asphalt border border-graphite rounded-[var(--radius)] shadow-[var(--shadow-lg)] max-h-56 overflow-y-auto">
            {matches.map((m) => (
              <button
                key={m.label}
                type="button"
                onClick={() => addLocation(m.label)}
                className="w-full text-left px-3 py-1.5 text-[13px] text-bone-dim hover:bg-[var(--color-row-hover)] hover:text-bone transition-colors"
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((label) => {
            const starred = priorityLocation === label;
            return (
              <span
                key={label}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2 py-0.5 text-[12px] rounded-[var(--radius-pill)] border transition-colors",
                  starred
                    ? "border-track-gold/40 text-track-gold bg-track-gold-dim/10"
                    : "border-graphite text-bone-dim",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleStar(label)}
                  disabled={disabled}
                  title={starred ? "Priority geography" : "Set as priority"}
                  className={cn(starred ? "text-track-gold" : "text-bone-mute hover:text-track-gold")}
                >
                  <Star size={11} strokeWidth={1.5} className={cn(starred && "fill-track-gold")} />
                </button>
                {label}
                <button
                  type="button"
                  onClick={() => removeLocation(label)}
                  disabled={disabled}
                  className="text-bone-mute hover:text-flag-red"
                >
                  <X size={11} strokeWidth={1.5} />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
