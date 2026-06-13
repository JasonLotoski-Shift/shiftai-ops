"use server";

// Artifact (document/deliverable) server actions — cross-scope, since an
// Artifact can hang off a Deal, Project, or Client. Canonical mutation recipe
// (see app/(app)/dashboard/actions.ts header): auth → mutate + writeAudit in one
// transaction → revalidate the affected scope paths.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";
import { deleteFile, fileIdFromUrl } from "@/lib/drive";

// Delete a document: removes the underlying Drive file (permanent — Shared-Drive
// items skip the trash), then deletes the Artifact row and any tasks scoped to
// it. Drive deletion is best-effort: if the file is missing or Drive is
// unreachable we still remove the DB row so the card doesn't linger, and record
// the Drive outcome in the audit trail.
export async function deleteArtifact(artifactId: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(session.user.partnerId, session.user.name ?? "Unknown");

  const artifact = await prisma.artifact.findUnique({
    where: { id: artifactId },
    select: {
      id: true,
      title: true,
      type: true,
      driveUrl: true,
      generatedFromSkill: true,
      clientId: true,
      projectId: true,
      dealId: true,
      _count: { select: { tasks: true } },
    },
  });
  if (!artifact) throw new Error("Document not found");

  // Try Drive first so a Drive failure doesn't leave a dangling DB row.
  let driveResult: "deleted" | "already-gone" | "failed" | "no-file" = "no-file";
  const fileId = artifact.driveUrl ? fileIdFromUrl(artifact.driveUrl) : null;
  if (fileId) {
    try {
      const { deleted } = await deleteFile(fileId);
      driveResult = deleted ? "deleted" : "already-gone";
    } catch (err) {
      console.error("deleteArtifact: Drive delete failed:", err);
      driveResult = "failed";
    }
  }

  await prisma.$transaction(async (tx) => {
    // Tasks scoped to this deliverable go with it (artifactId is optional, so the
    // FK would otherwise SetNull and leave orphans floating on the project).
    if (artifact._count.tasks > 0) {
      await tx.task.deleteMany({ where: { artifactId } });
    }
    await tx.artifact.delete({ where: { id: artifactId } });
    await writeAudit(tx, {
      actor,
      action: "delete.artifact",
      targetType: "Artifact",
      targetId: artifactId,
      changes: {
        title: artifact.title,
        type: artifact.type,
        generatedFromSkill: artifact.generatedFromSkill,
        tasksDeleted: artifact._count.tasks,
        drive: driveResult,
        clientId: artifact.clientId,
        projectId: artifact.projectId,
        dealId: artifact.dealId,
      },
    });
  });

  // Revalidate whichever scope(s) the document showed up under.
  if (artifact.projectId) {
    revalidatePath(`/projects/${artifact.projectId}`);
    revalidatePath("/projects");
  }
  if (artifact.dealId) {
    revalidatePath(`/pipeline/${artifact.dealId}`);
    revalidatePath("/pipeline");
  }
  if (artifact.clientId) {
    revalidatePath(`/clients/${artifact.clientId}`);
    revalidatePath("/clients");
  }

  return { ok: true as const, drive: driveResult };
}
