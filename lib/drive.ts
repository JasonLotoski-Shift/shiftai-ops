// Singleton Google Drive client.
// Auth: service account "ops-tool-drive@shift-ai-ops.iam.gserviceaccount.com",
// added as Content Manager on the "Shift AI - Clients" Shared Drive.
// Key is base64'd into GOOGLE_SERVICE_ACCOUNT_KEY_B64 to survive Vercel env input.
//
// All list/get/create calls MUST pass supportsAllDrives + includeItemsFromAllDrives
// — Shared Drive items are invisible without them. Helpers in this file set them.

import { Readable } from "node:stream";
import { google, drive_v3 } from "googleapis";

const globalForDrive = globalThis as unknown as { drive: drive_v3.Drive | undefined };

function makeClient(): drive_v3.Drive {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64;
  if (!b64) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY_B64 is not set. Check .env exists at the project root and the dev server was restarted after adding it.",
    );
  }
  const credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

export const drive: drive_v3.Drive = globalForDrive.drive ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForDrive.drive = drive;

// Lightweight reachability check for the System status tab — lists one file to
// confirm the service account can reach the Shared Drive. Returns ok + latency
// instead of throwing, so the caller can render a red/green card + logOps it.
export async function pingDrive(): Promise<{ ok: boolean; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    await drive.files.list({
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: "files(id)",
    });
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : "drive ping failed" };
  }
}

// Extract a folder ID from a Drive URL like
// https://drive.google.com/drive/u/0/folders/<id>  or  .../folders/<id>?usp=...
export function folderIdFromUrl(url: string): string {
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!m) throw new Error(`Could not extract folder ID from URL: ${url}`);
  return m[1];
}

// Upload a text file (markdown, HTML, …) to a Drive folder and return its ID +
// webViewLink. Shared helper so every save* action files the same way; pass the
// matching mimeType ("text/markdown", "text/html"). Self-contained HTML uploads
// as a raw file that opens in the browser (not converted to a Google Doc).
export async function uploadFile(
  body: string,
  fileName: string,
  parentFolderId: string,
  mimeType: string,
): Promise<{ fileId: string; webViewLink: string }> {
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [parentFolderId], mimeType },
    media: { mimeType, body: Readable.from(body) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  if (!res.data.id || !res.data.webViewLink) throw new Error("Drive upload returned no ID");
  return { fileId: res.data.id, webViewLink: res.data.webViewLink };
}

// Upload HTML and let Drive convert it into a NATIVE Google Doc in the folder.
// The requestBody mimeType (application/vnd.google-apps.document) is the target
// that triggers Drive's import conversion; the media mimeType (text/html) is the
// source. Use for documents meant to be redlined in Google Docs (e.g. an SOW),
// not for self-contained HTML that should open in the browser (use uploadFile).
export async function uploadAsGoogleDoc(
  html: string,
  fileName: string,
  parentFolderId: string,
): Promise<{ fileId: string; webViewLink: string }> {
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentFolderId],
      mimeType: "application/vnd.google-apps.document",
    },
    media: { mimeType: "text/html", body: Readable.from(html) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  if (!res.data.id || !res.data.webViewLink) throw new Error("Drive Google Doc create returned no ID");
  return { fileId: res.data.id, webViewLink: res.data.webViewLink };
}

// Upload any binary Buffer (image, doc, …) to a Drive folder under its own
// mimeType. Used to save the original files a partner drops into Ingest so a copy
// lands in the client/deal folder, not just the extracted text.
export async function uploadBinary(
  bytes: Buffer,
  fileName: string,
  parentFolderId: string,
  mimeType: string,
): Promise<{ fileId: string; webViewLink: string }> {
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [parentFolderId], mimeType },
    media: { mimeType, body: Readable.from(bytes) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  if (!res.data.id || !res.data.webViewLink) throw new Error("Drive binary upload returned no ID");
  return { fileId: res.data.id, webViewLink: res.data.webViewLink };
}

