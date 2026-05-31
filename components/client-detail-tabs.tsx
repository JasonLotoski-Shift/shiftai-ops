"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardBody, Label, Badge, Button, Tabs, Avatar, EmptyState, Stat } from "@/components/ui";
import { industryLabels } from "@/lib/data/seed";
import { formatCAD, formatDate } from "@/lib/format";
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
  Plus,
  Check,
  FileText,
  Presentation,
  Mail,
  Bot,
} from "lucide-react";

interface ClientDetailTabsProps {
  client: Client;
  partner: Partner | null;
  contact: Contact | null;
  billingContact: Contact | null;
  clientProjects: Project[];
  clientInvoices: Invoice[];
  clientArtifacts: Artifact[];
}

export function ClientDetailTabs({
  client,
  partner,
  contact,
  billingContact,
  clientProjects,
  clientInvoices,
  clientArtifacts,
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

          <Card>
            <div className="px-5 pt-4 pb-2"><span className="title-md">Partner lead</span></div>
            <CardBody className="flex items-center gap-3 pt-0">
              <Avatar initials={partner?.initials ?? ""} size="lg" gold />
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

function CompanyProfile({ client }: { client: Client }) {
  const [enrich, setEnrich] = useState<"idle" | "running" | "results" | "applied">("idle");

  const facts: { label: string; value?: string | null }[] = [
    { label: "Industry", value: industryLabels[client.industry] },
    { label: "Revenue", value: client.revenue },
    { label: "Headcount", value: client.companySize },
    { label: "Headquarters", value: client.headquarters },
    { label: "Founded", value: client.founded },
    { label: "Ownership", value: client.ownership },
  ];

  const proposed = [
    { field: "Headcount", value: `Recent job postings suggest headcount near the top of the ${client.companySize ?? "current"} band.` },
    { field: "Key facts", value: "Trade press flagged a new regional facility opening in Q3 — possible expansion of scope." },
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
          <div className="px-5 pt-4 pb-2"><span className="title-md">Key facts</span></div>
          <div className="flex flex-col pb-2">
            {client.companyKeyFacts.map((f, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <span className="mono text-[11px] text-track-gold mt-0.5 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <p className="text-[13px] text-bone leading-snug">{f}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

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
            This profile updates from logged communications and on-demand web search. Updates are{" "}
            <span className="text-track-gold">proposed</span> — existing facts are never overwritten without review.
          </p>

          {enrich === "results" && (
            <div className="flex flex-col gap-3">
              {proposed.map((p, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Plus size={13} strokeWidth={2} className="text-diagnostic-steel shrink-0 mt-0.5" />
                  <div>
                    <Label>{p.field}</Label>
                    <p className="text-[13px] text-bone mt-0.5 leading-snug">{p.value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {enrich === "applied" && (
            <div className="flex items-center gap-2 px-3 py-2 border border-diagnostic-steel/40 bg-diagnostic-steel/10 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
              <Check size={14} strokeWidth={2} className="text-diagnostic-steel" />
              <span className="text-[13px] text-bone">Additions merged. Existing facts kept.</span>
            </div>
          )}

          <div className="flex gap-2">
            {enrich === "idle" && (
              <>
                <Button variant="secondary" size="sm" onClick={() => { setEnrich("running"); setTimeout(() => setEnrich("results"), 1000); }}>
                  <Globe size={13} strokeWidth={1.5} />
                  Web search
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setEnrich("running"); setTimeout(() => setEnrich("results"), 1000); }}>
                  <Sparkles size={13} strokeWidth={1.5} />
                  AI enrich from comms
                </Button>
              </>
            )}
            {enrich === "running" && <span className="label py-2">Searching…</span>}
            {enrich === "results" && (
              <Button variant="primary" size="sm" onClick={() => setEnrich("applied")}>Add {proposed.length} (keep existing)</Button>
            )}
          </div>
        </CardBody>
      </Card>
    </>
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
