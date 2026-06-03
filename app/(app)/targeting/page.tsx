import { Header } from "@/components/header";
import { prisma } from "@/lib/prisma";
import { TargetingViews } from "@/components/targeting-views";

export default async function TargetingPage() {
  const segments = await prisma.targetSegment.findMany({
    orderBy: [{ active: "desc" }, { priority: "desc" }, { updatedAt: "desc" }],
  });

  // Flatten to plain props for the client component (Dates → ISO strings).
  const segmentProps = segments.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    active: s.active,
    priority: s.priority,
    industries: s.industries,
    revenueMin: s.revenueMin,
    revenueMax: s.revenueMax,
    employeeMin: s.employeeMin,
    employeeMax: s.employeeMax,
    geographies: s.geographies,
    buyerPersonas: s.buyerPersonas,
    buyingSignals: s.buyingSignals,
    disqualifiers: s.disqualifiers,
    anchorCompanies: s.anchorCompanies,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  return (
    <>
      <Header eyebrow="Lead Agent · Targeting" title="Targeting." />
      <TargetingViews segments={segmentProps} />
    </>
  );
}
