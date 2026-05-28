// Full Auth.js config — used by route handlers + server components.
// Extends auth.config.ts (edge-safe) with Google provider + Prisma-
// backed signIn/jwt callbacks that auto-provision Partner records.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  // Verbose error logging so failures surface as readable text in Vercel
  // function logs (not just opaque AccessDenied redirects).
  logger: {
    error(error) {
      console.error("[auth][error]", error.name, error.message, error.stack);
    },
    warn(code) {
      console.warn("[auth][warn]", code);
    },
  },
  providers: [
    Google({
      authorization: {
        params: {
          // hd = hosted-domain restriction. Google's sign-in chooser only
          // shows accounts in this Workspace domain. Belt-and-suspenders:
          // we also re-check in the signIn callback below.
          hd: "shiftai.partners",
          prompt: "select_account",
        },
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,

    async signIn({ user }) {
      // Hard-stop: only firm emails. hd above usually prevents this from
      // ever firing for the wrong domain, but if Google ever changes
      // behavior or someone bypasses the chooser, we still refuse.
      if (!user.email?.endsWith("@shiftai.partners")) {
        return false;
      }

      // Auto-provision a Partner record on first sign-in.
      // Existing seed Partners (jason@, marcus@, devon@, sasha@) match by
      // email and are reused. New emails (jay@, steve@, etc.) get a fresh
      // Partner row with placeholder fields the user can edit later.
      const existing = await prisma.partner.findUnique({
        where: { email: user.email },
      });
      if (!existing) {
        const name = user.name ?? user.email.split("@")[0];
        await prisma.partner.create({
          data: {
            email: user.email,
            name,
            initials: deriveInitials(name),
            role: "Partner",
          },
        });
      }
      return true;
    },

    async jwt({ token, user }) {
      // On initial sign-in, user.email is set. Look up Partner and stash
      // partnerId on the token so we can read it from session without
      // another DB call.
      if (user?.email) {
        const partner = await prisma.partner.findUnique({
          where: { email: user.email },
          select: { id: true },
        });
        if (partner) token.partnerId = partner.id;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.partnerId && session.user) {
        session.user.partnerId = token.partnerId;
      }
      return session;
    },
  },
});

function deriveInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}
