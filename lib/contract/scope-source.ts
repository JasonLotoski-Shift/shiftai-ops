// Best-effort read of the latest approved SOW/scope text for a client or deal, so
// the contract's Schedule A is built from what was actually agreed, not
// re-imagined. Degrades to null (the skill then works from the project/deal scope
// in the context). Caps length to keep the prompt sane.
//
// Server-only (touches Prisma + Drive). Plain module — NOT a "use server" file —
// so both the client- and deal-scoped contract actions can share it.

import { prisma } from "@/lib/prisma";
import { drive, fileIdFromUrl, exportGoogleDoc, downloadDriveFile } from "@/lib/drive";

export async function latestScopeText(
  where: { clientId: string } | { dealId: string },
): Promise<string | null> {
  const art = await prisma.artifact.findFirst({
    where: { ...where, generatedFromSkill: { in: ["sow", "scope"] } },
    orderBy: { createdAt: "desc" },
    select: { driveUrl: true },
  });
  if (!art?.driveUrl) return null;
  const fileId = fileIdFromUrl(art.driveUrl);
  if (!fileId) return null;
  try {
    const meta = await drive.files.get({ fileId, fields: "mimeType", supportsAllDrives: true });
    const mime = meta.data.mimeType ?? "";
    const text = mime.startsWith("application/vnd.google-apps")
      ? (await exportGoogleDoc(fileId, mime)).text
      : (await downloadDriveFile(fileId)).toString("utf8");
    return text.slice(0, 12000);
  } catch {
    return null; // a missing reference must never block drafting
  }
}
