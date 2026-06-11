"use client";

// ModalShell — the shared backdrop for pop-up forms. Clicking outside (or
// pressing Escape) does NOT silently discard the form anymore: a confirm card
// asks first — KEEP EDITING (green) or CLOSE (red). Pass guard={false} on
// read-only / already-saved states where closing loses nothing.
//
// Usage: swap a modal's outer overlay div for this shell and keep its inner
// panel (with the usual e.stopPropagation()) as the children. Positioning
// classes are REPLACED (cn is plain clsx, no tailwind-merge), so pass the full
// position string when it differs from the default.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { TriangleAlert } from "lucide-react";

export function ModalShell({
  onClose,
  guard = true,
  positionClassName = "items-start justify-center pt-16 px-4",
  scroll = true,
  children,
}: {
  onClose: () => void;
  /** Warn before discarding. true (default) = always ask on click-out/Escape. */
  guard?: boolean;
  /** Flex positioning for the panel — replaces the default, not merged. */
  positionClassName?: string;
  scroll?: boolean;
  children: React.ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);

  function requestClose() {
    if (guard) setConfirming(true);
    else onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (guard) setConfirming(true);
      else onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guard, onClose]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex bg-bitumen/85 backdrop-blur-sm",
        scroll && "overflow-y-auto",
        positionClassName,
      )}
      onClick={requestClose}
    >
      {children}

      {confirming && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-bitumen/70"
          onClick={(e) => {
            // Clicking around the confirm card = keep editing.
            e.stopPropagation();
            setConfirming(false);
          }}
        >
          <div
            className="w-full max-w-[400px] bg-asphalt border border-graphite-2 rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <TriangleAlert size={18} strokeWidth={1.5} className="text-flag-red shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="text-[14px] text-bone font-medium">Close this form?</span>
                <span className="text-[12px] text-bone-dim leading-relaxed">
                  Anything you&apos;ve entered here will be lost.
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirming(false);
                  onClose();
                }}
              >
                Close — discard
              </Button>
              {/* Raw button (not the gold primary Button) so the green reads
                  unmistakably as "safe". */}
              <button
                autoFocus
                className="inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius)] transition-colors focus-gold h-7 px-3 text-[12px] bg-[#4f9d57] text-[#f2eee6] hover:bg-[#458a4c]"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirming(false);
                }}
              >
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
