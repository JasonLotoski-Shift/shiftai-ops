import { cn } from "@/lib/cn";

type WordmarkProps = {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const sizeMap = {
  sm: "text-[18px]",
  md: "text-[28px]",
  lg: "text-[44px]",
  xl: "text-[72px]",
} as const;

/**
 * Shift AI wordmark — Big Shoulders Display 900, mechanical 12° skew.
 * SHIFT in Bone, AI in Track Gold. The wordmark IS the logo (no separate symbol).
 */
export function Wordmark({ size = "md", className }: WordmarkProps) {
  return (
    <div
      className={cn(
        "inline-flex items-baseline gap-[0.25em] font-display font-black uppercase leading-none",
        "tracking-[-0.04em]",
        sizeMap[size],
        className,
      )}
      style={{ transform: "skewX(-12deg)", transformOrigin: "left center" }}
    >
      <span className="text-bone">SHIFT</span>
      <span className="text-track-gold">AI</span>
    </div>
  );
}

/**
 * SA Sigil monogram — used at sizes below 32px where the full wordmark breaks.
 */
export function Sigil({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-baseline font-display font-black uppercase leading-none tracking-[-0.04em]",
        className,
      )}
      style={{
        transform: "skewX(-12deg)",
        transformOrigin: "left center",
        fontSize: size,
      }}
    >
      <span className="text-bone">S</span>
      <span className="text-track-gold">A</span>
    </div>
  );
}
