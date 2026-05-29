import { Sidebar } from "@/components/sidebar";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
  const partner = session?.user?.partnerId
    ? await prisma.partner.findUnique({
        where: { id: session.user.partnerId },
        select: { name: true, initials: true, role: true },
      })
    : null;

  const fallbackName = session?.user?.name ?? session?.user?.email ?? "Signed in";
  const user = {
    name: partner?.name ?? fallbackName,
    initials: partner?.initials ?? initialsFrom(fallbackName),
    role: partner?.role ?? "Partner",
  };

  return (
    <div className="min-h-screen flex bg-bitumen">
      <Sidebar user={user} />
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
