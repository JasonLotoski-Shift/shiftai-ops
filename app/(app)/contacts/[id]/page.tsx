import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { Card, CardBody, Label, Badge } from "@/components/ui";
import { ContactActions } from "@/components/contact-actions";
import { prisma } from "@/lib/prisma";
import { formatCAD, formatDate, daysSince } from "@/lib/format";
import { interactionLabels, industryLabels, stageLabels } from "@/lib/data/seed";
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
} from "lucide-react";

// Keys use Prisma enum identifiers (underscored), matching @map'd DB values.
const interactionIcon: Record<string, typeof Mail> = {
  call: PhoneIcon,
  meeting: Users,
  email_sent: Send,
  email_received: Inbox,
  other: Calendar,
};

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      partnerLead: true,
      deals: { orderBy: { closeTargetDate: "asc" } },
      interactions: { orderBy: { date: "desc" } },
    },
  });
  if (!contact) notFound();

  const partner = contact.partnerLead;
  const contactDeals = contact.deals;
  const log = contact.interactions;
  const stale = daysSince(contact.lastTouchAt) > 30;
  const enriched = Boolean(contact.persona || contact.keyFacts.length || contact.background);

  return (
    <>
      <Header
        eyebrow={contact.title}
        title={contact.name}
        actions={<ContactActions contact={contact} partnerName={partner?.name} />}
      />

      <div className="px-8 py-6 flex items-center justify-between">
        <Link href="/contacts" className="label hover:text-bone flex items-center gap-2">
          <ArrowLeft size={12} strokeWidth={1.5} />
          Back to contacts
        </Link>
        {contact.enrichedAt && (
          <span className="label">— Record enriched {formatDate(contact.enrichedAt)}</span>
        )}
      </div>

      <div className="px-8 pb-12 grid grid-cols-3 gap-6">
        <div className="col-span-2 flex flex-col gap-6">
          <Card>
            <div className="p-6 grid grid-cols-3 gap-6">
              <div className="flex flex-col gap-2">
                <Label>— Company</Label>
                <div className="flex items-center gap-2 text-[16px] text-bone">
                  <Building2 size={14} strokeWidth={1.5} className="text-bone-mute" />
                  {contact.company}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>— Industry</Label>
                <Badge tone="bone">{industryLabels[contact.industry]}</Badge>
              </div>
              <div className="flex flex-col gap-2">
                <Label>— Source</Label>
                <span className="text-[13px] text-bone-dim">{contact.source}</span>
              </div>
            </div>
          </Card>

          {!enriched && (
            <Card className="border-track-gold/40 bg-track-gold-dim/5">
              <CardBody className="flex items-start gap-4">
                <Sparkles size={16} strokeWidth={1.5} className="text-track-gold shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <Label gold>— Thin record</Label>
                  <p className="text-[13px] text-bone leading-relaxed">
                    No persona or key facts yet. Use <span className="text-track-gold">Web search</span> or{" "}
                    <span className="text-track-gold">AI enrich</span> (top right) to build this record from public
                    sources and the communications log. Additions merge — nothing here gets overwritten.
                  </p>
                </div>
              </CardBody>
            </Card>
          )}

          {(contact.persona || contact.communicationStyle) && (
            <div className="grid grid-cols-2 gap-6">
              {contact.persona && (
                <Card>
                  <div className="px-5 py-4 border-b border-graphite"><Label>— Persona</Label></div>
                  <CardBody><p className="text-[13px] text-bone leading-relaxed">{contact.persona}</p></CardBody>
                </Card>
              )}
              {contact.communicationStyle && (
                <Card>
                  <div className="px-5 py-4 border-b border-graphite"><Label>— Communication style</Label></div>
                  <CardBody><p className="text-[13px] text-bone leading-relaxed">{contact.communicationStyle}</p></CardBody>
                </Card>
              )}
            </div>
          )}

          {contact.keyFacts.length > 0 && (
            <Card>
              <div className="px-5 py-4 border-b border-graphite"><Label>— Key facts</Label></div>
              <div className="flex flex-col">
                {contact.keyFacts.map((f, i) => (
                  <div key={i} className={`flex items-start gap-3 px-5 py-3 ${i < contact.keyFacts.length - 1 ? "border-b border-graphite" : ""}`}>
                    <span className="mono text-[11px] text-track-gold mt-0.5 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <p className="text-[13px] text-bone leading-snug">{f}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {contact.background && (
            <Card>
              <div className="px-5 py-4 border-b border-graphite"><Label>— Background</Label></div>
              <CardBody><p className="text-[14px] text-bone-dim leading-relaxed">{contact.background}</p></CardBody>
            </Card>
          )}

          <Card>
            <div className="px-5 py-4 border-b border-graphite flex justify-between items-center">
              <Label>— Communications log</Label>
              <span className="label">{log.length} logged</span>
            </div>
            {log.length === 0 ? (
              <CardBody><span className="label">— No interactions logged yet</span></CardBody>
            ) : (
              <div className="flex flex-col">
                {log.map((it, i) => {
                  const Ic = interactionIcon[it.type] ?? Calendar;
                  const agent = it.loggedBy.startsWith("AGENT");
                  return (
                    <div key={it.id} className={`flex items-start gap-4 px-5 py-4 ${i < log.length - 1 ? "border-b border-graphite" : ""}`}>
                      <div className="w-7 h-7 border border-graphite-2 flex items-center justify-center shrink-0 text-bone-mute rounded-[var(--radius-sm)]">
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
          </Card>

          <Card>
            <div className="px-5 py-4 border-b border-graphite flex justify-between items-center">
              <Label>— Deals ({contactDeals.length})</Label>
            </div>
            {contactDeals.length === 0 ? (
              <CardBody><span className="label">— No open deals</span></CardBody>
            ) : (
              contactDeals.map((deal, i) => (
                <Link
                  href={`/pipeline/${deal.id}`}
                  key={deal.id}
                  className={`grid grid-cols-[1fr_120px_160px_100px] gap-4 px-5 py-4 ${i < contactDeals.length - 1 ? "border-b border-graphite" : ""} hover:bg-graphite/40 transition-colors`}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[14px] text-bone">{deal.company}</span>
                    <span className="text-[11px] text-bone-mute">Created {formatDate(deal.createdAt)}</span>
                  </div>
                  <Badge tone="bone">{stageLabels[deal.stage]}</Badge>
                  <span className="mono text-[13px] text-track-gold tabular-nums">{formatCAD(deal.valueEstimate).replace("CA$", "$")}</span>
                  <span className="mono text-[12px] text-bone-dim tabular-nums text-right">{formatDate(deal.closeTargetDate)}</span>
                </Link>
              ))
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <div className="px-5 py-4 border-b border-graphite"><Label>— Reach</Label></div>
            <CardBody className="flex flex-col gap-3 text-[13px]">
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
            </CardBody>
          </Card>

          <Card>
            <div className="px-5 py-4 border-b border-graphite"><Label>— Partner lead</Label></div>
            <CardBody className="flex items-center gap-3">
              <div className="w-9 h-9 bg-track-gold-dim/30 border border-track-gold/40 flex items-center justify-center mono text-[13px] text-track-gold rounded-[var(--radius-pill)]">
                {partner.initials}
              </div>
              <div>
                <div className="text-[14px] text-bone">{partner.name}</div>
                <div className="text-[11px] text-bone-mute">{partner.role}</div>
              </div>
            </CardBody>
          </Card>

          {contact.hobbies.length > 0 && (
            <Card>
              <div className="px-5 py-4 border-b border-graphite"><Label>— Hobbies &amp; interests</Label></div>
              <CardBody className="flex flex-wrap gap-2">
                {contact.hobbies.map((h) => (
                  <Badge key={h} tone="neutral">{h}</Badge>
                ))}
              </CardBody>
            </Card>
          )}

          {contact.networkAffiliations.length > 0 && (
            <Card>
              <div className="px-5 py-4 border-b border-graphite"><Label>— Network affiliations</Label></div>
              <CardBody className="flex flex-col gap-2">
                {contact.networkAffiliations.map((n) => (
                  <div key={n} className="flex items-start gap-2 text-[13px] text-bone-dim">
                    <Users size={12} strokeWidth={1.5} className="mt-0.5 shrink-0 text-bone-mute" />
                    <span>{n}</span>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          {contact.notes && (
            <Card>
              <div className="px-5 py-4 border-b border-graphite"><Label>— Notes</Label></div>
              <CardBody><p className="text-[13px] text-bone-dim leading-relaxed">{contact.notes}</p></CardBody>
            </Card>
          )}

          {stale && (
            <Card className="border-flag-red/40 bg-flag-red/5">
              <CardBody className="flex flex-col gap-2">
                <Label>— Status</Label>
                <div className="flex items-center gap-2">
                  <Badge tone="red">{daysSince(contact.lastTouchAt)}d cold</Badge>
                </div>
                <p className="text-[12px] text-bone-dim">Re-engage before lead goes fully dormant.</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
