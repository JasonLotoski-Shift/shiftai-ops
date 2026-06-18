"use client";

import { useState, useTransition } from "react";
import { X, Presentation, Sparkles, ShieldAlert } from "lucide-react";
import { Button, Label, Textarea } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { startDeckBuild } from "@/app/(app)/pipeline/[id]/prototype-actions";

// Build deck — step 2 of the proposal chain. The deck renders the approved scope of
// work and links the prototype, built by the same worker loop as the prototype
// (kind="deck"): inputs → launch → opens the run view in a new tab to watch it build.
// Mirrors the prototype launch in proposal-engine-modal.tsx.
export function DeckBuildModal({
  dealId,
  company,
  onClose,
}: {
  dealId: string;
  company: string;
  onClose: () => void;
}) {
  const [focus, setFocus] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [isStarting, startBuild] = useTransition();

  // Open the run tab SYNCHRONOUSLY in the click gesture, before any await — a
  // window.open() after `await` is treated as programmatic and gets popup-blocked.
  const launch = () => {
    const win = window.open("about:blank", "_blank");
    startBuild(async () => {
      setErr(null);
      try {
        const { runId } = await startDeckBuild(dealId, { focus });
        const url = `/prototype/${runId}`;
        if (win && !win.closed) win.location.href = url;
        else window.open(url, "_blank");
        onClose();
      } catch (e) {
        if (win && !win.closed) win.close();
        setErr(e instanceof Error ? e.message : "Could not start the deck build");
      }
    });
  };

  return (
    <ModalShell onClose={onClose} guard positionClassName="items-start justify-center pt-12 px-4">
      <div
        className="w-full max-w-[680px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Presentation size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>Build deck · {company}</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex items-start gap-3 mx-5 mb-1 px-3 py-3 rounded-[var(--radius)] border border-flag-red/40 bg-flag-red/5">
          <ShieldAlert size={15} strokeWidth={1.5} className="text-flag-red shrink-0 mt-0.5" />
          <p className="text-[12px] text-bone-dim leading-snug">
            The deck renders your approved scope of work and links the prototype. It won&apos;t invent a fee, a date, or
            a fact: anything missing appears as a visible <span className="mono text-flag-red">[NEEDS INPUT]</span>{" "}
            marker and nothing saves until you resolve it. Review and edit before you share it.
          </p>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>
              What should the deck emphasize? <span className="text-flag-red">*</span>
            </Label>
            <Textarea
              rows={3}
              placeholder="e.g. Phased build, the IP they own, fixed fee; lead with the prototype demo"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              disabled={isStarting}
            />
          </div>

          <p className="flex items-start gap-2 text-[12px] text-bone-mute">
            <Sparkles size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-track-gold" />
            <span>
              Claude reads {company}&apos;s approved scope of work and the prototype, then builds the deck and
              improves it over a few rounds. It opens in its own tab so you can watch it build, refine it once, and
              approve.
            </span>
          </p>

          {err && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{err}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isStarting}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={!focus.trim() || isStarting} onClick={launch}>
              {isStarting ? "Starting…" : "Build deck →"}
            </Button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
