// Ingest uploads → Drive. Two halves of the "screenshots & files" feature:
//
//   persistIngestUploads — when a partner drops files/screenshots into Ingest,
//     save the ORIGINAL files (not just the extracted text) into the client's or
//     deal's Drive folder and register each as an Artifact, so a copy is kept and
//     it shows in Deliverables. Best-effort: a Drive hiccup never blocks the
//     extraction. Marked generatedFromSkill="ingest-upload" so they're findable.
//
//   loadScreenshotImages — re-read recent uploaded IMAGES for a client/deal and
//     return them as { base64, mediaType } so the discovery-report and prototype
//     generators can pass them to Claude vision (screenshots the client shared of
//     their current tools/spreadsheets become primary evidence of the now-state).
//
// Server-only (Prisma + Drive). NOT "use server" — callers own auth.

import { prisma } from "@/lib/prisma";
import { uploadBinary, downloadDriveFile, folderIdFromUrl, fileIdFromUrl } from "@/lib/drive";
import { ensureDealDriveFolder } from "@/lib/deal-drive";
import { imageMediaType } from "@/lib/ingest/extract-file";
import { writeAudit, partnerActor, agentActor } from "@/lib/audit";

const UPLOAD_MARKER = "ingest-upload";

export type IngestFile = { base64: string; mimeType: string; fileName: string };

/**
 * Save the partner's uploaded files into the client's (preferred) or deal's Drive
 * folder + one Artifact per file. Resolves the client folder from driveFolderUrl,
 * or lazily creates the deal's 00-Pipeline subfolder. Returns a count + notes;
 * never throws (the proposal extraction must still succeed if Drive is down).
 */
export async function persistIngestUploads(input: {
  files: IngestFile[];
  clientId?: string | null;
  dealId?: string | null;
  actorLabel: string;
  actorPartnerId?: string;
}): Promise<{ saved: number; notes: string[] }> {
  const notes: string[] = [];
  if (!input.files.length) return { saved: 0, notes };

  // Resolve the destination folder + scope FK. A client folder wins; else the
  // deal's working folder (created on demand).
  let folderId: string | null = null;
  let clientId: string | null = null;
  let dealId: string | null = null;

  if (input.clientId) {
    const cl = await prisma.client.findUnique({
      where: { id: input.clientId },
      select: { driveFolderUrl: true },
    });
    if (cl?.driveFolderUrl) {
      try {
        folderId = folderIdFromUrl(cl.driveFolderUrl);
        clientId = input.clientId;
      } catch {
        /* placeholder URL — fall through */
      }
    }
  }
  if (!folderId && input.dealId) {
    try {
      const f = await ensureDealDriveFolder(input.dealId);
      folderId = f.folderId;
      dealId = input.dealId;
    } catch {
      notes.push("Couldn't open the deal's Drive folder — files not saved.");
    }
  }
  if (!folderId) {
    notes.push("Files weren't copied to Drive — pick a client or deal so they have a folder.");
    return { saved: 0, notes };
  }

  let saved = 0;
  const savedNames: string[] = [];
  for (const f of input.files) {
    try {
      const bytes = Buffer.from(f.base64, "base64");
      const isImg = !!imageMediaType(f.fileName);
      const { webViewLink } = await uploadBinary(
        bytes,
        f.fileName,
        folderId,
        f.mimeType || "application/octet-stream",
      );
      await prisma.artifact.create({
        data: {
          type: "other",
          title: `${isImg ? "Screenshot" : "File"} · ${f.fileName}`,
          driveUrl: webViewLink,
          fileName: f.fileName,
          createdBy: input.actorLabel,
          generatedFromSkill: UPLOAD_MARKER,
          reviewStatus: "draft",
          clientId,
          dealId,
        },
      });
      saved++;
      savedNames.push(f.fileName);
    } catch {
      notes.push(`Couldn't save ${f.fileName} to Drive.`);
    }
  }

  if (saved > 0) {
    const actor = input.actorLabel.startsWith("AGENT · ")
      ? agentActor(input.actorLabel.slice("AGENT · ".length).toLowerCase())
      : partnerActor(input.actorPartnerId ?? input.actorLabel, input.actorLabel);
    await writeAudit(prisma, {
      actor,
      action: "create.ingest-uploads",
      targetType: clientId ? "Client" : "Deal",
      targetId: (clientId ?? dealId)!,
      changes: { saved, files: savedNames },
    }).catch(() => {});
  }

  return { saved, notes };
}

/**
 * Load up to `limit` recent uploaded IMAGES for a client/deal as Claude-vision
 * inputs. Best-effort per file (a bad download / oversize image is skipped).
 * Returns [] when no scope or no image uploads exist.
 */
export async function loadScreenshotImages(
  scope: { clientId?: string | null; dealId?: string | null },
  limit = 4,
): Promise<{ base64: string; mediaType: string }[]> {
  const where = scope.clientId
    ? { clientId: scope.clientId }
    : scope.dealId
      ? { dealId: scope.dealId }
      : null;
  if (!where) return [];

  const arts = await prisma.artifact.findMany({
    where: { ...where, generatedFromSkill: UPLOAD_MARKER },
    orderBy: { createdAt: "desc" },
    select: { driveUrl: true, fileName: true },
    take: 12, // scan a few extra; non-images + failures are filtered below
  });

  const out: { base64: string; mediaType: string }[] = [];
  for (const a of arts) {
    if (out.length >= limit) break;
    const mediaType = a.fileName ? imageMediaType(a.fileName) : null;
    if (!mediaType) continue; // images only
    const fileId = fileIdFromUrl(a.driveUrl);
    if (!fileId) continue;
    try {
      const buf = await downloadDriveFile(fileId);
      if (buf.length > 5_000_000) continue; // Anthropic ~5MB/image cap
      out.push({ base64: buf.toString("base64"), mediaType });
    } catch {
      /* skip unreadable file */
    }
  }
  return out;
}
