"use server";

// Manual "run a check now" triggers for the Ingest page. Each just drives the
// EXISTING cron route over HTTP with the CRON_SECRET (server-side only — the
// secret never reaches the client), so the poll logic lives in exactly one place
// and a manual scan behaves identically to the scheduled one. Partner-gated by
// session; the heavy lifting + idempotency stay in the cron handlers.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

export type ScanSource = "gmail" | "fireflies" | "tally";

export type ScanResult = {
  source: ScanSource;
  created: number; // new pending items queued on /ingest
  message: string; // short human summary for the button
};

export async function runManualScan(source: ScanSource): Promise<ScanResult> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("CRON_SECRET isn't configured — manual scans run only where the cron secret is set.");
  }

  // Build the deployment origin from the incoming request headers (works on
  // Vercel + local). A relative fetch isn't allowed from a server action.
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  if (!host) throw new Error("Couldn't resolve the request host for the scan.");

  let json: Record<string, unknown>;
  try {
    const res = await fetch(`${proto}://${host}/api/cron/${source}-poll?secret=${encodeURIComponent(secret)}`, {
      cache: "no-store",
    });
    json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = typeof json.error === "string" ? json.error : `${source} check failed (${res.status})`;
      throw new Error(err);
    }
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : `${source} check failed`);
  }

  // Normalize the two route shapes: Gmail → { total }, Fireflies → { created }.
  const created =
    typeof json.total === "number"
      ? json.total
      : typeof json.created === "number"
        ? json.created
        : 0;

  // Some no-op responses carry a note (e.g. "FIREFLIES_API_KEY not set").
  const note = typeof json.note === "string" ? json.note : null;
  const label = source === "gmail" ? "Gmail" : source === "fireflies" ? "Fireflies" : "Tally";
  // Tally responses save straight to the deal/client; Gmail/Fireflies queue for review.
  const found =
    source === "tally"
      ? `${created} new questionnaire response${created === 1 ? "" : "s"} saved.`
      : `${created} new item${created === 1 ? "" : "s"} queued for review.`;
  const message = note ? note : created > 0 ? found : `${label} checked — nothing new.`;

  if (created > 0) revalidatePath("/ingest");
  return { source, created, message };
}
