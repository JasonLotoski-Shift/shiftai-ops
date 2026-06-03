"use client";

import { Plus, X } from "lucide-react";
import { Select } from "@/components/ui";
import { DEPARTMENTS, SENIORITIES } from "@/lib/data/apollo-taxonomy";

export type Persona = { department: string; seniority: string };

// Repeatable [Department][Seniority][remove] rows, sourced from the Apollo
// taxonomy. New rows default to the first department/seniority.
export function PersonaRows({
  value,
  onChange,
  disabled = false,
}: {
  value: Persona[];
  onChange: (next: Persona[]) => void;
  disabled?: boolean;
}) {
  function update(idx: number, patch: Partial<Persona>) {
    onChange(value.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...value, { department: DEPARTMENTS[0], seniority: SENIORITIES[2] }]);
  }

  return (
    <div className="flex flex-col gap-2">
      {value.map((p, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
          <Select
            value={p.department}
            onChange={(e) => update(i, { department: e.target.value })}
            disabled={disabled}
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          <Select
            value={p.seniority}
            onChange={(e) => update(i, { seniority: e.target.value })}
            disabled={disabled}
          >
            {SENIORITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={() => remove(i)}
            disabled={disabled}
            title="Remove persona"
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
        Add persona
      </button>
    </div>
  );
}
