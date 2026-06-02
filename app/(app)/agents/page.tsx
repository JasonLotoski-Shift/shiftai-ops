import { Header } from "@/components/header";
import { prisma } from "@/lib/prisma";
import { listSkills, readFirmContext } from "@/lib/skills";
import { AgentsViews } from "@/components/agents-views";

export default async function AgentsPage() {
  const [plans, skills, firm] = await Promise.all([
    prisma.agentPlan.findMany({
      include: { createdBy: { select: { name: true, initials: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    listSkills(),
    readFirmContext(),
  ]);

  // Flatten to plain props for the client component (Dates → ISO strings).
  const planProps = plans.map((p) => ({
    id: p.id,
    name: p.name,
    goal: p.goal,
    keyTasks: p.keyTasks,
    notes: p.notes,
    status: p.status,
    kind: p.kind,
    createdByName: p.createdBy.name,
    updatedAt: p.updatedAt.toISOString(),
  }));

  return (
    <>
      <Header eyebrow="Firm · Agents & MCPs" title="Agents & MCPs." />
      <AgentsViews plans={planProps} skills={skills} firmContext={firm.body} />
    </>
  );
}
