// Edge-runtime-safe slice of the Auth.js config — used by middleware.
// No Prisma imports here (Edge can't run Prisma). The full config in
// auth.ts extends this with providers + the signIn/jwt callbacks that
// hit the database.

import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [
    // Real providers are injected in auth.ts. Empty here is fine for the
    // middleware-only build — it just needs to know how to read sessions.
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const path = nextUrl.pathname;

      // Always allow these regardless of auth state
      if (path === "/login" || path.startsWith("/api/auth")) return true;

      // Everything else requires a session
      if (!isLoggedIn) {
        return Response.redirect(new URL("/login", nextUrl));
      }

      // Signed-in users hitting "/" go straight to the dashboard
      if (path === "/") {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
  },
};
