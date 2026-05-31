import { Sparkles } from "lucide-react";
import { Header } from "@/components/header";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { updates, type UpdateTag } from "@/lib/data/updates";

// Static "what's new" log. Entries live in lib/data/updates.ts (dev-authored).
// No DB — just a plain-English changelog the partners can skim.

const tag: Record<UpdateTag, { tone: "gold" | "steel" | "bone"; label: string }> = {
  new: { tone: "gold", label: "New" },
  improved: { tone: "steel", label: "Improved" },
  fixed: { tone: "bone", label: "Fixed" },
};

export default function UpdatesPage() {
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

      <div className="px-8 py-8 flex flex-col gap-8 max-w-[760px]">
        {groups.map((group) => (
          <div key={group.date} className="flex flex-col gap-3">
            <span className="text-[11px] text-bone-dim">{formatDate(group.date)}</span>
            {group.items.map((u, i) => (
              <Card key={`${group.date}-${i}`}>
                <CardBody className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-3">
                    <Badge tone={tag[u.tag].tone}>{tag[u.tag].label}</Badge>
                    <span className="text-[15px] text-bone">{u.title}</span>
                  </div>
                  {u.detail && (
                    <p className="text-[13px] text-bone-dim leading-relaxed">{u.detail}</p>
                  )}
                </CardBody>
              </Card>
            ))}
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
