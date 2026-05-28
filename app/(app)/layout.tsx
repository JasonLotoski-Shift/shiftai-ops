import { Sidebar } from "@/components/sidebar";

// Every route in this layout fetches live data via Prisma — never statically
// snapshot at build time. Otherwise Vercel would bake a one-time render into
// the deploy and pages would show stale data until the next deploy.
export const dynamic = "force-dynamic";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-bitumen">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">{children}</main>
    </div>
  );
}
