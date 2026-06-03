"use client";

// LeadEmailPanel — the cold-outreach composer on a lead detail page.
//
// Pick a person, "Draft cold email" (calls the cold-outreach skill), review +
// edit subject/body, Save draft, then "Send & add to funnel" — which (D36)
// converts the lead into a pipeline Deal at stage "lead" (awaiting reply) and
// routes to that deal. If the URL carried ?compose=1 the panel scrolls itself
// into view on mount.
//
// For a lead already converted ("added") this renders the read-only state with
// a link to the deal it became.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Label, Select, Input, Textarea, Button, Badge } from "@/components/ui";
import { draftLeadEmail, saveLeadEmail, sendColdEmail } from "@/app/(app)/pipeline/leads/actions";
import { Sparkles, Mail, Send, ArrowRight } from "lucide-react";
import type { ProspectLead, ProspectPerson } from "@/lib/types";

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

export function LeadEmailPanel({ lead, autoOpen = false }: { lead: ProspectLead; autoOpen?: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  const people: ProspectPerson[] = lead.people;
  const [personIndex, setPersonIndex] = useState(lead.outreachPersonIndex ?? 0);
  const [subject, setSubject] = useState(lead.outreachSubject ?? "");
  const [body, setBody] = useState(lead.outreachDraft ?? "");
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [pending, startTransition] = useTransition();

  const converted = lead.status === "added" && !!lead.convertedDealId;
  const hasDraft = subject.trim().length > 0 && body.trim().length > 0;

  useEffect(() => {
    if (autoOpen && ref.current) ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [autoOpen]);

  // ── Converted (read-only) view ───────────────────────────────────────────
  if (converted) {
    const person = lead.outreachPersonIndex != null ? people[lead.outreachPersonIndex] : undefined;
    return (
      <div ref={ref}>
      <Card className="p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Label gold>Cold outreach</Label>
          <Badge tone="bone">Added to funnel</Badge>
        </div>
        <span className="text-[12px] text-bone-mute">
          {lead.outreachSentAt
            ? `Emailed ${person ? person.name : "this lead"} on ${fmtDate(lead.outreachSentAt)} and added to the pipeline.`
            : "Added to the pipeline."}
        </span>
        {lead.outreachSubject && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-bone-mute uppercase tracking-wide">Subject</span>
            <span className="text-[13px] text-bone">{lead.outreachSubject}</span>
          </div>
        )}
        {lead.outreachDraft && (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-bone-mute uppercase tracking-wide">Body</span>
            <p className="text-[13px] text-bone-dim leading-relaxed whitespace-pre-wrap">{lead.outreachDraft}</p>
          </div>
        )}
        <Link
          href={`/pipeline/${lead.convertedDealId}`}
          className="inline-flex items-center gap-1.5 text-[12px] text-track-gold hover:underline mt-1"
        >
          View deal
          <ArrowRight size={13} strokeWidth={1.5} />
        </Link>
      </Card>
      </div>
    );
  }

  async function onDraft() {
    setError(null);
    setDrafting(true);
    try {
      const d = await draftLeadEmail(lead.id, personIndex);
      setSubject(d.subject);
      setBody(d.body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft failed");
    } finally {
      setDrafting(false);
    }
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      try {
        await saveLeadEmail(lead.id, { subject: subject.trim(), body: body.trim(), personIndex });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });
  }

  function onSend() {
    setError(null);
    startTransition(async () => {
      try {
        // Persist the latest edits, then convert the lead into a pipeline deal.
        await saveLeadEmail(lead.id, { subject: subject.trim(), body: body.trim(), personIndex });
        const { dealId } = await sendColdEmail(lead.id);
        router.push(`/pipeline/${dealId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't send & add to funnel");
      }
    });
  }

  const busy = drafting || pending;

  return (
    <div ref={ref}>
    <Card className="p-5 flex flex-col gap-4">
      <Label gold>Cold outreach</Label>
      <p className="text-[12px] text-bone-mute leading-relaxed">
        Draft a short cold intro with Claude, edit it, then send &amp; add to the funnel — it lands on the board as a
        deal awaiting reply. Nothing leaves the tool — you send from your own inbox.
      </p>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-bone-mute uppercase tracking-wide">Email to</span>
        <Select value={personIndex} onChange={(e) => setPersonIndex(Number(e.target.value))} disabled={busy}>
          {people.map((p, i) => (
            <option key={i} value={i}>
              {p.name}
              {p.title ? ` — ${p.title}` : ""}
              {p.email ? "" : " (no email)"}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Button variant="secondary" size="sm" onClick={onDraft} disabled={busy || people.length === 0}>
          <Sparkles size={13} strokeWidth={1.5} />
          {drafting ? "Drafting…" : hasDraft ? "Re-draft cold email" : "Draft cold email"}
        </Button>
      </div>

      {hasDraft && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-bone-mute uppercase tracking-wide">Subject</span>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-bone-mute uppercase tracking-wide">Body</span>
            <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} />
          </div>
        </>
      )}

      {error && <p className="text-[12px] text-flag-red">{error}</p>}

      {hasDraft && (
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={onSend} disabled={busy}>
            <Send size={13} strokeWidth={1.5} />
            Send &amp; add to funnel
          </Button>
          <Button variant="ghost" size="sm" onClick={onSave} disabled={busy}>
            <Mail size={13} strokeWidth={1.5} />
            Save draft
          </Button>
        </div>
      )}
    </Card>
    </div>
  );
}
