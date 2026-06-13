import { Header } from "@/components/header";
import { Card, Stat } from "@/components/ui";
import { TasksBoard } from "@/components/tasks-board";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export default async function TasksPage() {
  const session = await auth();
  const currentPartnerId = session?.user?.partnerId ?? "";

  // Archived milestones auto-hide from the board after 7 days (kept in the DB).
  const archiveCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // The firm-wide board. Milestones are the universal parent (epics with
  // sub-tasks); orphan tasks (no milestone) ride alongside them. Filtering
  // happens client-side in TasksBoard.
  const [milestones, orphanTasks, partners, projects, clients, deals, contacts] = await Promise.all([
    // Every milestone with its owner, sub-tasks (+ each task's owner), and the
    // record it's tied to. The board groups by boardStatus, not status. Skip
    // milestones archived more than 7 days ago (the Archive column auto-hide).
    prisma.milestone.findMany({
      where: {
        OR: [{ archivedAt: null }, { archivedAt: { gte: archiveCutoff } }],
      },
      include: {
        owner: { select: { id: true, name: true, initials: true } },
        tasks: {
          include: { owner: { select: { id: true, name: true, initials: true } } },
          orderBy: [{ done: "asc" }, { due: "asc" }],
        },
        project: { select: { id: true, name: true } },
        client: { select: { id: true, company: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Orphan tasks — no milestone, and not archived (archived tasks ride in the
    // Archive column alongside archived milestones). These render as flat cards.
    prisma.task.findMany({
      where: {
        milestoneId: null,
        OR: [{ archivedAt: null }, { archivedAt: { gte: archiveCutoff } }],
      },
      include: {
        owner: { select: { id: true, name: true, initials: true } },
        project: { select: { id: true, name: true } },
        client: { select: { id: true, company: true } },
        deal: { select: { id: true, company: true } },
        contact: { select: { id: true, name: true } },
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
    // Contacts for the task scope picker (2b) — a task can hang off a person.
    prisma.contact.findMany({
      select: { id: true, name: true, company: true },
      orderBy: { name: "asc" },
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
    archivedAt: m.archivedAt ? m.archivedAt.toISOString() : null,
    projectId: m.projectId,
    clientId: m.clientId,
    project: m.project ? { id: m.project.id, name: m.project.name } : null,
    client: m.client ? { id: m.client.id, company: m.client.company ?? "Untitled client" } : null,
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
    archivedAt: t.archivedAt ? t.archivedAt.toISOString() : null,
    ownerId: t.ownerId,
    owner: t.owner ? { id: t.owner.id, name: t.owner.name, initials: t.owner.initials } : null,
    projectId: t.projectId,
    clientId: t.clientId,
    dealId: t.dealId,
    contactId: t.contactId,
    project: t.project ? { id: t.project.id, name: t.project.name } : null,
    client: t.client ? { id: t.client.id, company: t.client.company ?? "Untitled client" } : null,
    deal: t.deal ? { id: t.deal.id, company: t.deal.company ?? "Untitled deal" } : null,
    contact: t.contact ? { id: t.contact.id, name: t.contact.name } : null,
  }));

  const boardClients = clients.map((c) => ({ id: c.id, company: c.company ?? "Untitled client" }));
  const boardDeals = deals.map((d) => ({ id: d.id, company: d.company ?? "Untitled deal" }));
  const boardContacts = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    company: c.company ?? "",
  }));

  // Stats over orphan tasks + every active milestone's sub-tasks (archived
  // milestones drop out of the open/high/mine counts).
  const allTasks = [
    ...boardOrphans.filter((t) => !t.archivedAt),
    ...boardMilestones.filter((m) => !m.archivedAt).flatMap((m) => m.tasks),
  ];
  const openTasks = allTasks.filter((t) => !t.done);
  const highPriority = openTasks.filter((t) => t.priority === "high").length;
  const mine = openTasks.filter((t) => t.ownerId === currentPartnerId).length;

  return (
    // Pin the whole page to the viewport so the board below can own an internal
    // vertical scroll region (its `flex-1 min-h-0 overflow-auto` needs a parent
    // with a *definite* height to scroll instead of growing the document, which
    // is what makes the sticky column headers actually stick). Scoped to this
    // page only — the app shell stays unbounded so other routes scroll normally.
    <div className="h-screen flex flex-col overflow-hidden">
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
          contacts={boardContacts}
          currentPartnerId={currentPartnerId}
        />
      </div>
    </div>
  );
}
