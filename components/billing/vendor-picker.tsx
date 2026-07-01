"use client";

// VendorPicker — the payee combobox for the finance surfaces (the ingest green
// card + the AP/AR Add modal). Type freely (the name still files even with no
// managed link), pick an existing vendor from the filtered list, or add the typed
// name to the managed list in one click. Selecting a vendor links vendorId and can
// carry its default category/currency back to the form.
//
// Three states, matching the ask — not applied to a payee (a plain typed name,
// vendorId null), select one, or create one. Self-fetches the vendor list on
// mount (listVendors degrades to [] pre-migration, so this never hard-fails).

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, Plus, ChevronDown, Building2 } from "lucide-react";
import { Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import { listVendors, createVendor, type VendorRow } from "@/app/(app)/financials/vendor-actions";
import type { ExpenseCategory } from "@/lib/types";

export type VendorPick = {
  id: string | null;
  name: string;
  defaultCategory?: ExpenseCategory | null;
  defaultCurrency?: string | null;
};

export function VendorPicker({
  value,
  onChange,
  disabled,
  placeholder = "e.g. Cloudflare",
  accent = "gold",
}: {
  value: { id: string | null; name: string };
  onChange: (next: VendorPick) => void;
  disabled?: boolean;
  placeholder?: string;
  // The card themes to its lane colour; the modal stays gold.
  accent?: "gold" | "green";
}) {
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, startCreate] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  const accentText = accent === "green" ? "text-[var(--color-lane-green)]" : "text-track-gold";
  const accentBorder = accent === "green" ? "border-[var(--color-lane-green)]/50" : "border-track-gold/50";

  // Load the active vendors once. Errors are swallowed by listVendors (returns []).
  useEffect(() => {
    let live = true;
    listVendors().then((rows) => live && setVendors(rows)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const query = value.name.trim().toLowerCase();
  const matches = useMemo(
    () => (query ? vendors.filter((v) => v.name.toLowerCase().includes(query)) : vendors),
    [vendors, query],
  );
  // An exact (case-insensitive) name match means the typed name already IS a vendor.
  const exact = useMemo(
    () => vendors.find((v) => v.name.toLowerCase() === query) ?? null,
    [vendors, query],
  );
  const canCreate = query.length > 0 && !exact;

  function pick(v: VendorRow) {
    onChange({ id: v.id, name: v.name, defaultCategory: v.defaultCategory, defaultCurrency: v.defaultCurrency });
    setOpen(false);
  }

  function addTyped() {
    const name = value.name.trim();
    if (!name || creating) return;
    startCreate(async () => {
      try {
        const v = await createVendor({ name });
        setVendors((prev) => (prev.some((x) => x.id === v.id) ? prev : [...prev, v].sort((a, b) => a.name.localeCompare(b.name))));
        onChange({ id: v.id, name: v.name, defaultCategory: v.defaultCategory, defaultCurrency: v.defaultCurrency });
        setOpen(false);
      } catch {
        // Leave the typed name as an unlinked plain name if create fails.
        setOpen(false);
      }
    });
  }

  // Typing edits the name and unlinks any managed vendor (until one is re-picked).
  function onType(name: string) {
    onChange({ id: null, name });
    setOpen(true);
  }

  return (
    <div ref={wrapRef} className="relative flex flex-col gap-1">
      <div className="relative">
        <Input
          value={value.name}
          onChange={(e) => onType(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-8"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => !disabled && setOpen((o) => !o)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-bone-mute hover:text-bone"
          aria-label="Show vendors"
        >
          <ChevronDown size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* Linked-vendor confirmation line. */}
      {value.id && (
        <span className={cn("inline-flex items-center gap-1 text-[11px]", accentText)}>
          <Check size={11} strokeWidth={1.5} /> Linked to the vendors list
        </span>
      )}

      {open && !disabled && (
        <div className={cn("absolute top-full left-0 right-0 z-20 mt-1 max-h-[240px] overflow-y-auto rounded-[var(--radius)] border bg-bitumen shadow-[var(--shadow-lg)]", accentBorder)}>
          {matches.length === 0 && !canCreate && (
            <div className="px-3 py-2.5 text-[12px] text-bone-mute">
              {vendors.length === 0 ? "No vendors yet — type a name to add one." : "No match — type a name to add one."}
            </div>
          )}
          {matches.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => pick(v)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-bone hover:bg-[var(--color-row-hover)] transition-colors"
            >
              <Building2 size={13} strokeWidth={1.5} className="text-bone-mute shrink-0" />
              <span className="truncate flex-1">{v.name}</span>
              {v.id === value.id && <Check size={13} strokeWidth={1.5} className={accentText} />}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onClick={addTyped}
              disabled={creating}
              className={cn("w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-[var(--color-row-hover)] transition-colors border-t border-graphite/60", accentText)}
            >
              <Plus size={13} strokeWidth={1.5} className="shrink-0" />
              <span className="truncate">{creating ? "Adding…" : `Add “${value.name.trim()}” to payables`}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
