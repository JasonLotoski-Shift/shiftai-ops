// Per-deal Drive working folder ("00-Pipeline").
//
// Deals don't get a real client folder until Convert, but their docs (discovery
// prep, proposals, discovery reports, questionnaire responses) need a proper
// home before then — not the Shared Drive root. This module owns that:
//
//   ensurePipelineRootFolder() — find-or-create the shared "00-Pipeline" folder
//     directly under the Shared Drive root (env DRIVE_PIPELINE_FOLDER_ID
//     overrides the lookup). Cached per warm Lambda.
//   ensureDealDriveFolder(dealId) — find-or-create this deal's own subfolder
//     inside it (named after the company), persisting the id/url on the Deal
//     row so every later save reuses it.
//   moveDealFolderToClient() — on Convert, the whole working folder moves into
//     the new client's folder as "00-Pipeline-files" (best-effort; the caller
//     must not let a Drive hiccup block the conversion).
//
// Kept separate from lib/drive.ts so that module stays prisma-free.

import { prisma } from "@/lib/prisma";
import { drive } from "@/lib/drive";

const PIPELINE_FOLDER_NAME = "00-Pipeline";

const globalForPipeline = globalThis as unknown as { pipelineFolderId: string | undefined };

async function createFolder(name: string, parentId: string): Promise<{ id: string; url: string }> {
  const res = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  if (!res.data.id || !res.data.webViewLink) throw new Error("Drive folder creation returned no ID");
  return { id: res.data.id, url: res.data.webViewLink };
}

/** The shared "00-Pipeline" folder under the Shared Drive root. */
export async function ensurePipelineRootFolder(): Promise<string> {
  if (process.env.DRIVE_PIPELINE_FOLDER_ID) return process.env.DRIVE_PIPELINE_FOLDER_ID;
  if (globalForPipeline.pipelineFolderId) return globalForPipeline.pipelineFolderId;

  const sharedDriveFolderId = process.env.DRIVE_SHARED_DRIVE_FOLDER_ID;
  if (!sharedDriveFolderId) throw new Error("DRIVE_SHARED_DRIVE_FOLDER_ID is not configured");

  const list = await drive.files.list({
    q: `name = '${PIPELINE_FOLDER_NAME}' and '${sharedDriveFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  let id = list.data.files?.[0]?.id ?? undefined;
  if (!id) id = (await createFolder(PIPELINE_FOLDER_NAME, sharedDriveFolderId)).id;

  globalForPipeline.pipelineFolderId = id;
  return id;
}

/** This deal's working folder inside 00-Pipeline — created on first use,
 *  persisted on the Deal row so every later save files into the same place. */
export async function ensureDealDriveFolder(
  dealId: string,
): Promise<{ folderId: string; folderUrl: string }> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { company: true, driveFolderId: true, driveFolderUrl: true },
  });
  if (!deal) throw new Error("Deal not found");
  if (deal.driveFolderId && deal.driveFolderUrl) {
    return { folderId: deal.driveFolderId, folderUrl: deal.driveFolderUrl };
  }

  const parentId = await ensurePipelineRootFolder();
  const folder = await createFolder(deal.company, parentId);
  await prisma.deal.update({
    where: { id: dealId },
    data: { driveFolderId: folder.id, driveFolderUrl: folder.url },
  });
  return { folderId: folder.id, folderUrl: folder.url };
}

/** Find-or-create a named subfolder inside this deal's working folder. Used to
 *  group prototype work (brief + HTML) under a "Prototype" folder. Cheap enough
 *  to find-or-create per save — not persisted on the Deal row (no FK for it). */
export async function ensureDealSubfolder(
  dealId: string,
  name: string,
): Promise<{ folderId: string; folderUrl: string }> {
  const { folderId: parentId } = await ensureDealDriveFolder(dealId);

  const list = await drive.files.list({
    q: `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, webViewLink)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const existing = list.data.files?.[0];
  if (existing?.id && existing.webViewLink) {
    return { folderId: existing.id, folderUrl: existing.webViewLink };
  }

  const folder = await createFolder(name, parentId);
  return { folderId: folder.id, folderUrl: folder.url };
}

/** On Convert: move the deal's working folder into the new client folder and
 *  rename it "00-Pipeline-files". Throws on Drive failure — call best-effort. */
export async function moveDealFolderToClient(input: {
  dealFolderId: string;
  clientFolderId: string;
}): Promise<void> {
  const pipelineRootId = await ensurePipelineRootFolder();
  await drive.files.update({
    fileId: input.dealFolderId,
    addParents: input.clientFolderId,
    removeParents: pipelineRootId,
    requestBody: { name: "00-Pipeline-files" },
    supportsAllDrives: true,
  });
}
