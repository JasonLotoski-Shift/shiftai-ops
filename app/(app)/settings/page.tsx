import { Header } from "@/components/header";
import { Card, CardHeader, CardBody } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ORIGINATION_PCT, FIRM_POOL_PCT } from "@/lib/billing/economics";
import { RateCardEditor } from "@/components/settings/rate-card-editor";

// Firm Settings — firm-wide billing defaults. Today: the rate card (editable)
// plus a read-only summary of the firm economics split and how each engagement
// type bills. Per-project overrides still live on each project's Financials tab.

export default async function SettingsPage() {
  const tiers = await prisma.rateTier.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, key: true, name: true, billRateCents: true, payRateCents: true, active: true },
  });

  const origPct = Math.round(DEFAULT_ORIGINATION_PCT * 100);
  const poolPct = Math.round(FIRM_POOL_PCT * 100);
  const labourPct = 100 - origPct - poolPct;

  return (
    <>
      <Header eyebrow="Firm · billing defaults" title="Settings." />

      <div className="px-8 py-8 flex flex-col gap-8 max-w-[860px]">
        <RateCardEditor tiers={tiers} />

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
      </div>
    </>
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
