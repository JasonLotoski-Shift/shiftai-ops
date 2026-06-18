import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { drive, fileIdFromUrl, downloadDriveFile } from "@/lib/drive";
import { isRenderableHtml, SANDBOX_CSP, contentDispositionAttachment } from "@/lib/artifact-view";

// googleapis needs Node APIs — never run this on the Edge.
export const runtime = "nodejs";

// Opens a deal Document. Artifacts only store a Drive link; opening an HTML file
// straight in Drive shows raw source, so for HTML we re-serve the bytes rendered
// (sandboxed). With ?download=1 we instead stream the file as an attachment in
// its native format. Anything we can't render/download — and any Drive failure —
// 302s to the Drive link, so the partner never hits a dead end.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.partnerId) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const artifact = await prisma.artifact.findUnique({ where: { id }, select: { driveUrl: true } });
  if (!artifact) return new Response("Not found", { status: 404 });
  // No Drive link to fall back to (e.g. a proposed deliverable saved with driveUrl: "").
  if (!artifact.driveUrl) return new Response("Not found", { status: 404 });

  const toDrive = () => Response.redirect(artifact.driveUrl, 302);
  const download = req.nextUrl.searchParams.get("download") === "1";

  const fileId = fileIdFromUrl(artifact.driveUrl);
  if (!fileId) return toDrive();

  try {
    const meta = await drive.files.get({ fileId, fields: "mimeType, name", supportsAllDrives: true });
    const mimeType = meta.data.mimeType ?? undefined;

    // Download mode: stream the raw file as-is, as an attachment. Native Google
    // files have no raw bytes — downloadDriveFile throws → caught → toDrive()
    // (open in Drive), the intended "as-is or Drive" fallback. Attachment means
    // even HTML is downloaded, not executed — no XSS surface here.
    if (download) {
      const bytes = await downloadDriveFile(fileId);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "content-type": mimeType || "application/octet-stream",
          "content-disposition": contentDispositionAttachment(meta.data.name),
          "x-content-type-options": "nosniff",
          "cache-control": "no-store",
        },
      });
    }

    // View mode: render HTML inline behind the sandbox CSP; else open in Drive.
    if (!isRenderableHtml(mimeType)) return toDrive();
    const bytes = await downloadDriveFile(fileId);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": SANDBOX_CSP,
        "cache-control": "no-store",
      },
    });
  } catch {
    return toDrive();
  }
}
