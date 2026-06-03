"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Label } from "@/components/ui";

// Collapsible section group for the segment builder. Mirrors the SkillBlock
// header pattern in agents-views.tsx (gold chevron open, muted closed).
export function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-graphite/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-1 py-3 text-left hover:bg-[var(--color-row-hover)] transition-colors rounded-[var(--radius-sm)]"
      >
        {open ? (
          <ChevronDown size={15} strokeWidth={1.5} className="text-track-gold shrink-0" />
        ) : (
          <ChevronRight size={15} strokeWidth={1.5} className="text-bone-mute shrink-0" />
        )}
        <Label gold>{title}</Label>
      </button>
      {open && <div className="flex flex-col gap-4 px-1 py-4">{children}</div>}
    </div>
  );
}
