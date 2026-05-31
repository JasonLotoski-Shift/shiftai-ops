import { Sparkles } from "lucide-react";
import { Header } from "@/components/header";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { updates, type UpdateTag } from "@/lib/data/updates";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MarkWhatsNewSeen } from "./mark-seen";

// Static "what's new" log. Entries live in lib/data/updates.ts (dev-authored).
// No DB for the entries — just a plain-English changelog the partners can skim.
// We do read the partner's whatsNewSeenAt to flag which entries are new to them.

const tag: Record<UpdateTag, { tone: "gold" | "steel" | "bone"; label: string }> = {
  new: { tone: "gold", label: "New" },
  improved: { tone: "steel", label: "Improved" },
  fixed: { tone: "bone", label: "Fixed" },
};

export default async function UpdatesPage() {
  // When this partner last viewed the changelog — entries dated after this are
  // "new" to them. Compare on the ISO date prefix (entries are date-only).
  const session = await auth();
  const partnerId = session?.user?.partnerId;
  const partner = partnerId
    ? await prisma.partner.findUnique({
        where: { id: partnerId },
        select: { whatsNewSeenAt: true },
      })
    : null;
  const seenDate = partner?.whatsNewSeenAt?.toISOString().slice(0, 10) ?? "";

  // Newest first.
  const sorted = [...updates].sort((a, b) => b.date.localeCompare(a.date));

  // Group consecutive entries by day so each date heading shows once.
  const groups: { date: string; items: typeof updates }[] = [];
  for (const u of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.date === u.date) last.items.push(u);
    else groups.push({ date: u.date, items: [u] });
  }

  return (
    <>
      <Header eyebrow="Reference" title="What's new" />
      {/* Mark the changelog seen for this partner (clears the sidebar dot). */}
      <MarkWhatsNewSeen />

      <div className="px-8 py-8 flex flex-col gap-8 max-w-[760px]">
        {groups.map((group) => (
          <div key={group.date} className="flex flex-col gap-3">
            <span className="text-[11px] text-bone-dim">{formatDate(group.date)}</span>
            {group.items.map((u, i) => {
              const isNew = u.date > seenDate;
              return (
                <Card key={`${group.date}-${i}`}>
                  <CardBody className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-3">
                      <Badge tone={tag[u.tag].tone}>{tag[u.tag].label}</Badge>
                      <span className={cn("text-[15px] text-bone", isNew && "font-semibold")}>{u.title}</span>
                      {isNew && (
                        <span className="ml-auto shrink-0 flex items-center gap-1.5 label text-[9px] text-track-gold">
                          <span className="w-1.5 h-1.5 rounded-full bg-flag-red" aria-hidden />
                          New to you
                        </span>
                      )}
                    </div>
                    {u.detail && (
                      <p className={cn("text-[13px] leading-relaxed", isNew ? "text-bone" : "text-bone-dim")}>{u.detail}</p>
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        ))}

        {groups.length === 0 && (
          <EmptyState
            icon={<Sparkles size={22} strokeWidth={1.5} />}
            title="No updates yet"
            hint="Changes to the tool will show up here as they ship."
            compact
          />
        )}
      </div>
    </>
  );
}
