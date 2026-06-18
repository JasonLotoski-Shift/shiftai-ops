import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Serves a finished prototype's HTML from OUR origin with the correct content-type and a
// sandboxing CSP. Supabase Storage forces text/plain + default-src 'none' (anti-XSS), so the
// raw Storage URL can't render — we fetch it server-side and re-serve it here. The CSP
// `sandbox allow-scripts allow-forms allow-modals allow-popups` lets the self-contained
// prototype run its inline JS but in an OPAQUE origin, so it can't touch the app's cookies.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const session = await auth();
  if (!session?.user?.partnerId) return new Response("Unauthorized", { status: 401 });
  const { runId } = await params;
  const run = await prisma.prototypeRun.findUnique({ where: { id: runId }, select: { finalHtmlUrl: true } });
  if (!run?.finalHtmlUrl) return new Response("Prototype not ready", { status: 404 });
  const upstream = await fetch(run.finalHtmlUrl);
  if (!upstream.ok) return new Response("Could not load prototype", { status: 502 });
  const html = await upstream.text();
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "sandbox allow-scripts allow-forms allow-modals allow-popups",
      "cache-control": "no-store",
    },
  });
}
