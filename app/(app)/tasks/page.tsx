import { Header } from "@/components/header";
import { Card, Stat } from "@/components/ui";
import { TasksBoard } from "@/components/tasks-board";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export default async function TasksPage() {
  const session = await auth();
  const currentPartnerId = session?.user?.partnerId ?? "";

  // The firm-wide board. Milestones are the universal parent (epics with
  // sub-tasks); orphan tasks (no milestone) ride alongside them. Filtering
  // happens client-side in TasksBoard.
  const [milestones, orphanTasks, partners, projects, clients, deals] = await Promise.all([
    // Every milestone with its owner, sub-tasks (+ each task's owner), and the
    // record it's tied to. The board groups by boardStatus, not status.
    prisma.milestone.findMany({
      include: {
        owner: { select: { id: true, name: true, initials: true } },
        tasks: {
          include: { owner: { select: { id: true, name: true, initials: true } } },
          orderBy: [{ done: "asc" }, { due: "asc" }],
        },
        project: { select: { id: true, name: true } },
        client: { select: { id: true, company: true } },
        deal: { select: { id: true, company: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Orphan tasks — no milestone. These render as flat cards on the board.
    prisma.task.findMany({
      where: { milestoneId: null },
      include: {
        owner: { select: { id: true, name: true, initials: true } },
        project: { select: { id: true, name: true } },
        client: { select: { id: true, company: true } },
      },
      orderBy: [{ done: "asc" }, { due: "asc" }],
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
    prisma.deal.findMany({
      select: { id: true, company: true },
      orderBy: { company: "asc" },
    }),
  ]);

  // Coerce nullable display fields to safe values the board can render.
  const boardMilestones = milestones.map((m) => ({
    id: m.id,
    title: m.title,
    boardStatus: m.boardStatus,
    status: m.status,
    ownerId: m.ownerId,
    owner: m.owner ? { id: m.owner.id, name: m.owner.name, initials: m.owner.initials } : null,
    category: m.category ?? "other",
    categoryLabel: m.categoryLabel,
    dueDate: m.dueDate ? m.dueDate.toISOString() : null,
    projectId: m.projectId,
    clientId: m.clientId,
    dealId: m.dealId,
    project: m.project ? { id: m.project.id, name: m.project.name } : null,
    client: m.client ? { id: m.client.id, company: m.client.company ?? "Untitled client" } : null,
    deal: m.deal ? { id: m.deal.id, company: m.deal.company ?? "Untitled deal" } : null,
    tasks: m.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      done: t.done,
      priority: t.priority,
      due: t.due.toISOString(),
      context: t.context,
      ownerId: t.ownerId,
      owner: t.owner ? { id: t.owner.id, name: t.owner.name, initials: t.owner.initials } : null,
    })),
  }));

  const boardOrphans = orphanTasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    done: t.done,
    priority: t.priority,
    due: t.due.toISOString(),
    context: t.context,
    category: t.category ?? "other",
    categoryLabel: t.categoryLabel,
    ownerId: t.ownerId,
    owner: t.owner ? { id: t.owner.id, name: t.owner.name, initials: t.owner.initials } : null,
    projectId: t.projectId,
    clientId: t.clientId,
    project: t.project ? { id: t.project.id, name: t.project.name } : null,
    client: t.client ? { id: t.client.id, company: t.client.company ?? "Untitled client" } : null,
  }));

  const boardClients = clients.map((c) => ({ id: c.id, company: c.company ?? "Untitled client" }));
  const boardDeals = deals.map((d) => ({ id: d.id, company: d.company ?? "Untitled deal" }));

  // Stats over orphan tasks + every milestone sub-task.
  const allTasks = [
    ...boardOrphans,
    ...boardMilestones.flatMap((m) => m.tasks),
  ];
  const openTasks = allTasks.filter((t) => !t.done);
  const highPriority = openTasks.filter((t) => t.priority === "high").length;
  const mine = openTasks.filter((t) => t.ownerId === currentPartnerId).length;

  return (
    <>
      <Header eyebrow="The firm · Do" title="Task Board." />

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
          milestones={boardMilestones}
          orphanTasks={boardOrphans}
          partners={partners}
          projects={projects}
          clients={boardClients}
          deals={boardDeals}
          currentPartnerId={currentPartnerId}
        />
      </div>
    </>
  );
}
