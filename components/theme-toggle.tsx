"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "dark" | "light";

/**
 * Dark/light toggle. The actual <html data-theme> is set pre-paint by the inline
 * script in app/layout.tsx (no flash); this just reads/flips it and persists.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as Theme) || "dark";
    setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("shiftai-theme", next);
    } catch {
      /* prototype: storage may be blocked; ignore */
    }
  }

  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="w-9 h-9 flex items-center justify-center border border-graphite text-bone-dim hover:text-bone hover:border-bone-mute transition-colors focus-gold"
    >
      <Icon size={14} strokeWidth={1.5} />
    </button>
  );
}
