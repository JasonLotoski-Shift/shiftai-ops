import { Header } from "@/components/header";
import { Card, Stat } from "@/components/ui";
import { FirmKnowledgeBrowser, type KnowledgeRow, type CategoryCard } from "@/components/firm-knowledge-browser";
import { prisma } from "@/lib/prisma";
import { currentIsManagingPartner } from "@/lib/permissions";

// Firm Knowledge — the central brain. Phase 1 browses the firm-wide records
// that already exist (Artifacts with no Client/Project/Deal scope), filed into
// the new knowledge taxonomy. force-dynamic is inherited from the (app) layout.

const DAY_MS = 86_400_000;

/** Stale if the item is older than its category's review cadence. No cadence
 *  (continuous, or uncategorised) never auto-flags. Falls back to createdAt so a
 *  brand-new, never-verified item isn't flagged on day one. */
function computeStale(lastVerifiedAt: Date | null, createdAt: Date, cadenceDays: number | null): boolean {
  if (!cadenceDays || cadenceDays <= 0) return false;
  const base = lastVerifiedAt ?? createdAt;
  return (Date.now() - base.getTime()) / DAY_MS > cadenceDays;
}

export default async function FirmKnowledgePage() {
  const [categories, artifacts, isManaging] = await Promise.all([
    prisma.knowledgeCategory.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        slug: true,
        label: true,
        description: true,
        reviewCadenceDays: true,
        steward: { select: { name: true, initials: true } },
      },
    }),
    prisma.artifact.findMany({
      // Phase 1 = firm-wide knowledge only: artifacts with no client/project/deal scope.
      where: { clientId: null, projectId: null, dealId: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        driveUrl: true,
        createdBy: true,
        generatedFromSkill: true,
        createdAt: true,
        lastVerifiedAt: true,
        confidence: true,
        sensitivity: true,
        knowledgeCategoryId: true,
        knowledgeCategory: { select: { slug: true, label: true, reviewCadenceDays: true } },
        owner: { select: { name: true, initials: true } },
      },
    }),
    currentIsManagingPartner(),
  ]);

  // Retrieval-time-style gate at the page boundary: managing-partner items never
  // reach a non-managing-partner session. (Firm economics is out of v1, so this
  // is defensive — but the gate ships now so it's never an afterthought.)
  const visible = isManaging ? artifacts : artifacts.filter((a) => a.sensitivity !== "managing_partner");

  const rows: KnowledgeRow[] = visible.map((a) => ({
    id: a.id,
    title: a.title,
    type: a.type,
    categorySlug: a.knowledgeCategory?.slug ?? null,
    categoryLabel: a.knowledgeCategory?.label ?? null,
    ownerName: a.owner?.name ?? null,
    ownerInitials: a.owner?.initials ?? null,
    confidence: a.confidence ?? null,
    sensitivity: a.sensitivity,
    createdBy: a.createdBy,
    generatedFromSkill: a.generatedFromSkill,
    createdAt: a.createdAt.toISOString(),
    lastVerifiedAt: a.lastVerifiedAt ? a.lastVerifiedAt.toISOString() : null,
    driveUrl: a.driveUrl,
    isStale: computeStale(a.lastVerifiedAt, a.createdAt, a.knowledgeCategory?.reviewCadenceDays ?? null),
  }));

  // Per-category counts + stale tally computed from the visible firm-wide set,
  // so the cards always match the table below.
  const cards: CategoryCard[] = categories.map((c) => {
    const inCat = rows.filter((r) => r.categorySlug === c.slug);
    return {
      id: c.id,
      slug: c.slug,
      label: c.label,
      description: c.description,
      stewardName: c.steward?.name ?? null,
      stewardInitials: c.steward?.initials ?? null,
      count: inCat.length,
      staleCount: inCat.filter((r) => r.isStale).length,
    };
  });

  const uncategorised = rows.filter((r) => !r.categorySlug).length;
  const staleTotal = rows.filter((r) => r.isStale).length;

  return (
    <>
      <Header eyebrow="The firm's central brain" title="Firm knowledge." />

      <div className="px-8 py-8 flex flex-col gap-8">
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-5">
            <Stat label="Knowledge items" value={rows.length} />
          </Card>
          <Card className="p-5">
            <Stat label="Categories" value={categories.length} />
          </Card>
          <Card className="p-5">
            <Stat label="Needs review" value={staleTotal} />
          </Card>
          <Card className="p-5">
            <Stat label="Uncategorised" value={uncategorised} />
          </Card>
        </div>

        <FirmKnowledgeBrowser categories={cards} rows={rows} uncategorised={uncategorised} />
      </div>
    </>
  );
}
