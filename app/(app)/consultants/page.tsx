import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { prisma } from "@/lib/prisma";
import { RosterEditor } from "@/components/consultants/roster-editor";

// The firm's people roster (the unified People model). Reachable from Billing —
// every person the firm works with: partners (who also log in) and external
// contractors, with their billable pay rate. Partners are linked by partnerId.
export default async function ConsultantsPage() {
  const [consultants, partners] = await Promise.all([
    prisma.consultant.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { partner: { select: { id: true, name: true } } },
    }),
    prisma.partner.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows = consultants.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    payRateCents: c.defaultPayRateCents,
    email: c.email,
    active: c.active,
    partnerId: c.partnerId,
    partnerName: c.partner?.name ?? null,
  }));

  return (
    <>
      <Header eyebrow="Firm · team & pay roster" title="Team." />
      <div className="px-8 py-8 flex flex-col gap-6">
        <Link href="/invoices" className="label hover:text-bone flex items-center gap-2">
          <ArrowLeft size={12} strokeWidth={1.5} />
          Back to billing
        </Link>
        <RosterEditor consultants={rows} partners={partners} />
      </div>
    </>
  );
}
