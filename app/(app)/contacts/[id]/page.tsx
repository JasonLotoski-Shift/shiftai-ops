import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { Card, CardBody, Label, Badge, Avatar, EmptyState } from "@/components/ui";
import { ContactActions } from "@/components/contact-actions";
import { prisma } from "@/lib/prisma";
import { savedAtBySkill } from "@/lib/action-status";
import { formatCAD, formatDate, daysSince, dealLabel } from "@/lib/format";
import { interactionLabels, industryLabels, stageLabels, leadSourceLabels } from "@/lib/data/seed";
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Sparkles,
  Phone as PhoneIcon,
  Users,
  Calendar,
  Send,
  Inbox,
  Globe,
  Linkedin,
  MapPin,
  Smartphone,
} from "lucide-react";

// Keys use Prisma enum identifiers (underscored), matching @map'd DB values.
const interactionIcon: Record<string, typeof Mail> = {
  call: PhoneIcon,
  meeting: Users,
  email_sent: Send,
  email_received: Inbox,
  other: Calendar,
};

// D40 link/reach label maps — local until these grow more call sites.
const stakeholderRoleLabels: Record<string, string> = {
  decision_maker: "Decision maker",
  champion: "Champion",
  influencer: "Influencer",
  budget_holder: "Budget holder",
  technical: "Technical",
  gatekeeper: "Gatekeeper",
  blocker: "Blocker",
  other: "Other",
};

const preferredChannelLabels: Record<string, string> = {
  email: "email",
  call: "call",
  text: "text",
  linkedin: "LinkedIn",
};

const strengthBadge: Record<string, { label: string; tone: "steel" | "bone" | "gold" }> = {
  cold: { label: "Cold", tone: "steel" },
  warm: { label: "Warm", tone: "bone" },
  strong: { label: "Strong", tone: "gold" },
};

