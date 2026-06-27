import Link from "next/link";
import { ArrowLeft, Scale, ShieldAlert } from "lucide-react";
import { Header } from "@/components/header";
import { Card, Badge, Avatar, EmptyState } from "@/components/ui";
import { NewDecisionDialog } from "@/components/new-decision-dialog";
import { KnowledgeApproveButton } from "@/components/knowledge-approve-button";
import { prisma } from "@/lib/prisma";
import { currentIsManagingPartner } from "@/lib/permissions";
import { formatDate } from "@/lib/format";

// Decision Log (ADR-style). Head-only view (superseded rows hidden). Managing-
// partner decisions never reach a non-MP session. Drafts show an Approve action;
// only approved decisions are retrievable by skills via fetchHistoricalKnowledge.

export default async function DecisionLogPage() {
  const [decisions, categories, isManaging] = await Promise.all([
    prisma.decisionRecord.findMany({
      where: { supersededBy: { none: {} } },
      orderBy: { decidedAt: "desc" },
      include: {
        decidedBy: { select: { name: true, initials: true } },
        category: { select: { label: true } },
      },
    }),
    prisma.knowledgeCategory.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, label: true },
    }),
    currentIsManagingPartner(),
  ]);

  const visible = isManaging ? decisions : decisions.filter((d) => d.sensitivity !== "managing_partner");

  return (
    <>
      <Header
        eyebrow="Firm knowledge"
        title="Decision log."
        actions={
          <NewDecisionDialog
            categories={categories}
            canSetManagingPartner={isManaging}
          />
        }
      />

      <div className="px-8 py-8 flex flex-col gap-6 max-w-[900px]">
        <Link href="/firm-knowledge" className="label hover:text-bone flex items-center gap-2 w-fit">
          <ArrowLeft size={12} strokeWidth={1.5} />
          Back to firm knowledge
        </Link>

        {visible.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Scale size={28} strokeWidth={1.5} />}
              title="No decisions logged yet"
              hint="Record the calls that shape the firm — what was decided, the options weighed, the consequences. Skills read approved decisions so they never contradict them."
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {visible.map((d) => {
              const approved = d.reviewStatus === "approved";
              return (
                <Card key={d.id} className="p-6 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="title-md text-bone">{d.title}</span>
                        {d.sensitivity === "managing_partner" && (
                          <Badge tone="gold" className="gap-1">
                            <ShieldAlert size={11} strokeWidth={1.5} />
                            MP only
                          </Badge>
                        )}
                        <Badge tone={approved ? "green" : "neutral"}>{approved ? "Approved" : "Draft"}</Badge>
                        {d.category && <Badge tone="neutral">{d.category.label}</Badge>}
                      </span>
                      <span className="label">Decided {formatDate(d.decidedAt.toISOString())}</span>
                    </div>
                    <span className="flex items-center gap-2 shrink-0">
                      {d.decidedBy ? (
                        <>
                          <Avatar initials={d.decidedBy.initials} size="sm" />
                          <span className="text-[12px] text-bone-mute">{d.decidedBy.name}</span>
                        </>
                      ) : (
                        <span className="text-[12px] text-bone-mute">{d.decidedByLabel ?? d.createdBy}</span>
                      )}
                    </span>
                  </div>

                  <Field label="Decision" value={d.decision} strong />
                  {d.context && <Field label="Context" value={d.context} />}
                  {d.optionsConsidered && <Field label="Options considered" value={d.optionsConsidered} />}
                  {d.consequences && <Field label="Consequences" value={d.consequences} />}

                  {!approved && (
                    <div className="pt-1">
                      <KnowledgeApproveButton id={d.id} kind="decision" />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function Field({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <p className={`text-[13px] leading-relaxed whitespace-pre-wrap ${strong ? "text-bone" : "text-bone-dim"}`}>{value}</p>
    </div>
  );
}