// Download a Drive file's raw bytes (alt=media). Used to re-read saved screenshots
// so the generators can pass them to Claude vision.
export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(res.data as ArrayBuffer);
}

export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  size?: number; // bytes; absent for native Google types
  modifiedTime?: string;
};

// List the (non-recursive) contents of a folder, newest first. Used to read a
// deal's whole working folder for the prototype brief. Caps at 100 items — far
// more than a deal folder holds; not paginated. Includes subfolders (mimeType
// application/vnd.google-apps.folder) — callers filter those out if unwanted.
export async function listFolderFiles(folderId: string): Promise<DriveFileMeta[]> {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType, size, modifiedTime)",
    pageSize: 100,
    orderBy: "modifiedTime desc",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return (res.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name ?? "(unnamed)",
    mimeType: f.mimeType ?? "application/octet-stream",
    size: f.size ? Number(f.size) : undefined,
    modifiedTime: f.modifiedTime ?? undefined,
  }));
}

// Export a NATIVE Google file (Doc / Sheet / Slides) to text. These have no raw
// bytes — downloadDriveFile (alt=media) fails on them — so Drive must convert via
// files.export. Maps the native source type to a text export format. Throws on an
// unsupported native type or an export failure (export caps at ~10MB; a huge deck
// can exceed it) — callers wrap in try/catch and degrade gracefully.
const GOOGLE_EXPORT_MIME: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

export async function exportGoogleDoc(
  fileId: string,
  sourceMimeType: string,
): Promise<{ text: string; exportedAs: string }> {
  const exportMime = GOOGLE_EXPORT_MIME[sourceMimeType];
  if (!exportMime) throw new Error(`No text export for Google type: ${sourceMimeType}`);
  const res = await drive.files.export(
    { fileId, mimeType: exportMime },
    { responseType: "arraybuffer" },
  );
  return { text: Buffer.from(res.data as ArrayBuffer).toString("utf8"), exportedAs: exportMime };
}

// Extract a file ID from a Drive file link like
// https://drive.google.com/file/d/<id>/view  or  .../d/<id>?usp=… (folder URLs
// use /folders/<id> — handled by folderIdFromUrl, no clash). Null if not found.
export function fileIdFromUrl(url: string): string | null {
  const m = url.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// Upload a binary PDF Buffer to a Drive folder (e.g. a rendered invoice). Same
// shape as uploadFile, but takes a Buffer and fixes the mime to application/pdf.
export async function uploadPdf(
  pdf: Buffer,
  fileName: string,
  parentFolderId: string,
): Promise<{ fileId: string; webViewLink: string }> {
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [parentFolderId], mimeType: "application/pdf" },
    media: { mimeType: "application/pdf", body: Readable.from(pdf) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  if (!res.data.id || !res.data.webViewLink) throw new Error("Drive PDF upload returned no ID");
  return { fileId: res.data.id, webViewLink: res.data.webViewLink };
}

// The standard subfolder structure seeded inside every new client folder.
// Mirrors the onboard-client skill's scaffold (skills/onboard-client/SKILL.md).
export const CLIENT_SUBFOLDERS = [
  "01-Discovery",
  "02-Proposals-SOW",
  "03-Build",
  "04-Deliverables",
  "05-Admin",
] as const;

// Create the standard client subfolders inside a freshly created client folder.
// Best-effort: a hiccup here must NOT block client creation (the bare folder +
// Client row is the critical path; subfolders are scaffold). Failures are logged
// and the IDs of whatever was created are returned for auditing.
export async function seedClientSubfolders(
  parentId: string,
): Promise<{ created: string[]; failed: string[] }> {
  const created: string[] = [];
  const failed: string[] = [];
  for (const name of CLIENT_SUBFOLDERS) {
    try {
      await drive.files.create({
        requestBody: {
          name,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentId],
        },
        fields: "id",
        supportsAllDrives: true,
      });
      created.push(name);
    } catch (e) {
      console.warn(`seedClientSubfolders: failed to create "${name}" in ${parentId}:`, e);
      failed.push(name);
    }
  }
  return { created, failed };
}