// How the person connects to the company — one line per ContactLink.
function linkPhrase(relationship: string, company: string): string {
  switch (relationship) {
    case "works_there":
      return `Works at ${company}`;
    case "introduced_us":
      return `Introduced us — ${company}`;
    case "advisor":
      return `Advises ${company}`;
    default:
      return `Connected — ${company}`;
  }
}

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Contact record + its saved step-1 drafts are independent — one parallel wave.
  const [contact, contactSavedAt] = await Promise.all([
    prisma.contact.findUnique({
      where: { id },
      include: {
        partnerLead: true,
        deals: { orderBy: { closeTargetDate: "asc" } },
        interactions: { orderBy: { date: "desc" }, select: { id: true, type: true, date: true, summary: true, loggedBy: true, channel: true } },
        // The person's company hats (employment / roles) — primary first.
        affiliations: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
        // Companies this person connects to — works-there / introduced-us /
        // advises, against deals and clients (the connector-value view).
        links: {
          include: {
            deal: { select: { id: true, company: true } },
            client: { select: { id: true, company: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    // Saved step-1 email drafts (orange) — contact-scoped (ActionDraft.contactId).
    savedAtBySkill({ contactId: id }),
  ]);
  if (!contact) notFound();

  const partner = contact.partnerLead;
  const contactDeals = contact.deals;
  const log = contact.interactions;
  const stale = daysSince(contact.lastTouchAt) > 30;
  const enriched = Boolean(contact.persona || contact.keyFacts.length || contact.background);

  // Actions panel run-status (green) + saved step-1 drafts (orange). The only
  // two-step contact action is Draft email. The email Artifact is scoped to the
  // contact's client/deal (Artifact has no contactId), so the contact-true
  // "last ran" signal is the most recent email_sent interaction logged here.
  // Saved step-1 drafts ARE contact-scoped (ActionDraft.contactId) — fetched in
  // the Promise.all above as contactSavedAt.
  const lastEmailSent = log.find((i) => i.type === "email_sent")?.date;
  const actionRanAt: Record<string, Date | undefined> = { email: lastEmailSent };
  const actionSavedAt: Record<string, Date | undefined> = { email: contactSavedAt["draft-email"] };

  return (
    <>
      <Header eyebrow={contact.title} title={contact.name} />

      <div className="px-8 py-8 flex flex-col gap-8">
        <ContactActions contact={contact} affiliations={contact.affiliations} partnerName={partner?.name} ranAt={actionRanAt} savedAt={actionSavedAt} />

        <div className="flex items-center justify-between">
          <Link href="/contacts" className="label hover:text-bone flex items-center gap-2">
            <ArrowLeft size={12} strokeWidth={1.5} />
            Back to contacts
          </Link>
          {contact.enrichedAt && (
            <span className="label">Record enriched {formatDate(contact.enrichedAt)}</span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 flex flex-col gap-6">
          <Card>
            <div className="p-6 grid grid-cols-3 gap-6">
              <div className="flex flex-col gap-2">
                <Label>Company</Label>
                <div className="flex items-center gap-2 text-[16px] text-bone">
                  <Building2 size={14} strokeWidth={1.5} className="text-bone-mute" />
                  {contact.company}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Industry</Label>
                <Badge tone="bone">{industryLabels[contact.industry]}</Badge>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Source</Label>
                <div className="flex items-center gap-2">
                  {contact.sourceCategory && (
                    <Badge tone="gold">{leadSourceLabels[contact.sourceCategory] ?? contact.sourceCategory}</Badge>
                  )}
                  <span className="text-[13px] text-bone-dim">{contact.source}</span>
                </div>
              </div>
            </div>
          </Card>

          {contact.affiliations.length > 1 && (
            <Card>
              <CardBody className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <h2 className="title-md text-bone">Roles &amp; companies</h2>
                  <span className="label">{contact.affiliations.length} roles</span>
                </div>
                <div className="flex flex-col">
                  {contact.affiliations.map((aff) => (
                    <div key={aff.id} className="flex items-center gap-3 px-2 py-3 -mx-2">
                      <div className="w-7 h-7 bg-graphite/40 flex items-center justify-center shrink-0 text-bone-mute rounded-[var(--radius-sm)]">
                        <Building2 size={13} strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                        <span className="text-[14px] text-bone">{aff.company}</span>
                        {aff.title && <span className="text-[11px] text-bone-mute">{aff.title}</span>}
                      </div>
                      {aff.isPrimary && <Badge tone="gold">Primary</Badge>}
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {contact.links.length > 0 && (
            <Card>
              <CardBody className="flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <h2 className="title-md text-bone">Companies</h2>
                  <span className="label">{contact.links.length} linked</span>
                </div>
                <div className="flex flex-col">
                  {contact.links.map((link) => {
                    const target = link.deal
                      ? { href: `/pipeline/${link.deal.id}`, company: link.deal.company, kind: "Deal" }
                      : link.client
                        ? { href: `/clients/${link.client.id}`, company: link.client.company, kind: "Client" }
                        : null;
                    if (!target) return null;
                    return (
                      <Link
                        key={link.id}
                        href={target.href}
                        className="flex items-center gap-3 px-2 py-3 -mx-2 rounded-[var(--radius-sm)] hover:bg-[var(--color-row-hover)] transition-colors"
                      >
                        <div className="w-7 h-7 bg-graphite/40 flex items-center justify-center shrink-0 text-bone-mute rounded-[var(--radius-sm)]">
                          <Building2 size={13} strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                          <span className="text-[14px] text-bone">{linkPhrase(link.relationship, target.company)}</span>
                          {link.roleLabel && <span className="text-[11px] text-bone-mute">{link.roleLabel}</span>}
                        </div>
                        {link.isPrimary && <Badge tone="gold">Primary</Badge>}
                        {link.role && <Badge tone="bone">{stakeholderRoleLabels[link.role] ?? link.role}</Badge>}
                        <Badge tone="neutral">{target.kind}</Badge>
                      </Link>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          )}

          {!enriched && (
            <Card className="border-track-gold/40 bg-track-gold-dim/5">
              <CardBody className="flex items-start gap-4">
                <Sparkles size={16} strokeWidth={1.5} className="text-track-gold shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <Label gold>Thin record</Label>
                  <p className="text-[13px] text-bone leading-relaxed">
                    No persona or key facts yet. Use <span className="text-track-gold">Enrich from web</span> or{" "}
                    <span className="text-track-gold">AI enrich</span> (in Actions, under the title) to build this record
                    from public sources and the communications log. Additions merge — nothing here gets overwritten.
                  </p>
                </div>
              </CardBody>
            </Card>
          )}

          {(contact.persona || contact.communicationStyle) && (
            <div className="grid grid-cols-2 gap-6">
              {contact.persona && (
                <Card>
                  <CardBody className="flex flex-col gap-3">
                    <h2 className="title-md text-bone">Persona</h2>
                    <p className="text-[13px] text-bone leading-relaxed">{contact.persona}</p>
                  </CardBody>
                </Card>
              )}
              {contact.communicationStyle && (
                <Card>
                  <CardBody className="flex flex-col gap-3">
                    <h2 className="title-md text-bone">Communication style</h2>
                    <p className="text-[13px] text-bone leading-relaxed">{contact.communicationStyle}</p>
                  </CardBody>
                </Card>
              )}
            </div>
          )}

          {contact.keyFacts.length > 0 && (
            <Card>
              <CardBody className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="title-md text-bone">Key facts</h2>
                  <span className="mono text-[10px] text-bone-mute tabular-nums">{contact.keyFacts.length}</span>
                </div>
                {/* Every fact stays in the list — the window caps and scrolls
                    so a long record can't swallow the page. */}
                <div className="flex flex-col max-h-[300px] overflow-y-auto pr-2">
                  {contact.keyFacts.map((f, i) => (
                    <div key={i} className="flex items-start gap-3 py-2">
                      <span className="mono text-[11px] text-track-gold mt-0.5 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                      <p className="text-[13px] text-bone leading-snug">{f}</p>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {contact.background && (
            <Card>
              <CardBody className="flex flex-col gap-3">
                <h2 className="title-md text-bone">Background</h2>
                <p className="text-[14px] text-bone-dim leading-relaxed">{contact.background}</p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardBody className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <h2 className="title-md text-bone">Communications log</h2>
                <span className="label">{log.length} logged</span>
              </div>
              {log.length === 0 ? (
                <EmptyState icon={<Calendar size={22} strokeWidth={1.5} />} title="No interactions logged yet" compact />
              ) : (
                <div className="flex flex-col">
                  {log.map((it, i) => {
                    const Ic = interactionIcon[it.type] ?? Calendar;
                    const agent = it.loggedBy.startsWith("AGENT");
                    return (
                      <div key={it.id} className="flex items-start gap-4 py-4">
                        <div className="w-7 h-7 bg-graphite/40 flex items-center justify-center shrink-0 text-bone-mute rounded-[var(--radius-sm)]">
                          <Ic size={13} strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge tone="neutral">{interactionLabels[it.type]}</Badge>
                          {it.channel && <span className="label text-[9px]">{it.channel}</span>}
                          <span className="label text-[9px] ml-auto">{formatDate(it.date)}</span>
                        </div>
                          <p className="text-[13px] text-bone leading-snug">{it.summary}</p>
                          <p className={`text-[11px] mt-1 ${agent ? "text-track-gold" : "text-bone-mute"}`}>{it.loggedBy}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-col gap-3">
              <h2 className="title-md text-bone">Deals ({contactDeals.length})</h2>
              {contactDeals.length === 0 ? (
                <EmptyState icon={<Building2 size={22} strokeWidth={1.5} />} title="No open deals" compact />
              ) : (
                <div className="flex flex-col">
                  {contactDeals.map((deal, i) => (
                    <Link
                      href={`/pipeline/${deal.id}`}
                      key={deal.id}
                      className="grid grid-cols-[1fr_120px_160px_100px] gap-4 px-2 py-3 -mx-2 rounded-[var(--radius-sm)] hover:bg-[var(--color-row-hover)] transition-colors"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[14px] text-bone">{dealLabel(deal)}</span>
                        <span className="text-[11px] text-bone-mute">
                          {deal.name ? `${deal.company} · ` : ""}Created {formatDate(deal.createdAt)}
                        </span>
                      </div>
                      <Badge tone="bone">{stageLabels[deal.stage]}</Badge>
                      <span className="mono text-[13px] text-track-gold tabular-nums">{formatCAD(deal.valueEstimate).replace("CA$", "$")}</span>
                      <span className="mono text-[12px] text-bone-dim tabular-nums text-right">{formatDate(deal.closeTargetDate)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardBody className="flex flex-col gap-3">
              <h2 className="title-md text-bone">Reach</h2>
              <div className="flex flex-col gap-3 text-[13px]">
                <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-bone-dim hover:text-bone">
                  <Mail size={12} strokeWidth={1.5} />
                  {contact.email}
                </a>
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-bone-dim hover:text-bone">
                    <Phone size={12} strokeWidth={1.5} />
                    {contact.phone}
                  </a>
                )}
                {contact.mobilePhone && (
                  <a href={`tel:${contact.mobilePhone}`} className="flex items-center gap-2 text-bone-dim hover:text-bone">
                    <Smartphone size={12} strokeWidth={1.5} />
                    {contact.mobilePhone}
                  </a>
                )}
                {contact.domain && (
                  <a
                    href={`https://${contact.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-bone-dim hover:text-bone"
                  >
                    <Globe size={12} strokeWidth={1.5} />
                    {contact.domain}
                  </a>
                )}
                {contact.linkedinUrl && (
                  <a
                    href={contact.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-bone-dim hover:text-bone"
                  >
                    <Linkedin size={12} strokeWidth={1.5} />
                    LinkedIn
                  </a>
                )}
                {(contact.location || contact.timezone) && (
                  <div className="flex items-center gap-2 text-bone-dim">
                    <MapPin size={12} strokeWidth={1.5} />
                    {[contact.location, contact.timezone].filter(Boolean).join(" · ")}
                  </div>
                )}
                {(contact.relationshipStrength || contact.preferredChannel) && (
                  <div className="flex items-center gap-2 pt-1">
                    {contact.relationshipStrength && strengthBadge[contact.relationshipStrength] && (
                      <Badge tone={strengthBadge[contact.relationshipStrength].tone}>
                        {strengthBadge[contact.relationshipStrength].label}
                      </Badge>
                    )}
                    {contact.preferredChannel && (
                      <Badge tone="neutral">
                        Prefers {preferredChannelLabels[contact.preferredChannel] ?? contact.preferredChannel}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-col gap-3">
              <h2 className="title-md text-bone">Partner lead</h2>
              <div className="flex items-center gap-3">
                <Avatar initials={partner.initials} size="lg" gold />
                <div>
                  <div className="text-[14px] text-bone">{partner.name}</div>
                  <div className="text-[11px] text-bone-mute">{partner.role}</div>
                </div>
              </div>
            </CardBody>
          </Card>

          {contact.importantDates.length > 0 && (
            <Card>
              <CardBody className="flex flex-col gap-3">
                <h2 className="title-md text-bone">Important dates</h2>
                <div className="flex flex-col gap-2">
                  {contact.importantDates.map((d) => (
                    <div key={d} className="flex items-start gap-2 text-[13px] text-bone-dim">
                      <Calendar size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-bone-mute" />
                      <span>{d}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {contact.hobbies.length > 0 && (
            <Card>
              <CardBody className="flex flex-col gap-3">
                <h2 className="title-md text-bone">Hobbies &amp; interests</h2>
                <div className="flex flex-wrap gap-2">
                  {contact.hobbies.map((h) => (
                    <Badge key={h} tone="neutral">{h}</Badge>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {contact.networkAffiliations.length > 0 && (
            <Card>
              <CardBody className="flex flex-col gap-3">
                <h2 className="title-md text-bone">Network affiliations</h2>
                <div className="flex flex-col gap-2">
                  {contact.networkAffiliations.map((n) => (
                    <div key={n} className="flex items-start gap-2 text-[13px] text-bone-dim">
                      <Users size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-bone-mute" />
                      <span>{n}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          {contact.notes && (
            <Card>
              <CardBody className="flex flex-col gap-3">
                <h2 className="title-md text-bone">Notes</h2>
                <p className="text-[13px] text-bone-dim leading-relaxed">{contact.notes}</p>
              </CardBody>
            </Card>
          )}

          {stale && (
            <Card className="border border-flag-red/40 bg-flag-red/5">
              <CardBody className="flex flex-col gap-2">
                <h2 className="title-md text-bone">Status</h2>
                <div className="flex items-center gap-2">
                  <Badge tone="red">{daysSince(contact.lastTouchAt)}d cold</Badge>
                </div>
                <p className="text-[12px] text-bone-dim">Re-engage before lead goes fully dormant.</p>
              </CardBody>
            </Card>
          )}
        </div>
        </div>
      </div>
    </>
  );
}
