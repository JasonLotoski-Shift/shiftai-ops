import { Header } from "@/components/header";
import { Card, Stat } from "@/components/ui";
import { FeatureRequestsBoard } from "@/components/feature-requests-board";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export default async function FeatureRequestsPage() {
  const session = await auth();
  const currentPartnerId = session?.user?.partnerId ?? "";

  const [requests, partners] = await Promise.all([
    prisma.featureRequest.findMany({
      include: { createdBy: { select: { id: true, name: true, initials: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.partner.findMany({
      select: { id: true, name: true, initials: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Coerce dates to ISO strings for the client component.
  const items = requests.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    type: r.type,
    status: r.status,
    areaTab: r.areaTab,
    areaSubTab: r.areaSubTab,
    createdById: r.createdById,
    createdBy: r.createdBy
      ? { id: r.createdBy.id, name: r.createdBy.name, initials: r.createdBy.initials }
      : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  const openCount = items.filter((i) => i.status === "open").length;
  const inProgressCount = items.filter((i) => i.status === "in_progress").length;
  const brokenCount = items.filter(
    (i) => (i.type === "broken" || i.type === "bug") && i.status !== "done" && i.status !== "declined",
  ).length;

  return (
    <div>
      <Header eyebrow="The firm · Build" title="Feature Requests & Fixes." />

      <div className="px-8 pt-8">
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-5">
            <Stat label="Open" value={openCount} />
          </Card>
          <Card className="p-5">
            <Stat label="In progress" value={inProgressCount} />
          </Card>
          <Card className="p-5">
            <Stat label="Bugs / broken (open)" value={brokenCount} gold />
          </Card>
        </div>
      </div>

      <FeatureRequestsBoard
        items={items}
        partners={partners}
        currentPartnerId={currentPartnerId}
      />
    </div>
  );
}
