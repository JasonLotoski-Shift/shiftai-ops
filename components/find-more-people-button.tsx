"use client";

// "Find more people" on a ProspectLead — runs the Apollo + website-scrape search
// and refreshes the people list. Discovery only; emails are revealed per person
// (the existing 1-credit reveal). Surfaces the count, how many we already have at
// the company, and any non-fatal notes.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { findMorePeopleAction } from "@/app/(app)/pipeline/leads/find-people-actions";

export function FindMorePeopleButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function run() {
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      try {
        const s = await findMorePeopleAction(leadId);
        const parts: string[] = [];
        if (s.added > 0) {
          parts.push(`+${s.added} ${s.added === 1 ? "person" : "people"}`);
          parts.push("reveal emails per person (1 credit each)");
        } else {
          parts.push("No new people found");
        }
        if (s.existingContacts > 0) {
          parts.push(`${s.existingContacts} already in your contacts here`);
        }
        const note = s.notes.length ? ` — ${s.notes.join(" ")}` : "";
        setMsg(parts.join(" · ") + note);
        if (s.added > 0) router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Find failed");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" onClick={run} disabled={pending}>
        <Users size={13} strokeWidth={1.5} />
        {pending ? "Finding…" : "Find more people"}
      </Button>
      {msg && <span className="text-[11px] text-bone-mute text-right max-w-[280px] leading-snug">{msg}</span>}
      {err && (
        <span className="flex items-center gap-1 text-[11px] text-flag-red">
          <ShieldAlert size={11} strokeWidth={1.5} />
          {err}
        </span>
      )}
    </div>
  );
}
