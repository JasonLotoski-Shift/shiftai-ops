"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

// Reusable chip editor for String[] fields (industries, signals, disqualifiers).
// Type + Enter (or comma) to add; ✕ to remove; Backspace on empty pops last.
// A clickable suggestion row sits beneath for quick-add.
export function TagInput({
  value,
  onChange,
  placeholder,
  suggestions = [],
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const t = raw.trim();
    if (!t) return;
    if (value.some((v) => v.toLowerCase() === t.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, t]);
    setDraft("");
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  const open = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5 items-center min-h-9 px-2 py-1.5 bg-bitumen border border-graphite rounded-[var(--radius)] focus-within:border-track-gold transition-colors">
        {value.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[12px] rounded-[var(--radius-pill)] bg-graphite text-bone-dim border border-graphite-2"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={disabled}
              className="text-bone-mute hover:text-flag-red"
            >
              <X size={11} strokeWidth={1.5} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          placeholder={value.length ? "" : placeholder}
          disabled={disabled}
          className="flex-1 min-w-[80px] bg-transparent text-bone text-[13px] placeholder:text-bone-mute focus:outline-none"
        />
      </div>
      {open.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {open.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              disabled={disabled}
              className="px-2 py-0.5 text-[11px] rounded-[var(--radius-pill)] border border-graphite text-bone-mute hover:text-bone hover:border-bone-mute transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
