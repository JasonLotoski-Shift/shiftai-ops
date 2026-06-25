import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { prisma } from "@/lib/prisma";
import { RosterEditor } from "@/components/consultants/roster-editor";

// The firm's pay rate card. Reachable from Billing — manage the people we pay
// on projects (team members + external sub-consultants) and their fixed rates.
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
      <Header eyebrow="Firm · pay roster" title="Consultants." />
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
