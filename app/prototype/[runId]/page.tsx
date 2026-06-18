// Top-level route (OUTSIDE the (app) group) → renders WITHOUT the ops sidebar/chrome.
// A focused, full-bleed run view. Auth-gated by middleware + the check below.
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PrototypeBuildView } from "@/components/prototype-build-view";

export const dynamic = "force-dynamic";

export default async function PrototypeRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const session = await auth();
  if (!session?.user?.partnerId) redirect("/login");
  const { runId } = await params;
  const run = await prisma.prototypeRun.findUnique({
    where: { id: runId },
    select: { clientName: true, dealId: true, kind: true },
  });
  if (!run || !run.dealId) notFound();
  return <PrototypeBuildView runId={runId} dealId={run.dealId} clientName={run.clientName} kind={run.kind} />;
}
