import { Header } from "@/components/header";
import { Card, Stat } from "@/components/ui";
import { IntrosBoard, type BoardIntro } from "@/components/intros-board";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// The Intro pipeline (Lane 4, Phase 8) — BD-via-relationship next to
// BD-via-outbound. A server component: queries Intro rows with their
// introducer / owner / target / deal relations, plus the pickers' option
// lists, and hands typed rows to the client board. Filtering + drag-drop
// happen client-side in IntrosBoard.
export default async function IntrosPage() {
  const session = await auth();
  const currentPartnerId = session?.user?.partnerId ?? "";

  const [intros, partners, contacts] = await Promise.all([
    prisma.intro.findMany({
      include: {
        introducer: { select: { id: true, name: true, company: true } },
        targetContact: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, initials: true } },
        deal: { select: { id: true, company: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.partner.findMany({
      select: { id: true, name: true, initials: true },
      orderBy: { name: "asc" },
    }),
    // Every contact for the pickers — channel partners lead the introducer
    // list in the modal; the flag rides along so the board can order them.
    prisma.contact.findMany({
      select: { id: true, name: true, company: true, isChannelPartner: true },
      orderBy: [{ isChannelPartner: "desc" }, { name: "asc" }],
    }),
  ]);

  const boardIntros: BoardIntro[] = intros.map((i) => ({
    id: i.id,
    targetCompany: i.targetCompany,
    status: i.status,
    notes: i.notes,
    introducerId: i.introducerId,
    introducer: { id: i.introducer.id, name: i.introducer.name, company: i.introducer.company ?? "" },
    targetContactId: i.targetContactId,
    targetContact: i.targetContact ? { id: i.targetContact.id, name: i.targetContact.name } : null,
    ownerId: i.ownerId,
    owner: i.owner ? { id: i.owner.id, name: i.owner.name, initials: i.owner.initials } : null,
    dealId: i.dealId,
    deal: i.deal ? { id: i.deal.id, company: i.deal.company ?? "Untitled deal" } : null,
    createdAt: i.createdAt.toISOString(),
  }));

  // Stats: intros in flight (not converted / declined / dead), converted count,
  // and a conversion rate over intros that reached a terminal state.
  const live = boardIntros.filter(
    (i) => i.status !== "converted" && i.status !== "declined" && i.status !== "dead",
  ).length;
  const converted = boardIntros.filter((i) => i.status === "converted").length;
  const terminal = boardIntros.filter(
    (i) => i.status === "converted" || i.status === "declined" || i.status === "dead",
  ).length;
  const conversionRate = terminal > 0 ? Math.round((converted / terminal) * 100) : 0;

  return (
    // Pin to the viewport so the board owns an internal horizontal-scroll region
    // (mirrors the tasks page). Scoped to this page; the app shell stays
    // unbounded so other routes scroll normally.
    <div className="h-screen flex flex-col overflow-hidden">
      <Header eyebrow="Pipeline · Relationships" title="Intros." />

      <div className="flex flex-col flex-1 min-h-0">
        <div className="px-8 pt-8">
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-5">
              <Stat label="In flight" value={live} />
            </Card>
            <Card className="p-5">
              <Stat label="Converted" value={converted} gold />
            </Card>
            <Card className="p-5">
              <Stat label="Conversion rate" value={`${conversionRate}%`} />
            </Card>
          </div>
        </div>

        <IntrosBoard
          initialIntros={boardIntros}
          partners={partners}
          contacts={contacts}
          currentPartnerId={currentPartnerId}
        />
      </div>
    </div>
  );
}
