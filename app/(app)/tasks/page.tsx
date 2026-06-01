import { Header } from "@/components/header";
import { Card, Stat } from "@/components/ui";
import { TasksBoard } from "@/components/tasks-board";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export default async function TasksPage() {
  const session = await auth();
  const currentPartnerId = session?.user?.partnerId ?? "";

  // Everyone sees every task — this is the firm-wide board. Filtering happens
  // client-side in TasksBoard. We pull each task with the bits the cards show:
  // owner, its milestone (title + category), and the project/client it ties to.
  const [tasks, milestones, partners, projects, clients] = await Promise.all([
    prisma.task.findMany({
      include: {
        owner: true,
        milestone: { select: { id: true, title: true, category: true } },
        project: { select: { id: true, name: true } },
        client: { select: { id: true, company: true } },
      },
      // Open tasks first, then soonest due — board groups by status anyway.
      orderBy: [{ done: "asc" }, { due: "asc" }],
    }),
    // All milestones, for the create-task / edit-task milestone pickers and the
    // milestone filter.
    prisma.milestone.findMany({
      select: { id: true, title: true, category: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.partner.findMany({
      select: { id: true, name: true, initials: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.client.findMany({
      select: { id: true, company: true },
      orderBy: { company: "asc" },
    }),
  ]);

  // Coerce nullable display fields (milestone.category, client.company) to safe
  // values the board can key its colour maps on.
  const boardTasks = tasks.map((t) => ({
    ...t,
    milestone: t.milestone
      ? { id: t.milestone.id, title: t.milestone.title, category: t.milestone.category ?? "other" }
      : null,
    client: t.client ? { id: t.client.id, company: t.client.company ?? "Untitled client" } : null,
  }));

  const boardMilestones = milestones.map((m) => ({
    id: m.id,
    title: m.title,
    category: m.category ?? "other",
  }));

  const boardClients = clients.map((c) => ({ id: c.id, company: c.company ?? "Untitled client" }));

  const openTasks = tasks.filter((t) => !t.done);
  const highPriority = openTasks.filter((t) => t.priority === "high").length;
  const mine = openTasks.filter((t) => t.ownerId === currentPartnerId).length;

  return (
    <>
      <Header eyebrow="The firm · Do" title="Tasks." />

      <div className="flex flex-col flex-1 min-h-0">
        <div className="px-8 pt-8">
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-5">
              <Stat label="Open" value={openTasks.length} />
            </Card>
            <Card className="p-5">
              <Stat label="High priority" value={highPriority} />
            </Card>
            <Card className="p-5">
              <Stat label="Assigned to you" value={mine} gold />
            </Card>
          </div>
        </div>

        <TasksBoard
          tasks={boardTasks}
          milestones={boardMilestones}
          partners={partners}
          projects={projects}
          clients={boardClients}
          currentPartnerId={currentPartnerId}
        />
      </div>
    </>
  );
}
