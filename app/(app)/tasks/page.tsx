import { Header } from "@/components/header";
import { Label } from "@/components/ui";
import { TasksViews } from "@/components/tasks-views";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export default async function TasksPage() {
  const session = await auth();
  const currentPartnerId = session?.user?.partnerId ?? "";

  const [tasks, partners] = await Promise.all([
    prisma.task.findMany({
      include: { owner: true, assignedBy: true },
      // Open tasks first, then soonest due.
      orderBy: [{ done: "asc" }, { due: "asc" }],
    }),
    prisma.partner.findMany({
      select: { id: true, name: true, initials: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const openTasks = tasks.filter((t) => !t.done);
  const highPriority = openTasks.filter((t) => t.priority === "high").length;
  const mine = openTasks.filter((t) => t.ownerId === currentPartnerId).length;

  return (
    <>
      <Header eyebrow="The firm · Do" title="Tasks." />

      <div className="px-8 py-6 border-b border-graphite flex items-center gap-8">
        <div className="flex flex-col gap-1">
          <Label>— Open</Label>
          <span className="mono text-[24px] text-bone tabular-nums">{openTasks.length}</span>
        </div>
        <div className="flex flex-col gap-1">
          <Label>— High priority</Label>
          <span className="mono text-[24px] text-flag-red tabular-nums">{highPriority}</span>
        </div>
        <div className="flex flex-col gap-1">
          <Label>— Assigned to you</Label>
          <span className="mono text-[24px] text-track-gold tabular-nums">{mine}</span>
        </div>
      </div>

      <div className="px-8 py-8">
        <TasksViews
          initialTasks={tasks}
          partners={partners}
          currentPartnerId={currentPartnerId}
        />
      </div>
    </>
  );
}
