"use client";

// ActionsPanel — a collapsible "Actions" section that sits just under a detail
// page's title (pipeline deal / contact / client). Collapsed by default: a
// single "Actions" toggle. Expanded: a grid of boxes, each explaining what the
// action does. Boxes either run a handler (open a modal) or link out.
//
// The parent owns the modals + builds the `actions` array; this component is
// presentational + owns only the open/closed state. Pass `forceOpen` to expand
// it automatically (e.g. when a dashboard Quick Action deep-links in via ?qa=).

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type ActionBox = {
  key: string;
  icon: LucideIcon;
  title: string;
  /** One line on what the action does — shown inside the box. */
  description: string;
  onClick?: () => void;
  /** Link-style action (e.g. Ingest) — rendered as an <a>/<Link>. */
  href?: string;
  disabled?: boolean;
  /** Tooltip shown when disabled (the "why"). */
  disabledReason?: string;
  /** Gold-emphasised box for the headline action on this page. */
  gold?: boolean;
};

function Box({ action }: { action: ActionBox }) {
  const { icon: Icon, title, description, disabled, disabledReason, gold } = action;

  const inner = (
    <>
      <span
        className={cn(
          "w-7 h-7 shrink-0 flex items-center justify-center rounded-[var(--radius-sm)] border",
          gold
            ? "bg-track-gold-dim/30 border-track-gold/40 text-track-gold"
            : "bg-bitumen border-graphite text-bone-mute group-hover:text-track-gold",
        )}
      >
        <Icon size={14} strokeWidth={1.5} />
      </span>
      <span className="min-w-0 flex flex-col gap-0.5">
        <span className="text-[13px] text-bone leading-tight">{title}</span>
        <span className="text-[11px] text-bone-mute leading-snug">{description}</span>
      </span>
    </>
  );

  const className = cn(
    "group flex items-start gap-3 px-3.5 py-3 text-left rounded-[var(--radius)] border transition-colors",
    disabled
      ? "border-graphite/60 opacity-50 cursor-not-allowed"
      : "border-graphite bg-asphalt hover:border-bone-mute hover:bg-[var(--color-row-hover)]",
  );

  if (action.href && !disabled) {
    return (
      <Link href={action.href} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={disabled ? undefined : action.onClick}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={className}
    >
      {inner}
    </button>
  );
}

export function ActionsPanel({
  actions,
  forceOpen = false,
  className,
}: {
  actions: ActionBox[];
  /** Expand automatically (e.g. a Quick Action deep-linked here). */
  forceOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  // A deep-link (?qa=) targeting one of these actions pops the panel open.
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  if (actions.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 w-fit text-bone-dim hover:text-bone transition-colors"
      >
        <Zap size={13} strokeWidth={1.5} className="text-track-gold" />
        <span className="text-[13px] font-medium text-bone">Actions</span>
        <span className="text-[11px] text-bone-mute tabular-nums">{actions.length}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={cn("transition-transform text-bone-mute", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {actions.map((a) => (
            <Box key={a.key} action={a} />
          ))}
        </div>
      )}
    </div>
  );
}
