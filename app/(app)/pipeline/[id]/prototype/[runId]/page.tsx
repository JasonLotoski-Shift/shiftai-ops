import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PrototypeBuildView } from "@/components/prototype-build-view";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PrototypeRunPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
  const session = await auth();
  if (!session?.user?.partnerId) notFound();
  const { id, runId } = await params;
  const run = await prisma.prototypeRun.findUnique({ where: { id: runId }, select: { id: true, clientName: true, dealId: true } });
  if (!run || run.dealId !== id) notFound();
  return (
    <div className="p-6 max-w-[1100px] mx-auto">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-bone text-lg">Prototype build · {run.clientName}</h1>
        <Link href={`/pipeline/${id}`} className="text-[12px] text-bone-mute hover:text-bone">← Back to deal</Link>
      </div>
      <PrototypeBuildView runId={runId} onRunAgain={() => {}} onDone={() => {}} />
    </div>
  );
}
