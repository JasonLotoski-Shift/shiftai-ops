"use client";

import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui";

export type Anchor = { name: string; domain?: string };

// Repeatable [Company name][Domain (optional)][remove] rows. Blank domain is
// stored as undefined (handled by the server action's cleanAnchors).
export function AnchorRows({
  value,
  onChange,
  disabled = false,
}: {
  value: Anchor[];
  onChange: (next: Anchor[]) => void;
  disabled?: boolean;
}) {
  function update(idx: number, patch: Partial<Anchor>) {
    onChange(value.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...value, { name: "", domain: "" }]);
  }

  return (
    <div className="flex flex-col gap-2">
      {value.map((a, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <Input
            value={a.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Magna International"
            disabled={disabled}
          />
          <Input
            value={a.domain ?? ""}
            onChange={(e) => update(i, { domain: e.target.value })}
            placeholder="magna.com (optional)"
            disabled={disabled}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            disabled={disabled}
            title="Remove company"
            className="text-bone-mute hover:text-flag-red p-1.5"
          >
            <X size={13} strokeWidth={1.5} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={disabled}
        className="flex items-center gap-1.5 text-[12px] text-track-gold hover:text-track-gold/80 transition-colors w-fit"
      >
        <Plus size={13} strokeWidth={1.5} />
        Add company
      </button>
    </div>
  );
}
