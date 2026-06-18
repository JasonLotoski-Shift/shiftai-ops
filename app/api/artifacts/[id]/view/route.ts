import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { drive, fileIdFromUrl, downloadDriveFile } from "@/lib/drive";
import { isRenderableHtml, SANDBOX_CSP } from "@/lib/artifact-view";

// googleapis needs Node APIs — never run this on the Edge.
export const runtime = "nodejs";

// Opens a deal Document in its own tab, rendered. Artifacts only store a Drive
// link; opening an HTML file straight in Drive shows the raw source, not the
// page. So for HTML we fetch the bytes via the service account and re-serve them
// as text/html (sandboxed). Anything we can't render — and any Drive failure —
// 302s to the Drive link, exactly like the old direct link. The partner never
// hits a dead end.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.partnerId) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const artifact = await prisma.artifact.findUnique({ where: { id }, select: { driveUrl: true } });
  if (!artifact) return new Response("Not found", { status: 404 });
  // No Drive link to fall back to (e.g. a proposed deliverable saved with driveUrl: "").
  // Response.redirect throws on a non-absolute URL, so degrade to a 404 page rather than
  // an unhandled 500 — the partner never hits a dead end.
  if (!artifact.driveUrl) return new Response("Not found", { status: 404 });

  // Fallback the partner always gets if we can't render: the Drive link itself.
  const toDrive = () => Response.redirect(artifact.driveUrl, 302);

  const fileId = fileIdFromUrl(artifact.driveUrl);
  if (!fileId) return toDrive();

  try {
    const meta = await drive.files.get({ fileId, fields: "mimeType", supportsAllDrives: true });
    if (!isRenderableHtml(meta.data.mimeType)) return toDrive();

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
