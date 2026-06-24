"use server";

// Artifact (document/deliverable) server actions — cross-scope, since an
// Artifact can hang off a Deal, Project, or Client. Canonical mutation recipe
// (see app/(app)/dashboard/actions.ts header): auth → mutate + writeAudit in one
// transaction → revalidate the affected scope paths.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";
import { deleteFile, fileIdFromUrl, uploadBinary, parentFolderOfFile } from "@/lib/drive";

// Replace a document with a new version: upload the new file beside the original
// in Drive, then create a new Artifact that SUPERSEDES the current one (carrying
// its title/type/scope). The old version is kept — the Documents card collapses
// the lineage to one record with a "versions" history. Explicit only (the partner
// clicks Replace); we never auto-merge by title.
export async function replaceArtifact(
  headId: string,
  file: { base64: string; fileName: string; mimeType: string },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actorLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, actorLabel);

  if (!file?.base64 || !file.fileName?.trim()) throw new Error("No file to upload");

  const head = await prisma.artifact.findUnique({
    where: { id: headId },
    select: {
      id: true,
      title: true,
      type: true,
      driveUrl: true,
      generatedFromSkill: true,
      reviewStatus: true,
      clientId: true,
      projectId: true,
      dealId: true,
    },
  });
  if (!head) throw new Error("Document not found");

  // File the new version into the SAME Drive folder as the original.
  const headFileId = head.driveUrl ? fileIdFromUrl(head.driveUrl) : null;
  const folderId = headFileId ? await parentFolderOfFile(headFileId) : null;
  if (!folderId) throw new Error("Couldn't find the document's Drive folder to file the new version.");

  const bytes = Buffer.from(file.base64, "base64");
  const { webViewLink } = await uploadBinary(
    bytes,
    file.fileName.trim(),
    folderId,
    file.mimeType || "application/octet-stream",
  );

  const created = await prisma.$transaction(async (tx) => {
    const art = await tx.artifact.create({
      data: {
        type: head.type,
        title: head.title,
        driveUrl: webViewLink,
        fileName: file.fileName.trim(),
        createdBy: actorLabel,
        generatedFromSkill: head.generatedFromSkill,
        reviewStatus: head.reviewStatus,
        clientId: head.clientId,
        projectId: head.projectId,
        dealId: head.dealId,
        supersedesId: head.id,
      },
      select: { id: true },
    });
    await writeAudit(tx, {
      actor,
      action: "replace.artifact",
      targetType: "Artifact",
      targetId: art.id,
      changes: { supersedes: head.id, title: head.title, fileName: file.fileName.trim() },
    });
    return art;
  });

  if (head.projectId) {
    revalidatePath(`/projects/${head.projectId}`);
    revalidatePath("/projects");
  }
  if (head.dealId) {
    revalidatePath(`/pipeline/${head.dealId}`);
    revalidatePath("/pipeline");
  }
  if (head.clientId) {
    revalidatePath(`/clients/${head.clientId}`);
    revalidatePath("/clients");
  }

  return { ok: true as const, id: created.id };
}

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
