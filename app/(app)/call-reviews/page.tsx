import { Header } from "@/components/header";
import { Card, Stat } from "@/components/ui";
import { CallReviewsView, type CallReviewRow } from "@/components/call-reviews-view";
import { prisma } from "@/lib/prisma";
import { currentIsManagingPartner } from "@/lib/permissions";
import { dealLabel } from "@/lib/format";

// Call Reviews — the team-learning read-path. Every meeting lane (gold client
// calls, purple intro calls) distils a retro at ingest; this surface lists them,
// filters by partner / lane / date, and aggregates the recurring signal. A
// durable lesson promotes to the firm brain from here. force-dynamic is
// inherited from the (app) layout.

export default async function CallReviewsPage() {
  const isManaging = await currentIsManagingPartner();

  // Retrieval-time-style gate at the page boundary, matching the firm-knowledge
  // surfaces: managing-partner reviews never reach a non-MP session. The
  // sensitivity filter lives in the query so filtered rows never cross the wire.
  const reviews = await prisma.callReview.findMany({
    where: isManaging ? {} : { sensitivity: "firm_wide" },
    orderBy: { callDate: "desc" },
    select: {
      id: true,
      title: true,
      callDate: true,
      whatWorked: true,
      whatDidnt: true,
      lessons: true,
      coachingNotes: true,
      lane: true,
      status: true,
      sensitivity: true,
      promotedKnowledgeItemId: true,
      createdBy: true,
      client: { select: { company: true } },
      deal: { select: { name: true, company: true } },
      contact: { select: { name: true } },
    },
  });

  const rows: CallReviewRow[] = reviews.map((r) => ({
    id: r.id,
    title: r.title,
    callDate: r.callDate.toISOString(),
    whatWorked: r.whatWorked,
    whatDidnt: r.whatDidnt,
    lessons: r.lessons,
    coachingNotes: r.coachingNotes,
    lane: r.lane,
    status: r.status,
    sensitivity: r.sensitivity,
    promoted: !!r.promotedKnowledgeItemId,
    createdBy: r.createdBy,
    scope:
      r.client?.company ??
      (r.deal ? dealLabel(r.deal) : null) ??
      r.contact?.name ??
      null,
  }));

  // Headline counts. Every point is a chip on the surface, so the lesson tally
  // is the shortlist size across all visible reviews.
  const lessonCount = rows.reduce((sum, r) => sum + r.lessons.length, 0);
  const draftCount = rows.filter((r) => r.status === "draft").length;
  const promotedCount = rows.filter((r) => r.promoted).length;

  return (
    <>
      <Header
        eyebrow="What worked, what didn't, what to reuse"
        title="Call reviews."
      />

      <div className="px-8 py-8 flex flex-col gap-8">
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-5">
            <Stat label="Reviews" value={rows.length} />
          </Card>
          <Card className="p-5">
            <Stat label="Lessons captured" value={lessonCount} />
          </Card>
          <Card className="p-5">
            <Stat label="Awaiting approval" value={draftCount} />
          </Card>
          <Card className="p-5">
            <Stat label="Promoted to brain" value={promotedCount} />
          </Card>
        </div>

        <CallReviewsView rows={rows} />
      </div>
    </>
  );
}
