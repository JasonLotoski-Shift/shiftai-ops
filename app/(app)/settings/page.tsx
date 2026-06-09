import Link from "next/link";
import { Header } from "@/components/header";
import { Card, CardHeader, CardBody } from "@/components/ui";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ORIGINATION_PCT, FIRM_POOL_PCT } from "@/lib/billing/economics";
import { RateCardEditor } from "@/components/settings/rate-card-editor";
import { GmailConnect } from "@/components/settings/gmail-connect";
import { SystemStatus } from "@/components/settings/system-status";
import { currentIsManagingPartner } from "@/lib/permissions";

// Firm Settings — two tabs:
//  • Firm: billing defaults (rate card + economics, managing-partner only) plus
//    per-partner integrations (Gmail).
//  • System status: operational health of the AI + integrations (all partners).
// URL-routed (?tab=status) so the status tab's heavier queries + Drive ping run
// only when it's open. The rate card / economics stay managing-partner gated;
// the matching mutation (updateRateTier) is guarded server-side too.

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string; tab?: string }>;
}) {
  const { gmail: gmailFlag, tab: tabParam } = await searchParams;
  const tab = tabParam === "status" ? "status" : "firm";
  const session = await auth();
  const partnerId = session?.user?.partnerId;
  const managingPartner = await currentIsManagingPartner();

  // Firm-tab data only — skipped on the status tab.
  const [tiers, gmailAuth] = await Promise.all([
    managingPartner && tab === "firm"
      ? prisma.rateTier.findMany({
          orderBy: { sortOrder: "asc" },
          select: { id: true, key: true, name: true, billRateCents: true, payRateCents: true, active: true },
        })
      : Promise.resolve([]),
    partnerId && tab === "firm"
      ? prisma.partnerGmailAuth.findUnique({ where: { partnerId }, select: { email: true } })
      : Promise.resolve(null),
  ]);

  const origPct = Math.round(DEFAULT_ORIGINATION_PCT * 100);
  const poolPct = Math.round(FIRM_POOL_PCT * 100);
  const labourPct = 100 - origPct - poolPct;

  return (
    <>
      <Header eyebrow="Firm · settings" title="Settings." />

      <div className="px-8 pt-3 flex items-center gap-5 border-b border-graphite">
        <TabLink href="/settings" label="Firm" active={tab === "firm"} />
        <TabLink href="/settings?tab=status" label="System status" active={tab === "status"} />
      </div>

      <div className="px-8 py-8 flex flex-col gap-8 max-w-[960px]">
        {tab === "status" ? (
          <SystemStatus />
        ) : (
          <>
            {managingPartner && <RateCardEditor tiers={tiers} />}

            <GmailConnect
              connected={!!gmailAuth}
              email={gmailAuth?.email ?? null}
              label={process.env.GMAIL_INGEST_LABEL ?? "ops-log"}
              statusFlag={gmailFlag ?? null}
            />

            {managingPartner && (
              <Card>
                <CardHeader className="flex flex-col gap-0.5">
                  <h2 className="title-md">Firm economics</h2>
                  <span className="text-[11px] text-bone-mute">How labour revenue splits, and how each engagement type bills. Read-only.</span>
                </CardHeader>
                <CardBody className="flex flex-col gap-4 pt-0">
                  <div className="grid grid-cols-3 gap-3">
                    <Split label="Origination" pct={origPct} hint="first contract per client; else rolls to firm pool" />
                    <Split label="Firm pool" pct={poolPct} hint="firm reserve" />
                    <Split label="Labour budget" pct={labourPct} hint="pays the team; surplus → firm reserve" />
                  </div>
                  <ul className="flex flex-col gap-1.5 text-[12px] text-bone-dim">
                    <li>· <span className="text-bone">Discovery / pilot / full build</span> bill 50% on signing, 25% mid, 25% on delivery.</li>
                    <li>· <span className="text-bone">Subscription</span> bills month-by-month — the project opens with month 1; add the next month when you bill it.</li>
                    <li>· <span className="text-bone">Buy-out</span> is one lump sum and is exempt from the {origPct}/{poolPct}/{labourPct} split — the whole amount is firm capture.</li>
                    <li>· The split is internal — it never shows on a client invoice. Commission % and contract type are set per project on its Financials tab.</li>
                  </ul>
                </CardBody>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-1 py-2.5 text-[13px] border-b-2 -mb-px transition-colors ${
        active ? "border-track-gold text-bone" : "border-transparent text-bone-dim hover:text-bone"
      }`}
    >
      {label}
    </Link>
  );
}

function Split({ label, pct, hint }: { label: string; pct: number; hint: string }) {
  return (
    <div className="bg-bitumen rounded-[var(--radius-lg)] p-4 flex flex-col gap-1">
      <span className="label text-[10px]">{label}</span>
      <span className="mono text-[24px] text-track-gold tabular-nums leading-none">{pct}%</span>
      <span className="text-[11px] text-bone-mute leading-snug">{hint}</span>
    </div>
  );
}
