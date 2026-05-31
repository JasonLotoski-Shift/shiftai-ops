import { Suspense } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Header } from "@/components/header";
import { Badge, Card, Stat, Avatar, EmptyState } from "@/components/ui";
import { AddContact } from "@/components/add-contact";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { daysSince } from "@/lib/format";
import { industryLabels } from "@/lib/data/seed";

export default async function ContactsPage() {
  const [contacts, partners, session] = await Promise.all([
    prisma.contact.findMany({
      include: { partnerLead: true },
      orderBy: { lastTouchAt: "desc" },
    }),
    prisma.partner.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    auth(),
  ]);

  const industryCount = new Set(contacts.map((c) => c.industry)).size;
  const coldCount = contacts.filter((c) => daysSince(c.lastTouchAt) > 30).length;

  return (
    <>
      <Header
        eyebrow="People · CRM"
        title="Contacts."
        actions={
          <Suspense fallback={null}>
            <AddContact partners={partners} defaultPartnerId={session?.user?.partnerId} />
          </Suspense>
        }
      />

      <div className="px-8 py-8 flex flex-col gap-8">
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-5">
            <Stat label="Total contacts" value={contacts.length} />
          </Card>
          <Card className="p-5">
            <Stat label="Across industries" value={industryCount} />
          </Card>
          <Card className="p-5">
            <Stat label="Cold 30d+" value={coldCount} />
          </Card>
        </div>

        <Card>
          {contacts.length === 0 ? (
            <EmptyState
              icon={<Users size={28} strokeWidth={1.5} />}
              title="No contacts yet"
              hint="Add your first contact to start tracking relationships."
            />
          ) : (
            <>
              <div className="grid grid-cols-[2fr_2fr_1fr_1fr_120px] gap-4 px-5 py-3">
                <span className="text-[11px] text-bone-dim">Contact</span>
                <span className="text-[11px] text-bone-dim">Company</span>
                <span className="text-[11px] text-bone-dim">Industry</span>
                <span className="text-[11px] text-bone-dim">Partner lead</span>
                <span className="text-[11px] text-bone-dim text-right">Last touch</span>
              </div>

              {contacts.map((c) => {
                const stale = daysSince(c.lastTouchAt) > 30;
                return (
                  <Link
                    key={c.id}
                    href={`/contacts/${c.id}`}
                    className="grid grid-cols-[2fr_2fr_1fr_1fr_120px] gap-4 px-5 py-4 hover:bg-[var(--color-row-hover)] transition-colors"
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[14px] text-bone truncate">{c.name}</span>
                      <span className="text-[11px] text-bone-mute truncate">{c.title}</span>
                    </div>
                    <span className="text-[13px] text-bone-dim truncate self-center">{c.company}</span>
                    <div className="self-center">
                      <Badge tone="bone">{industryLabels[c.industry]}</Badge>
                    </div>
                    <div className="flex items-center gap-2 self-center">
                      <Avatar initials={c.partnerLead.initials} size="sm" />
                      <span className="text-[12px] text-bone-dim truncate">{c.partnerLead.name.split(" ")[0]}</span>
                    </div>
                    <div className="text-right self-center">
                      <div className={`mono text-[12px] tabular-nums ${stale ? "text-flag-red" : "text-bone-dim"}`}>
                        {daysSince(c.lastTouchAt)}d ago
                      </div>
                    </div>
                  </Link>
                );
              })}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
