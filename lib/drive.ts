// Singleton Google Drive client.
// Auth: service account "ops-tool-drive@shift-ai-ops.iam.gserviceaccount.com",
// added as Content Manager on the "Shift AI - Clients" Shared Drive.
// Key is base64'd into GOOGLE_SERVICE_ACCOUNT_KEY_B64 to survive Vercel env input.
//
// All list/get/create calls MUST pass supportsAllDrives + includeItemsFromAllDrives
// — Shared Drive items are invisible without them. Helpers in this file set them.

import { Readable } from "node:stream";
import { google, drive_v3, docs_v1 } from "googleapis";

const globalForGoogle = globalThis as unknown as {
  drive: drive_v3.Drive | undefined;
  docs: docs_v1.Docs | undefined;
};

function makeClients(): { drive: drive_v3.Drive; docs: docs_v1.Docs } {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64;
  if (!b64) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY_B64 is not set. Check .env exists at the project root and the dev server was restarted after adding it.",
    );
  }
  const credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  const auth = new google.auth.GoogleAuth({
    credentials,
    // drive: create/copy/export files. documents: brand the generated contract
    // Doc (margins, fonts, header/footer) via the Docs API after Drive imports it.
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents",
    ],
  });
  return {
    drive: google.drive({ version: "v3", auth }),
    docs: google.docs({ version: "v1", auth }),
  };
}

const googleClients =
  globalForGoogle.drive && globalForGoogle.docs
    ? { drive: globalForGoogle.drive, docs: globalForGoogle.docs }
    : makeClients();

export const drive: drive_v3.Drive = googleClients.drive;
export const docs: docs_v1.Docs = googleClients.docs;

if (process.env.NODE_ENV !== "production") {
  globalForGoogle.drive = drive;
  globalForGoogle.docs = docs;
}

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

// Brand a generated contract Google Doc to the firm letterhead (light-mode doc
// spec in the brand guide): 1" margins, Inter body, a running header with the
// SHIFT AI wordmark image and a hairline divider, and a footer with the domain +
// a confidential line. Runs via the Docs API AFTER Drive imports the HTML — page
// setup (margins/fonts/header/footer/logo) is exactly what the HTML importer
// can't do. Idempotent: reuses an existing header/footer and clears it first, so
// re-branding a doc is safe. Best-effort: callers wrap it so a branding hiccup
// never blocks the saved contract (the Doc still exists, just unbranded).
const PT = (n: number): docs_v1.Schema$Dimension => ({ magnitude: n, unit: "PT" });
const rgb = (hex: number): docs_v1.Schema$OptionalColor => ({
  color: { rgbColor: { red: ((hex >> 16) & 255) / 255, green: ((hex >> 8) & 255) / 255, blue: (hex & 255) / 255 } },
});
const MUTED = rgb(0x5a574f);
const HAIRLINE = rgb(0xb0b0b0);
// SHIFT AI wordmark (Logo-Dark-Primary, the light-surface/letterhead variant),
// hosted as a public PNG in the firm's shared Drive. Native 1165x350.
const LOGO_URL = "https://lh3.googleusercontent.com/d/1JjuI6KOv4NhVk9zNJ8ZPpvrJTufOVE4B";
const LOGO_W = 150;
const LOGO_H = 45;

