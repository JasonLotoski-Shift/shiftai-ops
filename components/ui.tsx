"use client";

import { forwardRef, type ButtonHTMLAttributes, type ComponentType, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";

/* ──────────────────────────────────────────────────────────────────────
   Button
   ────────────────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-track-gold text-ink hover:bg-track-gold/90 disabled:bg-track-gold-dim disabled:cursor-not-allowed",
  secondary:
    "bg-asphalt text-bone border border-graphite hover:border-bone-mute disabled:opacity-50 disabled:cursor-not-allowed",
  ghost:
    "bg-transparent text-bone hover:bg-asphalt disabled:opacity-50 disabled:cursor-not-allowed",
  danger:
    "bg-flag-red text-bone hover:bg-flag-red/90 disabled:opacity-50 disabled:cursor-not-allowed",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-7 px-3 text-[12px]",
  md: "h-9 px-4 text-[13px]",
  lg: "h-11 px-6 text-[14px]",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
  }
>(({ variant = "primary", size = "md", className, children, ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium",
        "rounded-[var(--radius)]",
        "transition-colors focus-gold",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
Button.displayName = "Button";

/* ──────────────────────────────────────────────────────────────────────
   Card / Surface
   ────────────────────────────────────────────────────────────────────── */

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-5 pt-4 pb-2", className)} {...props}>
      {children}
    </div>
  );
}

export function CardBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-5", className)} {...props}>
      {children}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Label (mono section label — "— SECTOR 03 / CASE STUDY")
   ────────────────────────────────────────────────────────────────────── */

export function Label({
  children,
  gold = false,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { gold?: boolean }) {
  return (
    <span className={cn(gold ? "label-gold" : "label", className)} {...props}>
      {children}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Badge — pill-rounded status chip
   ────────────────────────────────────────────────────────────────────── */

type BadgeTone = "neutral" | "gold" | "steel" | "red" | "bone";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-graphite text-bone-dim border-graphite-2",
  gold: "bg-track-gold-dim/20 text-track-gold border-track-gold/40",
  steel: "bg-diagnostic-steel/15 text-diagnostic-steel border-diagnostic-steel/40",
  red: "bg-flag-red/15 text-flag-red border-flag-red/40",
  bone: "bg-bone/10 text-bone border-bone/30",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 border font-medium text-[11px] rounded-[var(--radius-pill)]",
        badgeTones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Input / Textarea
   ────────────────────────────────────────────────────────────────────── */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full h-9 px-3 bg-bitumen border border-graphite text-bone text-[14px] rounded-[var(--radius)]",
          "placeholder:text-bone-mute focus:border-track-gold focus:outline-none",
          "transition-colors",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full px-3 py-2 bg-bitumen border border-graphite text-bone text-[14px] rounded-[var(--radius)]",
          "placeholder:text-bone-mute focus:border-track-gold focus:outline-none",
          "transition-colors resize-none",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

/* ──────────────────────────────────────────────────────────────────────
   Stat — labeled numerical value (for dashboards)
   ────────────────────────────────────────────────────────────────────── */

export function Stat({
  label,
  value,
  delta,
  gold = false,
  className,
}: {
  label: string;
  value: string | number;
  delta?: string;
  gold?: boolean;
  className?: string;
}) {
  const isZero = /^(\$?0|0)$/.test(String(value).trim());
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label>{label}</Label>
      <div
        className={cn(
          "font-mono font-medium tabular-nums text-[28px] leading-none",
          isZero ? "text-bone-mute" : gold ? "text-track-gold" : "text-bone",
        )}
      >
        {value}
      </div>
      {delta && <div className="text-[11px] text-bone-mute">{delta}</div>}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Hairline divider
   ────────────────────────────────────────────────────────────────────── */

export function Hairline({ className }: { className?: string }) {
  return <hr className={cn("border-graphite", className)} />;
}

/* ──────────────────────────────────────────────────────────────────────
   Tabs — mono labels, gold underline on active, hairline base.
   Controlled: parent owns the active key.
   ────────────────────────────────────────────────────────────────────── */

export type TabItem = { key: string; label: string; count?: number };

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-stretch gap-6", className)}>
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              "relative -mb-px pb-3 pt-1 flex items-center gap-2",
              "font-medium text-[13px] tracking-[0.01em] transition-colors",
              on ? "text-bone" : "text-bone-mute hover:text-bone-dim",
            )}
          >
            <span>{t.label}</span>
            {typeof t.count === "number" && (
              <span className={cn("tabular-nums text-[11px]", on ? "text-track-gold" : "text-bone-mute")}>
                {t.count}
              </span>
            )}
            {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-track-gold" />}
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   EmptyState — calm, centered "nothing here yet" (replaces "— Empty" voids)
   ────────────────────────────────────────────────────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  compact = false,
  className,
}: {
  icon?: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  hint?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center text-center gap-2", compact ? "py-10" : "py-16", className)}>
      {Icon && <Icon size={compact ? 22 : 28} strokeWidth={1.5} className="text-bone-mute mb-1" />}
      <span className="title-md">{title}</span>
      {hint && <span className="text-[13px] text-bone-dim max-w-[42ch] leading-relaxed">{hint}</span>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Avatar — circular initials chip. One shape app-wide.
   ────────────────────────────────────────────────────────────────────── */

export function Avatar({
  initials,
  size = "md",
  gold = false,
  className,
}: {
  initials: string;
  size?: "sm" | "md" | "lg";
  gold?: boolean;
  className?: string;
}) {
  const dims = { sm: "w-5 h-5 text-[9px]", md: "w-6 h-6 text-[10px]", lg: "w-7 h-7 text-[11px]" }[size];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0 rounded-[var(--radius-pill)] font-mono tabular-nums",
        gold ? "bg-track-gold-dim/30 text-track-gold border border-track-gold/40" : "bg-graphite-2 text-bone-dim",
        dims,
        className,
      )}
    >
      {initials}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Select — Input parity + chevron affordance
   ────────────────────────────────────────────────────────────────────── */

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          className={cn(
            "w-full h-9 pl-3 pr-9 bg-bitumen border border-graphite text-bone text-[14px] rounded-[var(--radius)] appearance-none",
            "focus:border-track-gold focus:outline-none transition-colors cursor-pointer",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className="text-bone-mute absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
        />
      </div>
    );
  },
);
Select.displayName = "Select";

/* ──────────────────────────────────────────────────────────────────────
   SearchInput — filled, icon-prefixed search/filter field (no hard border)
   ────────────────────────────────────────────────────────────────────── */

export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div className="flex items-center gap-2 w-full bg-asphalt rounded-[var(--radius)] px-3 h-9 shadow-[var(--shadow-sm)]">
        <Search size={14} strokeWidth={1.5} className="text-bone-mute shrink-0" />
        <input
          ref={ref}
          className={cn(
            "w-full bg-transparent text-bone text-[13px] placeholder:text-bone-mute focus:outline-none",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
SearchInput.displayName = "SearchInput";
