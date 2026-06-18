"use client";

// ActionsPanel — an "Actions" section that sits just under a detail page's
// title (pipeline deal / contact / client). OPEN by default with a prominent
// bordered toggle so the actions are easy to find; collapse to a single pill.
// Expanded: boxes, each explaining what the action does. Boxes either run a
// handler (open a modal) or link out.
//
// Two layouts: a flat grid (contact/client pages), or — when any box carries a
// `stage` — grouped into numbered steps that show the order of work (the deal
// pipeline: Discovery → Prototype → Proposal). Each box can carry `info` (what it
// does / what happens), surfaced via an (i) icon with a hover popover.
//
// The parent owns the modals + builds the `actions` array; this component is
// presentational + owns only the open/closed state. Pass `forceOpen` to expand
// it automatically (e.g. when a dashboard Quick Action deep-links in via ?qa=).

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Info, Zap, type LucideIcon } from "lucide-react";
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
  /** The generatedFromSkill value this box maps to (for run-status lookup). */
  skill?: string;
  /** When set, the box shows a GREEN "ran on DATE" line — the last time this
   *  action produced a real deliverable for this entity. */
  ranAt?: Date;
  /** When set, the box shows an ORANGE "step 1 of 2 saved" state — a saved
   *  ActionDraft is waiting to be finished. Clicking reopens it preloaded. */
  stepOneSavedAt?: Date;
  /** Groups the box under a numbered step header (e.g. "Discovery"). When ANY
   *  box has a stage, the panel renders grouped; otherwise it's a flat grid. */
  stage?: string;
  /** Richer explanation surfaced behind an (i) icon: what the action does, and
   *  what happens (the side effects — files saved, drafts, gates) when you run it. */
  info?: { does: string; happens: string };
};

// Short "Jun 12" style date for the run/saved lines — matches the compact
// status labels used elsewhere; avoids importing the heavier formatDate here.
function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// The (i) icon + hover/focus popover. Rendered as a SIBLING of the box button
// (never nested inside it — a button inside a button is invalid HTML), absolutely
// positioned in the box's top-right corner.
function InfoTip({ info }: { info: { does: string; happens: string } }) {
  return (
    <span className="group/info absolute right-2 top-2 z-20">
      <button
        type="button"
        aria-label="What this does and what happens"
        onClick={(e) => e.preventDefault()}
        className="flex items-center justify-center text-bone-mute/60 hover:text-track-gold focus:text-track-gold outline-none"
      >
        <Info size={13} strokeWidth={1.5} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-6 w-64 rounded-[var(--radius)] border border-graphite bg-bitumen p-3 text-left shadow-[var(--shadow-lg)] opacity-0 invisible translate-y-1 transition-all duration-150 group-hover/info:opacity-100 group-hover/info:visible group-hover/info:translate-y-0 group-focus-within/info:opacity-100 group-focus-within/info:visible group-focus-within/info:translate-y-0"
      >
        <span className="block text-[10px] uppercase tracking-wide text-track-gold mb-1">What it does</span>
        <span className="block text-[11px] text-bone-dim leading-snug mb-2">{info.does}</span>
        <span className="block text-[10px] uppercase tracking-wide text-track-gold mb-1">What happens</span>
        <span className="block text-[11px] text-bone-dim leading-snug">{info.happens}</span>
      </span>
    </span>
  );
}

