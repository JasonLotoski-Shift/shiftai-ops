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

  // The partner chip, the Gmail-connect state, and the channel memberships are
  // mutually independent reads — fire them in ONE parallel wave instead of
  // awaiting each in series. This layout is force-dynamic and runs on every
  // route, so each saved round-trip is felt on every navigation.
  const [partner, gmailAuthRow, memberships] = partnerId
    ? await Promise.all([
        prisma.partner.findUnique({
          where: { id: partnerId },
          select: { name: true, initials: true, role: true, whatsNewSeenAt: true },
        }),
        prisma.partnerGmailAuth.findUnique({
          where: { partnerId },
          select: { id: true },
        }),
        prisma.channelMember.findMany({
          where: { partnerId },
          select: { channelId: true, lastReadAt: true },
        }),
      ])
    : [null, null, [] as { channelId: string; lastReadAt: Date | null }[]];

  const fallbackName = session?.user?.name ?? session?.user?.email ?? "Signed in";
  const user = {
    name: partner?.name ?? fallbackName,
    initials: partner?.initials ?? initialsFrom(fallbackName),
    role: partner?.role ?? "Partner",
  };

  // Has this partner connected Gmail for email logging? Drives the red
  // "Connect Gmail" nudge on the Settings nav row until they do.
  const gmailConnected = partnerId ? !!gmailAuthRow : true; // no partner → nothing to nudge

  // (a) Does this partner have ANY unread message across their channels? The
  // sidebar only needs a yes/no for a red dot, so resolve it with a single
  // index-backed findFirst (EXISTS-style — short-circuits on the first hit)
  // over all their channels at once. This replaces the old N+1 that fired one
  // COUNT per channel on every page load; the displayed total was never used.
  const hasUnreadMessages =
    memberships.length > 0
      ? !!(await prisma.message.findFirst({
          where: {
            OR: memberships.map((m) => ({
              channelId: m.channelId,
              ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
            })),
          },
          select: { id: true },
        }))
      : false;

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
        hasUnreadMessages={hasUnreadMessages}
        whatsNewUnread={whatsNewUnread}
        gmailConnected={gmailConnected}
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
