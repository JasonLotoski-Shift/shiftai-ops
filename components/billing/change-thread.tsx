// Change thread — append-only audit history for a record, rendered as a
// vertical timeline. Presentational (no state); takes AuditEntry[] from
// lib/audit-read. Reused on the invoice detail page and the project billing
// view. AGENT actors render gold with a bot glyph.

import { Bot } from "lucide-react";
import { Card, CardHeader, CardBody, EmptyState } from "@/components/ui";
import type { AuditEntry } from "@/lib/audit-read";

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Pull a couple of before/after pairs out of a changes blob for display.
function diffBits(changes: unknown): string[] {
  if (!changes || typeof changes !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(changes as Record<string, unknown>)) {
    if (v && typeof v === "object" && "before" in v && "after" in v) {
      const b = (v as { before: unknown }).before;
      const a = (v as { after: unknown }).after;
      out.push(`${k}: ${String(b)} → ${String(a)}`);
    }
  }
  return out.slice(0, 4);
}

const VERBS: Record<string, string> = {
  "create.invoice": "Drafted an invoice",
  "generate.invoice": "Generated & sent the invoice",
  "send.invoice": "Marked the invoice sent",
  "update.invoice.sent": "Marked the invoice sent",
  "update.invoice.paid": "Marked the invoice paid",
  "update.invoice.fields": "Edited the invoice",
  "create.installment": "Added a billing installment",
  "update.installment": "Edited a billing installment",
  "delete.installment": "Removed a billing installment",
  "update.installment.order": "Reordered the billing schedule",
  "generate.schedule": "Generated the 50/25/25 schedule",
  "update.project.fee": "Changed the project value",
  "create.economicsLine": "Added an economics line",
  "update.economicsLine": "Edited an economics line",
  "delete.economicsLine": "Removed an economics line",
  "recompute.payouts": "Recomputed consultant payouts",
  "update.payout": "Adjusted a consultant payout",
  "pay.payout": "Paid a consultant",
  "confirm.payout": "Confirmed a payout was received",
  "approve.scopePricing": "Approved scope pricing",
  "extract.scopePricing": "Extracted scope pricing",
};

function humanize(entry: AuditEntry): string {
  return VERBS[entry.action] ?? entry.action.replace(/\./g, " ");
}

export function ChangeThread({
  entries,
  title = "Change log",
}: {
  entries: AuditEntry[];
  title?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="title-md">{title}</h2>
      </CardHeader>
      {entries.length === 0 ? (
        <EmptyState title="No changes logged yet" hint="Edits to invoices, the schedule, economics, and payouts will appear here." compact />
      ) : (
        <CardBody className="pt-0 flex flex-col">
          {entries.map((e) => {
            const isAgent = e.actorLabel.startsWith("AGENT");
            const bits = diffBits(e.changes);
            return (
              <div key={e.id} className="flex gap-3 py-2.5 border-t border-graphite/40 first:border-t-0">
                <div className={`mt-0.5 shrink-0 ${isAgent ? "text-track-gold" : "text-bone-mute"}`}>
                  {isAgent ? <Bot size={13} strokeWidth={1.5} /> : <span className="inline-block w-1.5 h-1.5 rounded-full bg-bone-mute mt-1.5" />}
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="text-[13px] text-bone">
                    {humanize(e)}
                    <span className={`ml-2 text-[11px] ${isAgent ? "text-track-gold" : "text-bone-mute"}`}>{e.actorLabel}</span>
                  </div>
                  {bits.length > 0 && (
                    <div className="text-[11px] text-bone-mute mono truncate">{bits.join(" · ")}</div>
                  )}
                  <span className="mono text-[10px] text-bone-mute tabular-nums">{fmt(e.ts)}</span>
                </div>
              </div>
            );
          })}
        </CardBody>
      )}
    </Card>
  );
}
