// One-off smoke test for the Drive API setup.
// Uploads hello.txt to the test folder, reads it back, deletes it.
// Run: npx tsx scripts/drive-smoke-test.ts

import "dotenv/config";
import { Readable } from "node:stream";
import { drive } from "../lib/drive";

async function main() {
  const folderId = process.env.DRIVE_SHARED_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error("DRIVE_SHARED_DRIVE_FOLDER_ID not set in .env");

  console.log(`Target folder: ${folderId}`);

  // 1. UPLOAD ----------------------------------------------------------------
  const content = `Hello from ops-tool-drive at ${new Date().toISOString()}\n`;
  const created = await drive.files.create({
    requestBody: {
      name: "hello.txt",
      parents: [folderId],
      mimeType: "text/plain",
    },
    media: {
      mimeType: "text/plain",
      body: Readable.from(content),
    },
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });

  const fileId = created.data.id!;
  console.log(`Uploaded: ${created.data.name} (${fileId})`);
  console.log(`   ${created.data.webViewLink}`);

  // 2. READ BACK -------------------------------------------------------------
  const read = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "text" },
  );
  console.log(`Read back ${(read.data as string).length} bytes: ${JSON.stringify((read.data as string).trim())}`);

  // 3. TRASH -----------------------------------------------------------------
  // files.delete on Shared Drives often requires Manager role; trashing is
  // the safer pattern and works for Content Manager too.
  await drive.files.update({
    fileId,
    requestBody: { trashed: true },
    supportsAllDrives: true,
  });
  console.log(`Trashed ${fileId}`);

  console.log("\nSmoke test PASSED");
}

main().catch((err) => {
  console.error("\nSmoke test FAILED:");
  console.error(err?.errors ?? err?.message ?? err);
  process.exit(1);
});
