"use client";

// SubIndustrySelect — the dependent Tier-2 picker. Options come from the chosen
// Tier-1 vertical's controlled vocabulary; a vertical with no sub list (Other)
// disables the control. Pair it with the industry <Select> and call
// onClearOnVerticalChange when the vertical changes to drop a now-invalid value.
//
// Pure presentational + a value/onChange contract — every form owns its own
// industry/subIndustry state and layout; this keeps the option list + "None"
// row consistent across Contacts, Deals, Clients, and Ingest.

import { Label, Select } from "@/components/ui";
import { subIndustriesByVertical } from "@/lib/industries";

/** The sub-industry options for a vertical (empty for Other / unknown). */
export function subOptionsFor(vertical: string): string[] {
  return subIndustriesByVertical[vertical as keyof typeof subIndustriesByVertical] ?? [];
}

/**
 * Returns the next sub-industry value after a vertical change: keeps it if it's
 * still valid for the new vertical, else clears it. Use in the industry onChange.
 */
export function reconcileSubIndustry(nextVertical: string, current: string): string {
  return current && subOptionsFor(nextVertical).includes(current) ? current : "";
}

export function SubIndustrySelect({
  vertical,
  value,
  onChange,
  disabled,
  label = "Sub-industry",
  className,
}: {
  vertical: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const options = subOptionsFor(vertical);
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || options.length === 0}
        className={className}
      >
        <option value="">— None —</option>
        {options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
    </div>
  );
}
