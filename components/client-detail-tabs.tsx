"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardBody, Label, Badge, Button, Tabs, Avatar, EmptyState, Stat } from "@/components/ui";
import { industryLabels } from "@/lib/data/seed";
import { formatCAD, formatDate } from "@/lib/format";
import {
  generateCompanyEnrichment,
  applyCompanyEnrichment,
  type CompanyEnrichAddition,
  type CompanyEnrichConflict,
} from "@/app/(app)/clients/[id]/actions";
import {
  ClientContactsCard,
  type ClientContactLinkItem,
  type ContactPickerOption,
} from "@/components/client-contacts-card";
import type {
  ClientModel as Client,
  PartnerModel as Partner,
  ContactModel as Contact,
  ProjectModel as Project,
  InvoiceModel as Invoice,
  ArtifactModel as Artifact,
} from "@/lib/generated/prisma/models";
import {
  FolderOpen,
  ExternalLink,
  Terminal,
  Globe,
  Sparkles,
  Check,
  FileText,
  Presentation,
  Mail,
  Bot,
  ShieldAlert,
  Linkedin,
  Instagram,
} from "lucide-react";

interface ClientDetailTabsProps {
  client: Client;
  partner: Partner | null;
  contact: Contact | null;
  billingContact: Contact | null;
  clientProjects: Project[];
  clientInvoices: Invoice[];
  clientArtifacts: Artifact[];
  contactLinks: ClientContactLinkItem[];
  allContacts: ContactPickerOption[];
}