function Box({ action }: { action: ActionBox }) {
  const { icon: Icon, title, description, disabled, disabledReason, gold, ranAt, stepOneSavedAt, info } = action;

  // Orange (step 1 saved) takes visual priority over green (ran) — a saved draft
  // is an open loop the partner is mid-way through; surface it loudest.
  const saved = !disabled && !!stepOneSavedAt;
  const ran = !disabled && !saved && !!ranAt;

  const inner = (
    <>
      <span
        className={cn(
          "w-7 h-7 shrink-0 flex items-center justify-center rounded-[var(--radius-sm)] border",
          saved
            ? "bg-signal-warming/15 border-signal-warming/40 text-signal-warming"
            : ran
              ? "bg-signal-fresh/15 border-signal-fresh/40 text-signal-fresh"
              : gold
                ? "bg-track-gold-dim/30 border-track-gold/40 text-track-gold"
                : "bg-bitumen border-graphite text-bone-mute group-hover:text-track-gold",
        )}
      >
        <Icon size={14} strokeWidth={1.5} />
      </span>
      <span className="min-w-0 flex flex-col gap-0.5">
        <span className="text-[13px] text-bone leading-tight">{title}</span>
        <span className="text-[11px] text-bone-mute leading-snug">{description}</span>
        {saved ? (
          <span className="text-[11px] text-signal-warming leading-snug mt-0.5">
            Step 1 of 2 saved · {shortDate(stepOneSavedAt!)}
          </span>
        ) : ran ? (
          <span className="text-[11px] text-signal-fresh leading-snug mt-0.5">
            Last ran {shortDate(ranAt!)}
          </span>
        ) : null}
      </span>
    </>
  );

  const className = cn(
    // pr-8 leaves room for the (i) icon in the top-right when present.
    "group flex items-start gap-3 px-3.5 py-3 text-left rounded-[var(--radius)] border transition-colors w-full",
    info ? "pr-8" : "",
    disabled
      ? "border-graphite/60 opacity-50 cursor-not-allowed"
      : saved
        ? "border-signal-warming/50 bg-signal-warming/5 hover:border-signal-warming hover:bg-signal-warming/10"
        : ran
          ? "border-signal-fresh/40 bg-asphalt hover:border-signal-fresh hover:bg-[var(--color-row-hover)]"
          : "border-graphite bg-asphalt hover:border-bone-mute hover:bg-[var(--color-row-hover)]",
  );

  // The clickable surface (button or link) and the (i) tip are siblings inside a
  // relative wrapper, so the tip is never an interactive child of the box control.
  const control =
    action.href && !disabled ? (
      <Link href={action.href} className={className}>
        {inner}
      </Link>
    ) : (
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

  return (
    <div className="relative">
      {control}
      {info && <InfoTip info={info} />}
    </div>
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
  // Open by default — the whole point is that partners can see what they can do
  // here without hunting. Collapsible for when they want the page quiet.
  const [open, setOpen] = useState(true);

  // A deep-link (?qa=) targeting one of these actions pops the panel open.
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  if (actions.length === 0) return null;

  // Grouped (stepped) layout when any box declares a stage; else the flat grid.
  const stages: string[] = [];
  for (const a of actions) {
    if (!a.stage) continue;
    if (!stages.includes(a.stage)) stages.push(a.stage);
  }
  const grouped = stages.length > 0;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex items-center gap-2 w-fit px-3 py-1.5 rounded-[var(--radius)] border border-track-gold/30 bg-track-gold-dim/10 hover:border-track-gold/60 hover:bg-track-gold-dim/20 transition-colors"
      >
        <Zap size={13} strokeWidth={1.5} className="text-track-gold" />
        <span className="text-[13px] font-medium text-bone">Actions</span>
        <span className="px-1.5 py-px rounded-full bg-track-gold-dim/30 text-[11px] text-track-gold tabular-nums">{actions.length}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={cn("transition-transform text-bone-mute group-hover:text-bone", open && "rotate-180")}
        />
      </button>

      {open &&
        (grouped ? (
          <div className="flex flex-col gap-4">
            {stages.map((stage, i) => (
              <div key={stage} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 flex items-center justify-center rounded-full bg-track-gold-dim/20 border border-track-gold/40 text-track-gold text-[11px] font-mono tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-[12px] font-medium text-bone-dim uppercase tracking-wide">{stage}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {actions
                    .filter((a) => a.stage === stage)
                    .map((a) => (
                      <Box key={a.key} action={a} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {actions.map((a) => (
              <Box key={a.key} action={a} />
            ))}
          </div>
        ))}
    </div>
  );
}
