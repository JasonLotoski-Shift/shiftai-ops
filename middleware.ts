// Edge-runtime middleware — gates the (app) routes behind sign-in.
// Uses auth.config.ts (no Prisma) so it can run on the Edge.
// The `authorized` callback in that config handles the redirect logic.

import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export default middleware((req) => {
  // The authorized() callback in authConfig has already decided
  // (return true / false / Response.redirect). Nothing extra to do here.
  return undefined;
});

export const config = {
  // Skip Next internals + static files + auth API routes. ALSO skip machine-to-
  // machine routes that authenticate with a shared secret, not a session cookie:
  // /api/ingest/* (Fireflies webhook → FIREFLIES_WEBHOOK_SECRET) and /api/cron/*
  // (Vercel cron → CRON_SECRET). External callers have no session, so gating them
  // here would redirect them to /login and they'd never run. A NEW webhook/cron
  // route under these prefixes is covered; one elsewhere must be added here.
  matcher: ["/((?!api/auth|api/ingest|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
