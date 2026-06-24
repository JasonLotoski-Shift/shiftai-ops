import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/header";
import { prisma } from "@/lib/prisma";
import { currentIsManagingPartner } from "@/lib/permissions";
import { economicsTotals, allocateLaborRevenue, buyoutAllocation } from "@/lib/billing/economics";
import { partnerOriginationEarnings, partnerCommissionEarnings } from "@/lib/billing/commissions";
import { PartnerEconomicsTable, type PartnerEconomicsRow } from "@/components/billing/partner-economics-table";

// Per-partner economics — take-home owed/paid (ConsultantPayout), origination
// earnings, and deal-source commission, one row per partner. The single most
// sensitive money view: managing partners only (hard redirect, no partial render).
export default async function PartnerEconomicsPage() {
  const managingPartner = await currentIsManagingPartner();
  if (!managingPartner) redirect("/financials");

  const [partners, projects, payouts, buildRows, accrualRows] = await Promise.all([
    prisma.partner.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({
      select: {
        projectType: true,
        budgetFee: true,
        originationPct: true,
        isFirstContract: true,
        economicsLines: { select: { hours: true, payRateCents: true, billRateCents: true, isExtra: true } },
        directCosts: { select: { amount: true } },
        originations: { select: { partnerId: true, sharePct: true } },
      },
    }),
    prisma.consultantPayout.findMany({
      select: { amount: true, status: true, consultant: { select: { partnerId: true } } },
    }),
    prisma.projectSourceCommission.findMany({ select: { buildAmount: true, partnerId: true, externalName: true } }),
    prisma.ongoingContractCommissionAccrual.findMany({
      select: { amount: true, status: true, periodStart: true, commission: { select: { partnerId: true, externalName: true } } },
    }),
  ]);

  // Origination $ per partner — recompute each project's alloc exactly like /financials.
  const projectsWithAlloc = projects.map((p) => {
    const totals = economicsTotals(
      p.economicsLines.map((l) => ({ hours: Number(l.hours), payRateCents: l.payRateCents, billRateCents: l.billRateCents, isExtra: l.isExtra })),
    );
    const directCosts = p.directCosts.reduce((s, c) => s + c.amount, 0);
    const alloc =
      p.projectType === "buyout"
        ? buyoutAllocation(p.budgetFee)
        : allocateLaborRevenue({
            laborBillable: totals.billableTotal,
            takeHome: totals.costTotal,
            directCosts,
            originationPct: Number(p.originationPct) / 100,
            isFirstContract: p.isFirstContract,
          });
    return { alloc: { origination: alloc.origination }, originations: p.originations.map((o) => ({ partnerId: o.partnerId, sharePct: Number(o.sharePct) })) };
  });
  const origByPartner = partnerOriginationEarnings(projectsWithAlloc);

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

  // Commission per partner.
  const commByPartner = partnerCommissionEarnings(
    buildRows.map((r) => ({ buildAmount: r.buildAmount, partnerId: r.partnerId, externalName: r.externalName })),
    accrualRows.map((a) => ({ amount: a.amount, status: a.status, periodStart: a.periodStart, partnerId: a.commission.partnerId, externalName: a.commission.externalName })),
  );

  const rows: PartnerEconomicsRow[] = partners
    .map((p) => {
      const th = takeHome.get(p.id) ?? { owed: 0, paid: 0 };
      const orig = origByPartner.get(p.id) ?? 0;
      const comm = commByPartner.get(p.id) ?? { buildEarned: 0, recurringProjected: 0, recurringAccrued: 0, recurringPaid: 0 };
      const recurringAll = comm.recurringProjected + comm.recurringAccrued + comm.recurringPaid;
      return {
        partnerId: p.id,
        partnerName: p.name,
        takeHomeOwed: th.owed,
        takeHomePaid: th.paid,
        originationEarned: orig,
        commissionBuildEarned: comm.buildEarned,
        commissionRecurring: recurringAll,
        totalEarned: th.owed + th.paid + orig + comm.buildEarned + recurringAll,
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
