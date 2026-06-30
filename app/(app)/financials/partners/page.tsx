import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { prisma } from "@/lib/prisma";
import { currentIsManagingPartner } from "@/lib/permissions";
import { rollupCommissionByPartner } from "@/lib/billing/commission-read";
import { PartnerEconomicsTable, type PartnerEconomicsRow } from "@/components/billing/partner-economics-table";

// Per-partner economics — take-home owed/paid (ConsultantPayout), origination
// earnings, and deal-source commission, one row per partner. The single most
// sensitive money view: managing partners only (hard redirect, no partial render).
export default async function PartnerEconomicsPage() {
  const managingPartner = await currentIsManagingPartner();
  if (!managingPartner) redirect("/financials");

  const [partners, payouts, commissionLines] = await Promise.all([
    prisma.partner.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.consultantPayout.findMany({
      select: { amount: true, status: true, consultant: { select: { partnerId: true } } },
    }),
    prisma.commissionLine.findMany({
      select: {
        kind: true,
        partnerId: true,
        externalName: true,
        payouts: { select: { amount: true, status: true, stream: true } },
      },
    }),
  ]);

  // Take-home owed/paid per partner (ConsultantPayout via Consultant.partnerId 1:1).
  const takeHome = new Map<string, { owed: number; paid: number }>();
  for (const p of payouts) {
    const pid = p.consultant.partnerId;
    if (!pid) continue;
    let v = takeHome.get(pid);
    if (!v) {
      v = { owed: 0, paid: 0 };
      takeHome.set(pid, v);
    }
    if (p.status === "owed") v.owed += p.amount;
    else v.paid += p.amount; // paid | confirmed
  }

  // Commission per partner — origination + source build + recurring, read once from
  // the unified CommissionLine + CommissionPayout model (§9.6). External referrers
  // are excluded by the rollup (they are not partners).
  const commByPartner = rollupCommissionByPartner(commissionLines);

  const rows: PartnerEconomicsRow[] = partners
    .map((p) => {
      const th = takeHome.get(p.id) ?? { owed: 0, paid: 0 };
      const comm = commByPartner.get(p.id) ?? { originationEarned: 0, sourceBuildEarned: 0, recurringEarned: 0, paid: 0 };
      return {
        partnerId: p.id,
        partnerName: p.name,
        takeHomeOwed: th.owed,
        takeHomePaid: th.paid,
        originationEarned: comm.originationEarned,
        commissionBuildEarned: comm.sourceBuildEarned,
        commissionRecurring: comm.recurringEarned,
        totalEarned: th.owed + th.paid + comm.originationEarned + comm.sourceBuildEarned + comm.recurringEarned,
      };
    })
    .filter(
      (r) => r.takeHomeOwed || r.takeHomePaid || r.originationEarned || r.commissionBuildEarned || r.commissionRecurring,
    );

  return (
    <>
      <Header
        eyebrow="Finance · partner economics"
        title="Partner economics."
        actions={
          <Link href="/financials" className="label hover:text-bone flex items-center gap-2">
            <ArrowLeft size={12} strokeWidth={1.5} />
            Financials
          </Link>
        }
      />
      <div className="px-8 py-8">
        <PartnerEconomicsTable rows={rows} />
      </div>
    </>
  );
}
