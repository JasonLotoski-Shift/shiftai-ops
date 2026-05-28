// Singleton Google Drive client.
// Auth: service account "ops-tool-drive@shift-ai-ops.iam.gserviceaccount.com",
// added as Content Manager on the "Shift AI - Clients" Shared Drive.
// Key is base64'd into GOOGLE_SERVICE_ACCOUNT_KEY_B64 to survive Vercel env input.
//
// All list/get/create calls MUST pass supportsAllDrives + includeItemsFromAllDrives
// — Shared Drive items are invisible without them. Helpers in this file set them.

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

// Extract a folder ID from a Drive URL like
// https://drive.google.com/drive/u/0/folders/<id>  or  .../folders/<id>?usp=...
export function folderIdFromUrl(url: string): string {
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!m) throw new Error(`Could not extract folder ID from URL: ${url}`);
  return m[1];
}
