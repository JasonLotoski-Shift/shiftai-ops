// Type augmentation — adds partnerId to the session.user shape so
// server components can do `(await auth()).user.partnerId` typed.

import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      partnerId?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    partnerId?: string;
  }
}
