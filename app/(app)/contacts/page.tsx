import { Suspense } from "react";
import Link from "next/link";
import { Header } from "@/components/header";
import { Label, Badge, Card } from "@/components/ui";
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

      <div className="px-8 py-6 border-b border-graphite flex items-center gap-8">
        <div className="flex flex-col gap-1">
          <Label>— Total contacts</Label>
          <span className="mono text-[24px] text-bone tabular-nums">{contacts.length}</span>
        </div>
        <div className="flex flex-col gap-1">
          <Label>— Across industries</Label>
          <span className="mono text-[24px] text-bone tabular-nums">{industryCount}</span>
        </div>
        <div className="flex flex-col gap-1">
          <Label>— Cold 30d+</Label>
          <span className="mono text-[24px] text-flag-red tabular-nums">{coldCount}</span>
        </div>
      </div>

      <div className="px-8 py-8">
        <Card>
          <div className="grid grid-cols-[2fr_2fr_1fr_1fr_120px] gap-4 px-5 py-3 border-b border-graphite">
            <span className="label">Contact</span>
            <span className="label">Company</span>
            <span className="label">Industry</span>
            <span className="label">Partner lead</span>
            <span className="label text-right">Last touch</span>
          </div>

          {contacts.map((c) => {
            const stale = daysSince(c.lastTouchAt) > 30;
            return (
              <Link
                key={c.id}
                href={`/contacts/${c.id}`}
                className="grid grid-cols-[2fr_2fr_1fr_1fr_120px] gap-4 px-5 py-4 hover:bg-graphite/40 transition-colors"
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
                  <div className="w-5 h-5 bg-graphite-2 flex items-center justify-center mono text-[9px] text-bone-dim rounded-[var(--radius-pill)]">
                    {c.partnerLead.initials}
                  </div>
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
        </Card>
      </div>
    </>
  );
}
