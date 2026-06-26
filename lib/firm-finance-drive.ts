// Firm-financials Drive filing — where AP bills, AR invoices, and expense
// receipts live, and the move-on-paid that re-files + renames a bill once it's
// settled. Mirrors lib/deal-drive.ts (find-or-create, cached root, supportsAllDrives).
//
// Folder tree (under the Shared Drive root; env DRIVE_FINANCIALS_FOLDER_ID
// overrides the lookup for the "00-Firm-Financials" root):
//
//   00-Firm-Financials/<YYYY>/
//     AP-Bills/{Unpaid, Paid}
//     AR-Invoices
//     Expenses/{Travel, Meals, Business-Development, Subscriptions, Other}
//     Receipts-Inbox
//
// Best-effort by design at the caller: a Drive hiccup must never block the DB
// write (the Bill/Expense row is the critical path; the filed doc is a copy).

import { drive, uploadBinary, parentFolderOfFile } from "@/lib/drive";
import { CATEGORY_TO_FOLDER, type ExpenseFolder } from "@/lib/finance";
import type { ExpenseCategory } from "@/lib/types";

const FINANCIALS_FOLDER_NAME = "00-Firm-Financials";

const globalForFinance = globalThis as unknown as {
  financialsFolderId: string | undefined;
};

async function createFolder(name: string, parentId: string): Promise<string> {
  const res = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!res.data.id) throw new Error("Drive folder creation returned no ID");
  return res.data.id;
}

/** Find-or-create a named subfolder inside `parentId`. Cheap enough per save. */
async function ensureSubfolder(parentId: string, name: string): Promise<string> {
  const list = await drive.files.list({
    q: `name = '${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return list.data.files?.[0]?.id ?? (await createFolder(name, parentId));
}

/** The "00-Firm-Financials" root under the Shared Drive root. Cached per Lambda. */
export async function ensureFinancialsRootFolder(): Promise<string> {
  if (process.env.DRIVE_FINANCIALS_FOLDER_ID) return process.env.DRIVE_FINANCIALS_FOLDER_ID;
  if (globalForFinance.financialsFolderId) return globalForFinance.financialsFolderId;

  const sharedDriveFolderId = process.env.DRIVE_SHARED_DRIVE_FOLDER_ID;
  if (!sharedDriveFolderId) throw new Error("DRIVE_SHARED_DRIVE_FOLDER_ID is not configured");

  const id = await ensureSubfolder(sharedDriveFolderId, FINANCIALS_FOLDER_NAME);
  globalForFinance.financialsFolderId = id;
  return id;
}

/** Walk-or-create a path under the financials root, returning the leaf folder id. */
async function ensurePath(...segments: string[]): Promise<string> {
  let parent = await ensureFinancialsRootFolder();
  for (const seg of segments) parent = await ensureSubfolder(parent, seg);
  return parent;
}

const apUnpaidFolder = (year: number) => ensurePath(String(year), "AP-Bills", "Unpaid");
const apPaidFolder = (year: number) => ensurePath(String(year), "AP-Bills", "Paid");
const expenseFolder = (year: number, folder: ExpenseFolder) => ensurePath(String(year), "Expenses", folder);

export const arInvoicesFolder = (year: number) => ensurePath(String(year), "AR-Invoices");
export const receiptsInboxFolder = (year: number) => ensurePath(String(year), "Receipts-Inbox");

/** File an AP bill PDF/image into AP-Bills/Unpaid for its year. */
export async function fileBillDoc(input: {
  bytes: Buffer;
  fileName: string;
  year: number;
  mimeType: string;
}): Promise<{ fileId: string; webViewLink: string }> {
  const folderId = await apUnpaidFolder(input.year);
  return uploadBinary(input.bytes, input.fileName, folderId, input.mimeType || "application/pdf");
}

/** File an expense receipt into Expenses/<category-folder> for its year. */
export async function fileReceiptDoc(input: {
  bytes: Buffer;
  fileName: string;
  year: number;
  category: ExpenseCategory;
  mimeType: string;
}): Promise<{ fileId: string; webViewLink: string }> {
  const folderId = await expenseFolder(input.year, CATEGORY_TO_FOLDER[input.category]);
  return uploadBinary(input.bytes, input.fileName, folderId, input.mimeType || "application/octet-stream");
}

/** Move a settled bill's file into AP-Bills/Paid and rename it. Returns the
 *  (unchanged) link. Best-effort: callers wrap so a Drive failure never blocks
 *  the status flip. The file ID — and thus driveUrl — is stable across the move. */
export async function moveBillToPaid(input: {
  fileId: string;
  newName: string;
  year: number;
}): Promise<{ webViewLink: string | null }> {
  const paidId = await apPaidFolder(input.year);
  const currentParent = await parentFolderOfFile(input.fileId);
  const res = await drive.files.update({
    fileId: input.fileId,
    addParents: paidId,
    removeParents: currentParent ?? undefined,
    requestBody: { name: input.newName },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  return { webViewLink: res.data.webViewLink ?? null };
}
