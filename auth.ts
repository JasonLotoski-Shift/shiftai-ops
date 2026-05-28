// Full Auth.js config — used by route handlers + server components.
// Extends auth.config.ts (edge-safe) with Google provider + Prisma-
// backed signIn/jwt callbacks that auto-provision Partner records.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

// Fires on module load. If we don't see this in the function log on a
// fresh cold start, auth.ts isn't being loaded by the route handler.
console.error("[auth-module] loaded · build-marker-2026-05-27c");

// Cookie config now lives in auth.config.ts so middleware reads the
// same cookie names that this full instance writes. Inherited via the
// ...authConfig spread below.

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

    async signIn({ user, profile, account }) {
      // Use console.error so Vercel captures the line reliably (some
      // function-log views filter console.log on cold starts).
      console.error("[signin] CALLBACK ENTRY", JSON.stringify({
        email: user.email,
        name: user.name,
        profileEmail: (profile as { email?: string } | undefined)?.email,
        profileHd: (profile as { hd?: string } | undefined)?.hd,
        accountProvider: account?.provider,
      }));

      // Allow both the new primary domain AND the legacy alias domain
      // (shiftcg.ai is retained as a Google Workspace alias during the
      // 90-day+ sunset; Google's OIDC profile can return either address
      // for the same Workspace user). Drop shiftcg.ai once sunset closes.
      const ALLOWED_DOMAINS = ["shiftai.partners", "shiftcg.ai"];

      const rawEmail = user.email ?? "";
      const domain = rawEmail.split("@")[1] ?? "";
      if (!ALLOWED_DOMAINS.includes(domain)) {
        console.warn("[signin] rejected — domain not allowed:", domain);
        return false;
      }

      // Normalize: both shiftai.partners and shiftcg.ai resolve to the
      // same Workspace user. Pick the canonical (new primary) address
      // as the Partner row key so a person doesn't end up with two
      // Partner records depending on which alias Google returns.
      const email = normalizeToCanonical(rawEmail);

      try {
        console.error("[signin] before Prisma findUnique email=", email);
        const existing = await prisma.partner.findUnique({ where: { email } });
        console.error("[signin] Prisma findUnique returned, existing=", !!existing, "id=", existing?.id);

        if (!existing) {
          console.error("[signin] before Prisma create");
          const name = user.name ?? email.split("@")[0];
          await prisma.partner.create({
            data: {
              email,
              name,
              initials: deriveInitials(name),
              role: "Partner",
            },
          });
          console.error("[signin] Prisma create returned");
        }

        user.email = email;
        console.error("[signin] returning true");
        return true;
      } catch (err) {
        console.error("[signin] EXCEPTION:", err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : "");
        throw err;
      }
    },

    async jwt({ token, user }) {
      // On initial sign-in, user.email is set. Look up Partner and stash
      // partnerId on the token so we can read it from session without
      // another DB call.
      if (user?.email) {
        try {
          console.error("[jwt] before Prisma findUnique email=", user.email);
          const partner = await prisma.partner.findUnique({
            where: { email: user.email },
            select: { id: true },
          });
          console.error("[jwt] Prisma findUnique returned, partnerId=", partner?.id);
          if (partner) token.partnerId = partner.id;
        } catch (err) {
          console.error("[jwt] EXCEPTION:", err instanceof Error ? err.message : String(err));
          throw err;
        }
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
  // Events fire even if callbacks reject. If we see [event] signIn but
  // not [signin] CALLBACK ENTRY, the callback is being short-circuited
  // before reaching us.
  events: {
    async signIn(message) {
      console.error("[event] signIn fired:", JSON.stringify({
        email: message.user.email,
        provider: message.account?.provider,
        isNewUser: message.isNewUser,
      }));
    },
    async createUser(message) {
      console.error("[event] createUser fired:", JSON.stringify({
        email: message.user.email,
      }));
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

function normalizeToCanonical(email: string): string {
  return email.endsWith("@shiftcg.ai")
    ? email.slice(0, -"@shiftcg.ai".length) + "@shiftai.partners"
    : email;
}
