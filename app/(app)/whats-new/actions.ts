"use server";

// What's new — mark-seen. Records when the current partner last viewed the
// changelog so the sidebar "new" dot clears. Low-value mutation; no AuditLog.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** Stamp the current partner's whatsNewSeenAt = now and clear the sidebar dot. */
export async function markWhatsNewSeen(): Promise<void> {
  const session = await auth();
  const partnerId = session?.user?.partnerId;
  if (!partnerId) return;

  await prisma.partner.update({
    where: { id: partnerId },
    data: { whatsNewSeenAt: new Date() },
  });

  // Revalidate the page and the layout (root) so the sidebar dot re-computes.
  revalidatePath("/whats-new");
  revalidatePath("/");
}
