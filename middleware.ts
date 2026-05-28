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
  // Skip Next internals + static files + auth API routes
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