export function ClientDetailTabs({
  client,
  partner,
  contact,
  billingContact,
  clientProjects,
  clientInvoices,
  clientArtifacts,
  contactLinks,
  allContacts,
}: ClientDetailTabsProps) {
  const [tab, setTab] = useState("profile");

  const totalBilled = clientInvoices.reduce((s, i) => s + i.amount, 0);
  const totalPaid = clientInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const outstanding = clientInvoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((s, i) => s + i.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        tabs={[
          { key: "profile", label: "Company profile" },
          { key: "engagement", label: "Engagement & billing" },
          { key: "deliverables", label: `Deliverables (${clientArtifacts.length})` },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 flex flex-col gap-6">
          {tab === "profile" && <CompanyProfile client={client} />}
          {tab === "engagement" && (
            <Engagement
              client={client}
              clientProjects={clientProjects}
              clientInvoices={clientInvoices}
              totalBilled={totalBilled}
              totalPaid={totalPaid}
              outstanding={outstanding}
            />
          )}
          {tab === "deliverables" && <Deliverables artifacts={clientArtifacts} />}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <div className="px-5 pt-4 pb-2"><span className="title-md">Primary contact</span></div>
            <CardBody className="flex flex-col gap-4 pt-0">
              <div>
                <div className="text-[14px] text-bone">{contact?.name}</div>
                <div className="text-[11px] text-bone-mute">{contact?.title}</div>
              </div>
              <Link href={`/contacts/${contact?.id}`} className="label-gold hover:underline">Open contact →</Link>
            </CardBody>
          </Card>

          <ClientContactsCard clientId={client.id} links={contactLinks} contacts={allContacts} />

          <Card>
            <div className="px-5 pt-4 pb-2"><span className="title-md">Partner lead</span></div>
            <CardBody className="flex items-center gap-3 pt-0">
              <Avatar initials={partner?.initials ?? ""} size="lg" />
              <div>
                <div className="text-[14px] text-bone">{partner?.name}</div>
                <div className="text-[11px] text-bone-mute">{partner?.role}</div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <div className="px-5 pt-4 pb-2"><span className="title-md">System links</span></div>
            <CardBody className="flex flex-col gap-4 text-[12px] pt-0">
              <div className="flex flex-col gap-1">
                <Label>Drive folder</Label>
                <a href={client.driveFolderUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-bone-dim hover:text-bone group">
                  <FolderOpen size={11} strokeWidth={1.5} />
                  <span className="truncate">/03-Clients/{client.company.split(" ")[0]}/</span>
                  <ExternalLink size={10} strokeWidth={1.5} className="opacity-50 group-hover:opacity-100" />
                </a>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Claude workspace</Label>
                <span className="flex items-start gap-2 text-bone-dim font-mono text-[11px]">
                  <Terminal size={11} strokeWidth={1.5} className="mt-0.5" />
                  <span className="break-all">{client.workspacePath}</span>
                </span>
              </div>
              {billingContact && (
                <div className="flex flex-col gap-1">
                  <Label>Billing contact</Label>
                  <Link href={`/contacts/${billingContact.id}`} className="text-bone-dim hover:text-bone">{billingContact.name}</Link>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Sub-tab A — Company profile
   ────────────────────────────────────────────────────────────────────── */

const COMPANY_ENRICH_FIELD_LABELS: Record<string, string> = {
  companySize: "Headcount",
  headquarters: "Headquarters",
  founded: "Founded",
  website: "Website",
  ownership: "Ownership",
  description: "Description",
  companyKeyFacts: "Key facts",
  brandColors: "Brand colors",
  linkedinUrl: "LinkedIn",
  instagramUrl: "Instagram",
  revenueEstimate: "Revenue (est.)",
  employeeCount: "Employees",
  subIndustry: "Sub-industry",
  locations: "Locations",
  currentSystems: "Current systems",
  painPoints: "Pain points",
  keyServices: "Key services",
  competitors: "Competitors",
};

function CompanyProfile({ client }: { client: Client }) {
  const [phase, setPhase] = useState<"idle" | "results" | "applied">("idle");
  const [additions, setAdditions] = useState<CompanyEnrichAddition[]>([]);
  const [conflicts, setConflicts] = useState<CompanyEnrichConflict[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [appliedCount, setAppliedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, startRun] = useTransition();
  const [isApplying, startApply] = useTransition();

  function runEnrichment() {
    setError(null);
    startRun(async () => {
      try {
        const res = await generateCompanyEnrichment(client.id);
        setAdditions(res.additions);
        setConflicts(res.conflicts);
        setSelected(new Set(res.additions.map((_, i) => i))); // all checked by default
        setPhase("results");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Enrichment failed");
      }
    });
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function apply() {
    setError(null);
    const chosen = additions.filter((_, i) => selected.has(i));
    startApply(async () => {
      try {
        const res = await applyCompanyEnrichment(client.id, chosen);
        setAppliedCount(res.applied);
        setPhase("applied");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to apply");
      }
    });
  }

  const facts: { label: string; value?: string | null }[] = [
    { label: "Industry", value: industryLabels[client.industry] },
    { label: "Revenue", value: client.revenue },
    { label: "Headcount", value: client.companySize },
    { label: "Headquarters", value: client.headquarters },
    { label: "Founded", value: client.founded },
    { label: "Ownership", value: client.ownership },
    // D40 firmographics — shown only when on file (no walls of empty fields)
    ...(client.revenueEstimate != null
      ? [{ label: "Revenue (est.)", value: formatCAD(client.revenueEstimate).replace("CA$", "$") }]
      : []),
    ...(client.employeeCount != null
      ? [{ label: "Employees", value: String(client.employeeCount) }]
      : []),
    ...(client.subIndustry ? [{ label: "Sub-industry", value: client.subIndustry }] : []),
    ...(client.locations ? [{ label: "Locations", value: client.locations }] : []),
    ...(client.renewalDate ? [{ label: "Renewal", value: formatDate(client.renewalDate) }] : []),
  ];

  return (
    <>
      <Card>
        <div className="p-6 flex items-start gap-5">
          <div
            className="w-16 h-16 bg-graphite-2 flex items-center justify-center mono text-[15px] tracking-[0.1em] text-bone shrink-0 rounded-[var(--radius-sm)]"
            style={{ background: client.brandColors?.[0] ? `${client.brandColors[0]}22` : undefined }}
          >
            {client.logoMonogram ?? client.company.split(" ").map((w) => w[0]).join("").slice(0, 3)}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="text-[18px] text-bone">{client.company}</div>
            {client.website && (
              <a href={`https://${client.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[13px] text-bone-dim hover:text-bone">
                <Globe size={12} strokeWidth={1.5} />
                {client.website}
                <ExternalLink size={10} strokeWidth={1.5} className="opacity-50" />
              </a>
            )}
            {(client.linkedinUrl || client.instagramUrl) && (
              <div className="flex items-center gap-4">
                {client.linkedinUrl && (
                  <a href={client.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[13px] text-bone-dim hover:text-bone">
                    <Linkedin size={12} strokeWidth={1.5} />
                    LinkedIn
                    <ExternalLink size={10} strokeWidth={1.5} className="opacity-50" />
                  </a>
                )}
                {client.instagramUrl && (
                  <a href={client.instagramUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[13px] text-bone-dim hover:text-bone">
                    <Instagram size={12} strokeWidth={1.5} />
                    Instagram
                    <ExternalLink size={10} strokeWidth={1.5} className="opacity-50" />
                  </a>
                )}
              </div>
            )}
            {client.brandColors && client.brandColors.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <Label>Brand</Label>
                {client.brandColors.map((c) => (
                  <span key={c} className="flex items-center gap-1.5">
                    <span className="w-4 h-4 border border-graphite-2 rounded-[var(--radius-sm)]" style={{ background: c }} />
                    <span className="mono text-[11px] text-bone-mute">{c}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="px-6 pb-6 grid grid-cols-3 gap-5">
          {facts.map((f) => (
            <div key={f.label} className="flex flex-col gap-1.5">
              <Label>{f.label}</Label>
              <span className="text-[14px] text-bone">{f.value ?? <span className="text-bone-mute">—</span>}</span>
            </div>
          ))}
        </div>
      </Card>

      {client.description && (
        <Card>
          <div className="px-5 pt-4 pb-2"><span className="title-md">What they do</span></div>
          <CardBody className="pt-0"><p className="text-[14px] text-bone-dim leading-relaxed">{client.description}</p></CardBody>
        </Card>
      )}

      {client.companyKeyFacts && client.companyKeyFacts.length > 0 && (
        <Card>
          <div className="px-5 pt-4 pb-2 flex items-center gap-2">
            <span className="title-md">Key facts</span>
            <span className="mono text-[10px] text-bone-mute tabular-nums">{client.companyKeyFacts.length}</span>
          </div>
          {/* Every fact stays in the list — the window caps and scrolls so a
              long record can't swallow the page. */}
          <div className="flex flex-col pb-2 max-h-[300px] overflow-y-auto">
            {client.companyKeyFacts.map((f, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <span className="mono text-[11px] text-track-gold mt-0.5 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <p className="text-[13px] text-bone leading-snug">{f}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {client.statusNote && (
        <Card>
          <div className="px-5 pt-4 pb-2"><span className="title-md">Health note</span></div>
          <CardBody className="pt-0"><p className="text-[14px] text-bone-dim leading-relaxed">{client.statusNote}</p></CardBody>
        </Card>
      )}

      {/* D40 Shift-signal lists — what they run, where it hurts, what they sell,
          who they're up against. Each card renders only when there's data. */}
      <ProfileListCard title="Current systems" items={client.currentSystems} />
      <ProfileListCard title="Pain points" items={client.painPoints} />
      <ProfileListCard title="Key services" items={client.keyServices} />
      <ProfileListCard title="Competitors" items={client.competitors} />

      <Card className="border border-track-gold/40 bg-track-gold-dim/5">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={14} strokeWidth={1.5} className="text-track-gold" />
            <span className="title-md text-track-gold">Keep this current</span>
          </div>
          {client.enrichedAt && <span className="label">Last enriched {formatDate(client.enrichedAt)}</span>}
        </div>
        <CardBody className="flex flex-col gap-3 pt-0">
          <p className="text-[13px] text-bone leading-relaxed">
            Pull public company facts from the web — headcount, HQ, founded, ownership, and notable facts — each cited to its
            source. Updates are <span className="text-track-gold">proposed</span>: existing facts are never overwritten, and
            anything that conflicts is flagged for you to resolve.
          </p>

          {phase === "results" && (
            <>
              {additions.length === 0 && conflicts.length === 0 ? (
                <p className="text-[13px] text-bone-dim leading-relaxed">
                  Nothing new to add — the web search didn&apos;t surface anything beyond what&apos;s already on the record.
                </p>
              ) : (
                <>
                  {additions.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <Label gold>Proposed additions ({additions.length}) · check what to keep</Label>
                      <div className="bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
                        {additions.map((a, i) => (
                          <label
                            key={i}
                            className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--color-row-hover)] ${i > 0 ? "border-t border-graphite/30" : ""} ${selected.has(i) ? "" : "opacity-50"}`}
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(i)}
                              onChange={() => toggle(i)}
                              className="mt-1 accent-track-gold"
                            />
                            <div className="min-w-0">
                              <Label>{COMPANY_ENRICH_FIELD_LABELS[a.field] ?? a.field}</Label>
                              <p className="text-[13px] text-bone mt-0.5 leading-snug">{a.value}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {conflicts.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <Label>Conflicts · review ({conflicts.length})</Label>
                      {conflicts.map((c, i) => (
                        <div key={i} className="border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] px-4 py-3 flex flex-col gap-2">
                          <Label>{COMPANY_ENRICH_FIELD_LABELS[c.field] ?? c.field}</Label>
                          <div className="grid grid-cols-2 gap-3 text-[13px]">
                            <div className="flex flex-col gap-1">
                              <span className="label text-[9px]">Keep (current)</span>
                              <span className="text-bone">{c.existing}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="label text-[9px]">Proposed</span>
                              <span className="text-bone-dim">{c.proposed}</span>
                            </div>
                          </div>
                          {c.note && <span className="text-[11px] text-bone-mute">{c.note}</span>}
                          <span className="text-[11px] text-bone-mute">Not applied — edit the record by hand if you want this.</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {phase === "applied" && (
            <div className="flex items-center gap-2 px-3 py-2 border border-diagnostic-steel/40 bg-diagnostic-steel/10 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
              <Check size={14} strokeWidth={2} className="text-diagnostic-steel" />
              <span className="text-[13px] text-bone">{appliedCount} fact(s) merged. Existing facts kept.</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          <div className="flex gap-2">
            {phase === "idle" && (
              <Button variant="secondary" size="sm" onClick={runEnrichment} disabled={isRunning}>
                <Globe size={13} strokeWidth={1.5} />
                {isRunning ? "Searching the web…" : "Enrich from web"}
              </Button>
            )}
            {phase === "results" && additions.length > 0 && (
              <Button variant="primary" size="sm" onClick={apply} disabled={isApplying || selected.size === 0}>
                {isApplying ? "Merging…" : `Add ${selected.size} (keep existing)`}
              </Button>
            )}
            {phase === "results" && additions.length === 0 && (
              <Button variant="ghost" size="sm" onClick={() => setPhase("idle")}>Done</Button>
            )}
          </div>
        </CardBody>
      </Card>
    </>
  );
}

// One compact list card per Shift-signal field. Returns nothing when the
// field is empty so the profile never shows hollow sections.
function ProfileListCard({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <Card>
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <span className="title-md">{title}</span>
        <span className="mono text-[10px] text-bone-mute tabular-nums">{items.length}</span>
      </div>
      <div className="flex flex-col pb-3 max-h-[260px] overflow-y-auto">
        {items.map((v, i) => (
          <div key={i} className="flex items-start gap-3 px-5 py-2">
            <span className="mono text-[11px] text-track-gold mt-0.5">—</span>
            <p className="text-[13px] text-bone leading-snug">{v}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Sub-tab B — Engagement & billing
   ────────────────────────────────────────────────────────────────────── */

function Engagement({
  client,
  clientProjects,
  clientInvoices,
  totalBilled,
  totalPaid,
  outstanding,
}: {
  client: Client;
  clientProjects: Project[];
  clientInvoices: Invoice[];
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
}) {
  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-5">
          <Stat label="Contract value" value={formatCAD(client.contractValue).replace("CA$", "$")} gold />
        </Card>
        <Card className="p-5">
          <Stat label="Billed" value={formatCAD(totalBilled).replace("CA$", "$")} />
        </Card>
        <Card className="p-5">
          <Stat label="Collected" value={formatCAD(totalPaid).replace("CA$", "$")} />
        </Card>
        <Card className="p-5">
          <div className="flex flex-col gap-2">
            <Label>Outstanding</Label>
            <span className={`mono text-[18px] tabular-nums ${outstanding > 0 ? "text-flag-red" : "text-bone"}`}>
              {formatCAD(outstanding).replace("CA$", "$")}
            </span>
          </div>
        </Card>
      </div>

      <Card>
        <div className="px-6 py-5 grid grid-cols-3 gap-6">
          <div className="flex flex-col gap-1.5">
            <Label>Payment terms</Label>
            <span className="text-[14px] text-bone">{client.paymentTerms ?? "—"}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Contract period</Label>
            <span className="mono text-[13px] text-bone tabular-nums">
              {formatDate(client.contractSignedAt)} → {client.contractEndAt ? formatDate(client.contractEndAt) : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <div>
              <Badge tone={client.status === "on_track" ? "steel" : client.status === "at_risk" ? "gold" : client.status === "blocked" ? "red" : "neutral"}>
                {client.status.replace("_", "-")}
              </Badge>
            </div>
          </div>
        </div>
        {client.notes && (
          <div className="px-6 pb-5">
            <Label>Status note</Label>
            <p className="text-[14px] text-bone-dim mt-2 leading-relaxed">{client.notes}</p>
          </div>
        )}
      </Card>

      <Card>
        <div className="px-5 pt-4 pb-2 flex justify-between items-center">
          <span className="title-md">Projects ({clientProjects.length})</span>
          <Link href="/projects" className="label-gold hover:underline">All projects →</Link>
        </div>
        {clientProjects.map((p, i) => {
          return (
            <Link
              href={`/projects/${p.id}`}
              key={p.id}
              className="grid grid-cols-[2fr_120px_100px] gap-4 px-5 py-4 hover:bg-[var(--color-row-hover)] transition-colors"
            >
              <div className="min-w-0">
                <div className="text-[14px] text-bone truncate">{p.name.split("·")[1]?.trim() ?? p.name}</div>
                <div className="text-[11px] text-bone-mute">{formatDate(p.startDate)} → {formatDate(p.targetEndDate)}</div>
              </div>
              <div className="self-center">
                <Badge tone={p.phase === "build" ? "gold" : p.phase === "run" ? "steel" : "bone"}>{p.phase}</Badge>
              </div>
              <div className="self-center flex justify-end">
                <Badge tone={p.status === "on_track" ? "steel" : p.status === "at_risk" ? "gold" : p.status === "blocked" ? "red" : "neutral"}>
                  {p.status.replace("_", "-")}
                </Badge>
              </div>
            </Link>
          );
        })}
      </Card>

      <Card>
        <div className="px-5 pt-4 pb-2 flex justify-between items-center">
          <span className="title-md">Invoices</span>
          <Link href="/invoices" className="label-gold hover:underline">All →</Link>
        </div>
        {clientInvoices.map((inv, i) => (
          <Link
            href={`/invoices/${inv.id}`}
            key={inv.id}
            className="grid grid-cols-[1fr_140px_140px_100px] gap-4 px-5 py-4 hover:bg-[var(--color-row-hover)] transition-colors"
          >
            <span className="mono text-[13px] text-bone self-center">{inv.number}</span>
            <span className="mono text-[14px] text-bone tabular-nums self-center">{formatCAD(inv.amount).replace("CA$", "$")}</span>
            <span className="mono text-[12px] text-bone-dim tabular-nums self-center">Due {formatDate(inv.dueAt)}</span>
            <div className="self-center flex justify-end">
              <Badge tone={inv.status === "paid" ? "steel" : inv.status === "overdue" ? "red" : inv.status === "sent" ? "gold" : "neutral"}>
                {inv.status}
              </Badge>
            </div>
          </Link>
        ))}
      </Card>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Sub-tab C — Deliverables (Artifact rows scoped to the client)
   ────────────────────────────────────────────────────────────────────── */

const artifactIcon: Record<Artifact["type"], typeof FileText> = {
  proposal: FileText,
  deck: Presentation,
  email: Mail,
  sow: FileText,
  invoice: FileText,
  report: FileText,
  other: FileText,
};

const reviewTone: Record<
  Artifact["reviewStatus"],
  "neutral" | "steel" | "gold" | "bone"
> = {
  draft: "neutral",
  approved: "steel",
  sent: "gold",
  archived: "bone",
};

function Deliverables({ artifacts }: { artifacts: Artifact[] }) {
  const aiCount = artifacts.filter((a) => a.createdBy.startsWith("AGENT")).length;
  const draftCount = artifacts.filter((a) => a.reviewStatus === "draft").length;

  if (artifacts.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<FileText size={28} strokeWidth={1.5} />}
          title="No deliverables yet"
          hint="AI-generated artifacts (proposals, decks, emails) and partner uploads will appear here as the engagement runs."
        />
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-5">
          <Stat label="Total" value={artifacts.length} />
        </Card>
        <Card className="p-5">
          <div className="flex flex-col gap-2">
            <Label>AI-generated</Label>
            <span className="mono text-[18px] text-track-gold tabular-nums flex items-center gap-2">
              {aiCount}
              {aiCount > 0 && <Bot size={14} strokeWidth={1.5} />}
            </span>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex flex-col gap-2">
            <Label>Drafts pending review</Label>
            <span className={`mono text-[18px] tabular-nums ${draftCount > 0 ? "text-flag-red" : "text-bone"}`}>
              {draftCount}
            </span>
          </div>
        </Card>
      </div>

      <Card>
        <div className="px-5 pt-4 pb-2 flex justify-between items-center">
          <span className="title-md">All deliverables (newest first)</span>
        </div>
        {artifacts.map((ar, i) => {
          const Icon = artifactIcon[ar.type] ?? FileText;
          const isAgent = ar.createdBy.startsWith("AGENT");
          return (
            <a
              href={ar.driveUrl}
              target="_blank"
              rel="noreferrer"
              key={ar.id}
              className="grid grid-cols-[28px_1fr_180px_100px_20px] gap-4 px-5 py-4 hover:bg-[var(--color-row-hover)] transition-colors group"
            >
              <div className="self-center text-bone-mute group-hover:text-track-gold transition-colors">
                <Icon size={16} strokeWidth={1.5} />
              </div>

              <div className="min-w-0 flex flex-col gap-1 self-center">
                <div className="text-[14px] text-bone truncate">{ar.title}</div>
                <div className="flex items-center gap-2 text-[11px] text-bone-mute">
                  <span className="mono uppercase tracking-[0.08em]">{ar.type}</span>
                  {ar.fileName && (
                    <>
                      <span>·</span>
                      <span className="truncate">{ar.fileName}</span>
                    </>
                  )}
                  {ar.generatedFromSkill && (
                    <>
                      <span>·</span>
                      <span className="mono text-track-gold">/{ar.generatedFromSkill}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="self-center flex flex-col gap-0.5 min-w-0">
                <div className={`text-[12px] truncate flex items-center gap-1.5 ${isAgent ? "text-track-gold" : "text-bone"}`}>
                  {isAgent && <Bot size={11} strokeWidth={1.5} />}
                  <span className="truncate">{ar.createdBy}</span>
                </div>
                <span className="mono text-[11px] text-bone-mute tabular-nums">{formatDate(ar.createdAt)}</span>
              </div>

              <div className="self-center flex justify-end">
                <Badge tone={reviewTone[ar.reviewStatus]}>{ar.reviewStatus}</Badge>
              </div>

              <div className="self-center text-bone-mute opacity-50 group-hover:opacity-100 transition-opacity">
                <ExternalLink size={12} strokeWidth={1.5} />
              </div>
            </a>
          );
        })}
      </Card>
    </>
  );
}
