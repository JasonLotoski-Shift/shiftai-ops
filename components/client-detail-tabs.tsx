"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardBody, Label, Badge, Button, Hairline, Tabs } from "@/components/ui";
import {
  clientById,
  partnerById,
  contactById,
  projects,
  invoices,
  industryLabels,
  formatCAD,
  formatDate,
} from "@/lib/data/seed";
import {
  FolderOpen,
  ExternalLink,
  Terminal,
  Globe,
  Sparkles,
  Plus,
  Check,
} from "lucide-react";

export function ClientDetailTabs({ clientId }: { clientId: string }) {
  const [tab, setTab] = useState("profile");
  const client = clientById(clientId);
  if (!client) return null;

  const partner = partnerById(client.partnerLeadId);
  const contact = contactById(client.primaryContactId);
  const billingContact = client.billingContactId ? contactById(client.billingContactId) : contact;
  const clientProjects = projects.filter((p) => p.clientId === client.id);
  const clientInvoices = invoices.filter((i) => i.clientId === client.id);
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
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="grid grid-cols-3 gap-6">
        {/* Main column */}
        <div className="col-span-2 flex flex-col gap-6">
          {tab === "profile" ? (
            <CompanyProfile client={client} />
          ) : (
            <Engagement
              client={client}
              clientProjects={clientProjects}
              clientInvoices={clientInvoices}
              totalBilled={totalBilled}
              totalPaid={totalPaid}
              outstanding={outstanding}
            />
          )}
        </div>

        {/* Persistent sidebar */}
        <div className="flex flex-col gap-6">
          <Card>
            <div className="px-5 py-4 border-b border-graphite"><Label>— Primary contact</Label></div>
            <CardBody className="flex flex-col gap-3">
              <div>
                <div className="text-[14px] text-bone">{contact?.name}</div>
                <div className="text-[11px] text-bone-mute">{contact?.title}</div>
              </div>
              <Hairline />
              <Link href={`/contacts/${contact?.id}`} className="label-gold hover:underline">Open contact →</Link>
            </CardBody>
          </Card>

          <Card>
            <div className="px-5 py-4 border-b border-graphite"><Label>— Partner lead</Label></div>
            <CardBody className="flex items-center gap-3">
              <div className="w-9 h-9 bg-track-gold-dim/30 border border-track-gold/40 flex items-center justify-center mono text-[13px] text-track-gold">
                {partner?.initials}
              </div>
              <div>
                <div className="text-[14px] text-bone">{partner?.name}</div>
                <div className="text-[11px] text-bone-mute">{partner?.role}</div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <div className="px-5 py-4 border-b border-graphite"><Label>— System links</Label></div>
            <CardBody className="flex flex-col gap-3 text-[12px]">
              <div className="flex flex-col gap-1">
                <Label>Drive folder</Label>
                <a href={client.driveFolderUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-bone-dim hover:text-bone group">
                  <FolderOpen size={11} strokeWidth={1.5} />
                  <span className="truncate">/03-Clients/{client.company.split(" ")[0]}/</span>
                  <ExternalLink size={10} strokeWidth={1.5} className="opacity-50 group-hover:opacity-100" />
                </a>
              </div>
              <Hairline />
              <div className="flex flex-col gap-1">
                <Label>Claude workspace</Label>
                <span className="flex items-start gap-2 text-bone-dim font-mono text-[11px]">
                  <Terminal size={11} strokeWidth={1.5} className="mt-0.5" />
                  <span className="break-all">{client.workspacePath}</span>
                </span>
              </div>
              {billingContact && (
                <>
                  <Hairline />
                  <div className="flex flex-col gap-1">
                    <Label>Billing contact</Label>
                    <Link href={`/contacts/${billingContact.id}`} className="text-bone-dim hover:text-bone">{billingContact.name}</Link>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Sub-tab A — Company profile (auto-built from comms + web search)
   ────────────────────────────────────────────────────────────────────── */

function CompanyProfile({ client }: { client: NonNullable<ReturnType<typeof clientById>> }) {
  const [enrich, setEnrich] = useState<"idle" | "running" | "results" | "applied">("idle");

  const facts: { label: string; value?: string }[] = [
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
      {/* Identity / brand */}
      <Card>
        <div className="p-6 flex items-start gap-5">
          <div
            className="w-16 h-16 border border-graphite flex items-center justify-center mono text-[15px] tracking-[0.1em] text-bone shrink-0"
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
                    <span className="w-4 h-4 border border-graphite-2" style={{ background: c }} />
                    <span className="mono text-[11px] text-bone-mute">{c}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <Hairline />
        <div className="px-6 py-5 grid grid-cols-3 gap-5">
          {facts.map((f) => (
            <div key={f.label} className="flex flex-col gap-1.5">
              <Label>— {f.label}</Label>
              <span className="text-[14px] text-bone">{f.value ?? <span className="text-bone-mute">—</span>}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Description */}
      {client.description && (
        <Card>
          <div className="px-5 py-4 border-b border-graphite"><Label>— What they do</Label></div>
          <CardBody><p className="text-[14px] text-bone-dim leading-relaxed">{client.description}</p></CardBody>
        </Card>
      )}

      {/* Company key facts */}
      {client.companyKeyFacts && client.companyKeyFacts.length > 0 && (
        <Card>
          <div className="px-5 py-4 border-b border-graphite"><Label>— Key facts</Label></div>
          <div className="flex flex-col">
            {client.companyKeyFacts.map((f, i) => (
              <div key={i} className={`flex items-start gap-3 px-5 py-3 ${i < client.companyKeyFacts!.length - 1 ? "border-b border-graphite" : ""}`}>
                <span className="mono text-[11px] text-track-gold mt-0.5 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <p className="text-[13px] text-bone leading-snug">{f}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Auto-update / enrich */}
      <Card className="border-track-gold/40 bg-track-gold-dim/5">
        <div className="px-5 py-4 border-b border-track-gold/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>— Keep this current</Label>
          </div>
          {client.enrichedAt && <span className="label">Last enriched {formatDate(client.enrichedAt)}</span>}
        </div>
        <CardBody className="flex flex-col gap-3">
          <p className="text-[13px] text-bone leading-relaxed">
            This profile updates from logged communications and on-demand web search. Updates are{" "}
            <span className="text-track-gold">proposed</span> — existing facts are never overwritten without review.
          </p>

          {enrich === "results" && (
            <div className="border border-graphite">
              {proposed.map((p, i) => (
                <div key={i} className={`flex items-start gap-3 px-4 py-3 ${i < proposed.length - 1 ? "border-b border-graphite" : ""}`}>
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
            <div className="flex items-center gap-2 px-3 py-2 border border-diagnostic-steel/40 bg-diagnostic-steel/10">
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
  client: NonNullable<ReturnType<typeof clientById>>;
  clientProjects: typeof projects;
  clientInvoices: typeof invoices;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
}) {
  return (
    <>
      {/* Contract summary */}
      <Card>
        <div className="p-6 grid grid-cols-4 gap-6">
          <div className="flex flex-col gap-2">
            <Label>— Contract value</Label>
            <span className="mono text-[24px] text-track-gold tabular-nums">{formatCAD(client.contractValue).replace("CA$", "$")}</span>
          </div>
          <div className="flex flex-col gap-2">
            <Label>— Billed</Label>
            <span className="mono text-[18px] text-bone tabular-nums">{formatCAD(totalBilled).replace("CA$", "$")}</span>
          </div>
          <div className="flex flex-col gap-2">
            <Label>— Collected</Label>
            <span className="mono text-[18px] text-bone tabular-nums">{formatCAD(totalPaid).replace("CA$", "$")}</span>
          </div>
          <div className="flex flex-col gap-2">
            <Label>— Outstanding</Label>
            <span className={`mono text-[18px] tabular-nums ${outstanding > 0 ? "text-flag-red" : "text-bone"}`}>
              {formatCAD(outstanding).replace("CA$", "$")}
            </span>
          </div>
        </div>
        <Hairline />
        <div className="px-6 py-5 grid grid-cols-3 gap-6">
          <div className="flex flex-col gap-1.5">
            <Label>— Payment terms</Label>
            <span className="text-[14px] text-bone">{client.paymentTerms ?? "—"}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>— Contract period</Label>
            <span className="mono text-[13px] text-bone tabular-nums">
              {formatDate(client.contractSignedAt)} → {client.contractEndAt ? formatDate(client.contractEndAt) : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>— Status</Label>
            <div>
              <Badge tone={client.status === "on-track" ? "steel" : client.status === "at-risk" ? "gold" : client.status === "blocked" ? "red" : "neutral"}>
                {client.status}
              </Badge>
            </div>
          </div>
        </div>
        {client.notes && (
          <>
            <Hairline />
            <div className="px-6 py-5">
              <Label>— Status note</Label>
              <p className="text-[14px] text-bone-dim mt-2 leading-relaxed">{client.notes}</p>
            </div>
          </>
        )}
      </Card>

      {/* Projects */}
      <Card>
        <div className="px-5 py-4 border-b border-graphite flex justify-between items-center">
          <Label>— Projects ({clientProjects.length})</Label>
          <Link href="/projects" className="label-gold hover:underline">All projects →</Link>
        </div>
        {clientProjects.map((p, i) => {
          const burn = (p.hoursLogged / p.budgetHours) * 100;
          return (
            <Link
              href={`/projects/${p.id}`}
              key={p.id}
              className={`grid grid-cols-[2fr_100px_120px_100px] gap-4 px-5 py-4 ${i < clientProjects.length - 1 ? "border-b border-graphite" : ""} hover:bg-graphite/40 transition-colors`}
            >
              <div className="min-w-0">
                <div className="text-[14px] text-bone truncate">{p.name.split("·")[1]?.trim() ?? p.name}</div>
                <div className="text-[11px] text-bone-mute">{formatDate(p.startDate)} → {formatDate(p.targetEndDate)}</div>
              </div>
              <div className="self-center">
                <Badge tone={p.phase === "build" ? "gold" : p.phase === "run" ? "steel" : "bone"}>{p.phase}</Badge>
              </div>
              <div className="self-center flex flex-col gap-1">
                <span className="mono text-[12px] text-bone tabular-nums">{p.hoursLogged} / {p.budgetHours}h</span>
                <div className="h-[2px] bg-graphite w-full">
                  <div className="h-full bg-track-gold" style={{ width: `${Math.min(burn, 100)}%` }} />
                </div>
              </div>
              <div className="self-center flex justify-end">
                <Badge tone={p.status === "on-track" ? "steel" : p.status === "at-risk" ? "gold" : p.status === "blocked" ? "red" : "neutral"}>
                  {p.status}
                </Badge>
              </div>
            </Link>
          );
        })}
      </Card>

      {/* Invoices */}
      <Card>
        <div className="px-5 py-4 border-b border-graphite flex justify-between items-center">
          <Label>— Invoices</Label>
          <Link href="/invoices" className="label-gold hover:underline">All →</Link>
        </div>
        {clientInvoices.map((inv, i) => (
          <Link
            href={`/invoices/${inv.id}`}
            key={inv.id}
            className={`grid grid-cols-[1fr_140px_140px_100px] gap-4 px-5 py-4 ${i < clientInvoices.length - 1 ? "border-b border-graphite" : ""} hover:bg-graphite/40 transition-colors`}
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