export async function brandGoogleDoc(fileId: string, opts: { clientName: string }): Promise<void> {
  // Current state: body extent + any existing header/footer (so a re-run reuses them).
  const doc = (
    await docs.documents.get({
      documentId: fileId,
      fields: "body(content(endIndex)),documentStyle(defaultHeaderId,defaultFooterId)",
    })
  ).data;
  const content = doc.body?.content ?? [];
  const bodyEnd = content.length ? content[content.length - 1].endIndex ?? 1 : 1;
  let headerId = doc.documentStyle?.defaultHeaderId ?? undefined;
  let footerId = doc.documentStyle?.defaultFooterId ?? undefined;

  // Margins + Inter body; create the header/footer only if the doc has none yet.
  const setup: docs_v1.Schema$Request[] = [
    {
      updateDocumentStyle: {
        documentStyle: { marginTop: PT(72), marginBottom: PT(72), marginLeft: PT(72), marginRight: PT(72) },
        fields: "marginTop,marginBottom,marginLeft,marginRight",
      },
    },
  ];
  if (bodyEnd > 2) {
    setup.push({
      updateTextStyle: {
        range: { startIndex: 1, endIndex: bodyEnd - 1 },
        textStyle: { weightedFontFamily: { fontFamily: "Inter" } },
        fields: "weightedFontFamily",
      },
    });
  }
  if (!headerId) setup.push({ createHeader: { type: "DEFAULT" } });
  if (!footerId) setup.push({ createFooter: { type: "DEFAULT" } });
  const res = await docs.documents.batchUpdate({ documentId: fileId, requestBody: { requests: setup } });
  for (const r of res.data.replies ?? []) {
    if (r.createHeader?.headerId) headerId = r.createHeader.headerId;
    if (r.createFooter?.footerId) footerId = r.createFooter.footerId;
  }

  // Clear any existing header/footer content so re-running doesn't stack it up.
  const segs = (await docs.documents.get({ documentId: fileId, fields: "headers,footers" })).data;
  const segEnd = (id: string, map?: Record<string, { content?: docs_v1.Schema$StructuralElement[] }> | null): number => {
    const c = map?.[id]?.content ?? [];
    return c.length ? c[c.length - 1].endIndex ?? 1 : 1;
  };
  const clears: docs_v1.Schema$Request[] = [];
  if (headerId) {
    const e = segEnd(headerId, segs.headers);
    if (e > 1) clears.push({ deleteContentRange: { range: { segmentId: headerId, startIndex: 0, endIndex: e - 1 } } });
  }
  if (footerId) {
    const e = segEnd(footerId, segs.footers);
    if (e > 1) clears.push({ deleteContentRange: { range: { segmentId: footerId, startIndex: 0, endIndex: e - 1 } } });
  }
  if (clears.length) await docs.documents.batchUpdate({ documentId: fileId, requestBody: { requests: clears } });

  // Footer: domain + confidential line.
  if (footerId) {
    const ft = `shiftai.partners   ·   Confidential — prepared for ${opts.clientName}`;
    await docs.documents.batchUpdate({
      documentId: fileId,
      requestBody: {
        requests: [
          { insertText: { location: { segmentId: footerId, index: 0 }, text: ft } },
          {
            updateTextStyle: {
              range: { segmentId: footerId, startIndex: 0, endIndex: ft.length },
              textStyle: { fontSize: PT(8), weightedFontFamily: { fontFamily: "Inter" }, foregroundColor: MUTED },
              fields: "fontSize,weightedFontFamily,foregroundColor",
            },
          },
        ],
      },
    });
  }

  // Header: the SHIFT AI logo image + a hairline divider. Best-effort — if the
  // hosted image can't be fetched, the rest of the letterhead still applies.
  if (headerId) {
    try {
      await docs.documents.batchUpdate({
        documentId: fileId,
        requestBody: {
          requests: [
            {
              insertInlineImage: {
                location: { segmentId: headerId, index: 0 },
                uri: LOGO_URL,
                objectSize: { width: PT(LOGO_W), height: PT(LOGO_H) },
              },
            },
            {
              updateParagraphStyle: {
                range: { segmentId: headerId, startIndex: 0, endIndex: 1 },
                paragraphStyle: { borderBottom: { color: HAIRLINE, width: PT(0.75), padding: PT(6), dashStyle: "SOLID" } },
                fields: "borderBottom",
              },
            },
          ],
        },
      });
    } catch (e) {
      console.error("contract logo header skipped:", e instanceof Error ? e.message : e);
    }
  }
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

// Resolve the parent folder id of a Drive file (e.g. to re-upload a refined copy into
// the same folder as the original). Returns null on any miss (file gone, no parents) so
// callers can fall back gracefully. Shared-Drive files have exactly one parent.
export async function parentFolderOfFile(fileId: string): Promise<string | null> {
  try {
    const { data } = await drive.files.get({
      fileId,
      fields: "parents",
      supportsAllDrives: true,
    });
    return data.parents?.[0] ?? null;
  } catch {
    return null;
  }
}

// Permanently delete a Drive file (Shared-Drive items skip the trash and are
// gone for good). Best-effort: a 404 means it's already gone, which we treat as
// success so a stale DB row can still be cleaned up. Other errors propagate.
export async function deleteFile(fileId: string): Promise<{ deleted: boolean }> {
  try {
    await drive.files.delete({ fileId, supportsAllDrives: true });
    return { deleted: true };
  } catch (err: unknown) {
    const code = (err as { code?: number; status?: number })?.code ?? (err as { status?: number })?.status;
    if (code === 404) return { deleted: false }; // already gone — not an error
    throw err;
  }
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
