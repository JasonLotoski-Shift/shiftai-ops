"use client";

// ContactChannelPanel — the per-contact channel-partner marker (Lane 4). A
// toggle that flags whether this person sends intros, plus an editable notes
// field for the relationship context (reach, terms, how they prefer to work).
// Kept a client child so the contact detail page stays a server component.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Handshake, Check } from "lucide-react";
import { Button, Label, Textarea } from "@/components/ui";
import { setChannelPartner } from "@/app/(app)/intros/actions";
import { cn } from "@/lib/cn";

export function ContactChannelPanel({
  contactId,
  isChannelPartner,
  channelNotes,
}: {
  contactId: string;
  isChannelPartner: boolean;
  channelNotes: string | null;
}) {
  const router = useRouter();
  const [flagged, setFlagged] = useState(isChannelPartner);
  const [notes, setNotes] = useState(channelNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(false);

  const dirty = flagged !== isChannelPartner || (notes.trim() || null) !== (channelNotes ?? null);

  async function toggle() {
    // Optimistic flip; the notes area appears/collapses with it. Persist on the
    // flip so the Contacts filter updates without a separate Save.
    const next = !flagged;
    setFlagged(next);
    setSaving(true);
    setError(null);
    setSavedAt(false);
    try {
      await setChannelPartner(contactId, { isChannelPartner: next });
      router.refresh();
    } catch (err) {
      console.error("setChannelPartner (toggle) failed:", err);
      setFlagged(!next); // revert
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function saveNotes() {
    setSaving(true);
    setError(null);
    setSavedAt(false);
    try {
      await setChannelPartner(contactId, { channelNotes: notes.trim() || null });
      setSavedAt(true);
      router.refresh();
    } catch (err) {
      console.error("setChannelPartner (notes) failed:", err);
      setError(err instanceof Error ? err.message : "Failed to save notes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Handshake size={14} strokeWidth={1.5} className="text-track-gold shrink-0" />
          <h2 className="title-md text-bone">Channel partner</h2>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={saving}
          role="switch"
          aria-checked={flagged}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
            flagged ? "bg-track-gold/70" : "bg-graphite",
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 rounded-full bg-bone transition-transform",
              flagged ? "translate-x-4" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      <p className="text-[12px] text-bone-dim leading-relaxed">
        {flagged
          ? "Flagged as someone who sends intros. They appear in the Contacts channel-partner filter, and you can log their intros on the Intros board."
          : "Turn this on for someone who introduces you to prospects. It surfaces them in the channel-partner filter and lets you track their intros."}
      </p>

      {flagged && (
        <div className="flex flex-col gap-2">
          <Label>Relationship notes</Label>
          <Textarea
            rows={3}
            placeholder="Their reach, terms, and how they prefer to work — e.g. ~1,000 issuer clients, declined a fee, likes an in-office list review."
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setSavedAt(false);
            }}
            disabled={saving}
          />
          <div className="flex items-center justify-between">
            {error ? (
              <span className="text-[11px] text-flag-red">{error}</span>
            ) : savedAt ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-signal-fresh">
                <Check size={11} strokeWidth={2} />
                Saved
              </span>
            ) : (
              <span />
            )}
            <Button size="sm" variant="secondary" onClick={saveNotes} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save notes"}
            </Button>
          </div>
        </div>
      )}

      {!flagged && error && <span className="text-[11px] text-flag-red">{error}</span>}
    </div>
  );
}
