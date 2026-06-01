"use client";

import { SearchInput } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <>
      <header className="bg-bitumen">
        {/* Top utility row */}
        <div className="flex items-center justify-between px-8 py-3">
          <div className="flex items-center gap-2 w-[400px]">
            <SearchInput placeholder="Search contacts, clients, projects…" />
            <span className="label text-[9px]">⌘K</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>

        {/* Title block */}
        <div className="px-8 py-6 flex items-end justify-between gap-6">
          <div className="flex flex-col gap-1.5">
            {eyebrow && <span className="label">{eyebrow}</span>}
            <h1 className="display-md text-bone">{title}</h1>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </header>
    </>
  );
}
