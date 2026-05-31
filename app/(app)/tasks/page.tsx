import { Header } from "@/components/header";
import { Card, Stat, EmptyState } from "@/components/ui";
import { TasksViews } from "@/components/tasks-views";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { CheckSquare } from "lucide-react";

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

      <div className="px-8 py-8 flex flex-col gap-8">
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

        {tasks.length === 0 ? (
          <EmptyState
            icon={CheckSquare}
            title="No tasks yet"
            hint="Tasks you create or get assigned will show up here."
          />
        ) : (
          <TasksViews
            initialTasks={tasks}
            partners={partners}
            currentPartnerId={currentPartnerId}
          />
        )}
      </div>
    </>
  );
}
