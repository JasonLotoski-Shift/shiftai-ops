import { Sidebar } from "@/components/sidebar";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updates } from "@/lib/data/updates";

// Every route in this layout fetches live data via Prisma — never statically
// snapshot at build time. Otherwise Vercel would bake a one-time render into
// the deploy and pages would show stale data until the next deploy.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolve the real signed-in partner for the sidebar chip. Fall back to the
  // session name/email if the Partner row can't be found (e.g. a stale session
  // after a data wipe), so the chip never shows the wrong person.
  const session = await auth();
  const partnerId = session?.user?.partnerId;
  const partner = partnerId
    ? await prisma.partner.findUnique({
        where: { id: partnerId },
        select: { name: true, initials: true, role: true, whatsNewSeenAt: true },
      })
    : null;

  const fallbackName = session?.user?.name ?? session?.user?.email ?? "Signed in";
  const user = {
    name: partner?.name ?? fallbackName,
    initials: partner?.initials ?? initialsFrom(fallbackName),
    role: partner?.role ?? "Partner",
  };

  // (a) Total unread messages across this partner's channel memberships —
  // mirrors the per-channel count logic on the Messages page.
  let totalUnreadMessages = 0;
  if (partnerId) {
    const memberships = await prisma.channelMember.findMany({
      where: { partnerId },
      select: { channelId: true, lastReadAt: true },
    });
    const counts = await Promise.all(
      memberships.map((m) =>
        prisma.message.count({
          where: {
            channelId: m.channelId,
            ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
          },
        }),
      ),
    );
    totalUnreadMessages = counts.reduce((sum, n) => sum + n, 0);
  }

  // (b) What's new unread — the newest update is newer than when this partner
  // last viewed the changelog.
  const latestUpdate = updates.reduce(
    (max, u) => (u.date > max ? u.date : max),
    "",
  );
  const whatsNewUnread =
    !!partnerId &&
    latestUpdate !== "" &&
    latestUpdate > (partner?.whatsNewSeenAt?.toISOString().slice(0, 10) ?? "");

  return (
    <div className="min-h-screen flex bg-bitumen">
      <Sidebar
        user={user}
        totalUnreadMessages={totalUnreadMessages}
        whatsNewUnread={whatsNewUnread}
      />
      <main className="flex-1 flex flex-col min-w-0">{children}</main>
    </div>
  );
}

function initialsFrom(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
