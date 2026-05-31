"use client";

import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: string;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <>
      <header className="bg-bitumen">
        {/* Top utility row */}
        <div className="flex items-center justify-between px-8 py-3">
          <div className="flex items-center gap-3 w-[400px] bg-asphalt rounded-[var(--radius)] px-3 py-2 shadow-[var(--shadow-sm)]">
            <Search size={14} strokeWidth={1.5} className="text-bone-mute" />
            <input
              placeholder="Search contacts, clients, projects…"
              className="bg-transparent border-0 text-[13px] text-bone placeholder:text-bone-mute focus:outline-none w-full"
            />
            <span className="label text-[9px]">⌘K</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary">
              <Plus size={13} strokeWidth={1.5} />
              New
            </Button>
            <ThemeToggle />
          </div>
        </div>

        {/* Title block */}
        <div className="px-8 py-6 flex items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            {eyebrow && <span className="label">— {eyebrow}</span>}
            <h1 className="display-md text-bone">{title}</h1>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </header>
    </>
  );
}
