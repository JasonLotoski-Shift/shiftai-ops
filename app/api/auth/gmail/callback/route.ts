// Gmail OAuth callback — completes the per-partner "Connect Gmail" flow.
//
// Google redirects here with ?code&state. We verify the CSRF state cookie set
// by startGmailConnect, exchange the code, and store the partner's refresh token
// ENCRYPTED (lib/crypto.ts). Read-only scope (gmail.readonly) — see
// docs/gmail-integration-plan.md. Always redirects back to /settings with a flag.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { exchangeCode, emailFromIdToken, GMAIL_SCOPE } from "@/lib/gmail";
import { encryptSecret } from "@/lib/crypto";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "gmail_oauth_state";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("host") ?? "localhost:3030";
  const origin = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  const back = (flag: string) => NextResponse.redirect(`${origin}/settings?gmail=${flag}`);

  const session = await auth();
  if (!session?.user?.partnerId) return NextResponse.redirect(`${origin}/login`);
  const partnerId = session.user.partnerId;
  const label = session.user.name ?? session.user.email ?? "Unknown";

  if (url.searchParams.get("error")) return back("error");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  if (!code || !state || !expected || state !== expected) return back("error");

  try {
    const tokens = await exchangeCode(code, `${origin}/api/auth/gmail/callback`);
    const refresh = tokens.refresh_token;
    if (!refresh) return back("error"); // no refresh token returned → needs re-consent
    const email = emailFromIdToken(tokens.id_token) ?? session.user.email ?? "";
    const refreshToken = encryptSecret(refresh);
    const scope = tokens.scope ?? GMAIL_SCOPE;

    await prisma.$transaction(async (tx) => {
      await tx.partnerGmailAuth.upsert({
        where: { partnerId },
        create: { partnerId, email, refreshToken, scope },
        update: { email, refreshToken, scope, lastError: null, connectedAt: new Date() },
      });
      await writeAudit(tx, {
        actor: partnerActor(partnerId, label),
        action: "connect.gmail",
        targetType: "PartnerGmailAuth",
        targetId: partnerId,
        changes: { email },
      });
      await writeActivity(tx, {
        actor: partnerActor(partnerId, label),
        type: "status",
        target: email,
        detail: "Connected Gmail for email logging",
        link: "/settings",
      });
    });

    return back("connected");
  } catch {
    return back("error");
  }
}
