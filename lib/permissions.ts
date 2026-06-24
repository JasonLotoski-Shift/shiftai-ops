// Partner-level access control. The firm has no dedicated managing-partner
// flag — managing-partner status is carried in the free-text Partner.role
// (the three founders are "Managing Partner · <track>"; auto-provisioned team
// members get a plain "Partner"). Gate on the role string so adding a
// non-managing partner doesn't require a schema change.
//
// Used to hide firm-economics surfaces (rate card, revenue splits) from
// non-managing partners — and to guard the matching mutations server-side.

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isManagingPartner } from "@/lib/roles";

// Re-export the pure check so existing server-side importers of @/lib/permissions
// are unchanged; client components must import it from @/lib/roles (prisma-free).
export { isManagingPartner };

/** Loads the current session partner's role and returns whether they're a managing partner. */
export async function currentIsManagingPartner(): Promise<boolean> {
  const session = await auth();
  const partnerId = session?.user?.partnerId;
  if (!partnerId) return false;
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { role: true },
  });
  return isManagingPartner(partner?.role);
}

/** Throws if the current partner isn't a managing partner. For use in server actions. */
export async function requireManagingPartner(): Promise<void> {
  if (!(await currentIsManagingPartner())) {
    throw new Error("Only managing partners can do this");
  }
}
