"use server";

// Gmail connect / disconnect (per-partner OAuth, read-only). startGmailConnect
// builds the consent URL with a CSRF state cookie; the callback route
// (app/api/auth/gmail/callback) stores the encrypted refresh token.
// See docs/gmail-integration-plan.md and lib/gmail.ts.

import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { connectUrl, revokeRefreshToken } from "@/lib/gmail";
import { decryptSecret } from "@/lib/crypto";

const STATE_COOKIE = "gmail_oauth_state";
const CALLBACK_PATH = "/api/auth/gmail/callback";

async function callbackUri(): Promise<{ uri: string; secure: boolean }> {
  const host = (await headers()).get("host") ?? "localhost:3030";
  const secure = !host.startsWith("localhost");
  return { uri: `${secure ? "https" : "http"}://${host}${CALLBACK_PATH}`, secure };
}

/** Start the connect flow: set a state cookie, return the Google consent URL. */
export async function startGmailConnect(): Promise<string> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const { uri, secure } = await callbackUri();
  const state = randomBytes(16).toString("hex");
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return connectUrl(uri, state);
}

/** Disconnect: revoke at Google (best-effort), then delete the token + cursor. */
export async function disconnectGmail(): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerId = session.user.partnerId;
  const label = session.user.name ?? session.user.email ?? "Unknown";

  const existing = await prisma.partnerGmailAuth.findUnique({ where: { partnerId } });
  if (!existing) return { ok: true };

  try {
    await revokeRefreshToken(decryptSecret(existing.refreshToken));
  } catch {
    /* token already invalid / offline — proceed to remove locally */
  }

  await prisma.$transaction(async (tx) => {
    await tx.partnerGmailAuth.delete({ where: { partnerId } });
    await tx.ingestSyncState.deleteMany({ where: { partnerId, source: "gmail" } });
    await writeAudit(tx, {
      actor: partnerActor(partnerId, label),
      action: "disconnect.gmail",
      targetType: "PartnerGmailAuth",
      targetId: existing.id,
      changes: { email: existing.email },
    });
    await writeActivity(tx, {
      actor: partnerActor(partnerId, label),
      type: "status",
      target: existing.email,
      detail: "Disconnected Gmail logging",
      link: "/settings",
    });
  });

  revalidatePath("/settings");
  return { ok: true };
}
