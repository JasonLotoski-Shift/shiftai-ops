import { Suspense } from "react";
import { Users } from "lucide-react";
import { Header } from "@/components/header";
import { Card, Stat, EmptyState } from "@/components/ui";
import { AddContact } from "@/components/add-contact";
import { ContactsList, type ContactRow } from "@/components/contacts-list";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { daysSince } from "@/lib/format";
import type { Industry } from "@/lib/types";

export default async function ContactsPage() {
  const [contacts, partners, session] = await Promise.all([
    prisma.contact.findMany({
      // Only the columns the list row renders — drops ~21 unused wide columns.
      select: {
        id: true,
        name: true,
        title: true,
        company: true,
        industry: true,
        subIndustry: true,
        lastTouchAt: true,
        partnerLead: { select: { initials: true, name: true } },
      },
      orderBy: { lastTouchAt: "desc" },
    }),
    prisma.partner.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    auth(),
  ]);

  const industryCount = new Set(contacts.map((c) => c.industry)).size;
  const coldCount = contacts.filter((c) => daysSince(c.lastTouchAt) > 30).length;

  const rows: ContactRow[] = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    company: c.company,
    industry: c.industry as Industry,
    subIndustry: c.subIndustry ?? null,
    lastTouchAt: c.lastTouchAt.toISOString(),
    partnerLeadInitials: c.partnerLead.initials,
    partnerLeadFirstName: c.partnerLead.name.split(" ")[0],
  }));

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
            <ContactsList contacts={rows} />
          )}
        </Card>
      </div>
    </>
  );
}
