// Edge-runtime-safe slice of the Auth.js config — used by middleware.
// No Prisma imports here (Edge can't run Prisma). The full config in
// auth.ts extends this with providers + the signIn/jwt callbacks that
// hit the database.

import type { NextAuthConfig } from "next-auth";

// Cookie config lives HERE (not just in auth.ts) so middleware reads the
// same cookie names that the full auth instance writes. Otherwise middleware
// looks for the Auth.js default names (__Secure-authjs.session-token etc.),
// can't find them, treats every request as unauthenticated → redirect loop
// between /login and /dashboard.
const cookieDefaults = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: true,
};

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [
    // Real providers are injected in auth.ts. Empty here is fine for the
    // middleware-only build — it just needs to know how to read sessions.
  ],
  cookies: {
    sessionToken: { name: "authjs.session-token", options: cookieDefaults },
    callbackUrl: { name: "authjs.callback-url", options: cookieDefaults },
    csrfToken: { name: "authjs.csrf-token", options: cookieDefaults },
    pkceCodeVerifier: { name: "authjs.pkce.code-verifier", options: { ...cookieDefaults, maxAge: 60 * 15 } },
    state: { name: "authjs.state", options: { ...cookieDefaults, maxAge: 60 * 15 } },
    nonce: { name: "authjs.nonce", options: cookieDefaults },
  },
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
