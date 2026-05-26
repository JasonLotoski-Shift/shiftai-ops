"use client";

import { notFound, useRouter } from "next/navigation";
import Link from "next/link";
import { useState, use } from "react";
import { Header } from "@/components/header";
import { Card, CardBody, Label, Badge, Button, Hairline } from "@/components/ui";
import {
  dealById,
  contactById,
  partnerById,
  stageLabels,
  industryLabels,
  formatCAD,
  formatDate,
  daysSince,
} from "@/lib/data/seed";
import { ArrowLeft, Mail, Phone, FileText, Calendar, Sparkles, Check } from "lucide-react";
import { ConvertDealModal } from "@/components/convert-deal-modal";

export default function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const deal = dealById(id);
  if (!deal) notFound();

  const contact = contactById(deal.contactId);
  const partner = partnerById(deal.partnerLeadId);
  const stale = daysSince(deal.lastTouchAt) > 30;
  const [convertOpen, setConvertOpen] = useState(false);

  return (
    <>
      <Header
        eyebrow={`Pipeline · ${stageLabels[deal.stage]}`}
        title={deal.company}
        actions={
          <>
            <Button variant="ghost" size="sm">
              <Mail size={13} strokeWidth={1.5} />
              Log email
            </Button>
            <Button variant="secondary" size="sm">
              <Calendar size={13} strokeWidth={1.5} />
              Log call
            </Button>
            <Button variant="primary" size="sm" onClick={() => setConvertOpen(true)}>
              Convert → Client
            </Button>
          </>
        }
      />

      <div className="px-8 py-6 flex gap-8">
        <Link href="/pipeline" className="label hover:text-bone flex items-center gap-2">
          <ArrowLeft size={12} strokeWidth={1.5} />
          Back to board
        </Link>
      </div>

      <div className="px-8 pb-12 grid grid-cols-3 gap-6">
        {/* Left: deal summary + activity */}
        <div className="col-span-2 flex flex-col gap-6">
          <Card>
            <div className="p-6 grid grid-cols-4 gap-6">
              <div className="flex flex-col gap-2">
                <Label>— Value</Label>
                <span className="mono text-[24px] text-track-gold tabular-nums">
                  {formatCAD(deal.valueEstimate).replace("CA$", "$")}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <Label>— Stage</Label>
                <span className="text-[18px] text-bone">{stageLabels[deal.stage]}</span>
              </div>
              <div className="flex flex-col gap-2">
                <Label>— Industry</Label>
                <span className="text-[18px] text-bone">{industryLabels[deal.industry]}</span>
              </div>
              <div className="flex flex-col gap-2">
                <Label>— Close target</Label>
                <span className="mono text-[14px] text-bone tabular-nums">
                  {formatDate(deal.closeTargetDate)}
                </span>
              </div>
            </div>
            {deal.notes && (
              <>
                <Hairline />
                <div className="px-6 py-5">
                  <Label>— Latest note</Label>
                  <p className="text-[14px] text-bone-dim mt-2 leading-relaxed">{deal.notes}</p>
                </div>
              </>
            )}
            {stale && (
              <>
                <Hairline />
                <div className="px-6 py-4 bg-flag-red/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge tone="red">{daysSince(deal.lastTouchAt)}d cold</Badge>
                    <span className="text-[13px] text-bone-dim">
                      Last touch {formatDate(deal.lastTouchAt)} — flagged stale.
                    </span>
                  </div>
                  <button className="label-gold hover:underline">Re-engage →</button>
                </div>
              </>
            )}
          </Card>

          {/* AI assist card */}
          <Card className="border-track-gold/40 bg-track-gold-dim/5">
            <CardBody className="flex items-start gap-4">
              <div className="w-8 h-8 bg-track-gold-dim/30 border border-track-gold/40 flex items-center justify-center shrink-0">
                <Sparkles size={14} strokeWidth={1.5} className="text-track-gold" />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <Label gold>— Agent · Claude proposal</Label>
                <p className="text-[13px] text-bone leading-relaxed">
                  Based on the {industryLabels[deal.industry]} vertical and the {stageLabels[deal.stage].toLowerCase()} stage,
                  Claude can draft a tailored SOW pulling from the IP library — methodology, prior case study
                  shape, and similar engagements. Partner reviews before send.
                </p>
                <div className="flex gap-3 pt-1">
                  <button className="label-gold hover:underline">Draft SOW →</button>
                  <button className="label hover:text-bone">Draft re-engagement email</button>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Activity log (stub) */}
          <Card>
            <div className="px-5 py-4 border-b border-graphite">
              <Label>— Activity</Label>
            </div>
            <div className="flex flex-col">
              {[
                { ts: deal.lastTouchAt, actor: partner?.name ?? "—", detail: "Touch logged — most recent activity" },
                { ts: deal.createdAt, actor: partner?.name ?? "—", detail: `Deal created · stage: ${stageLabels[deal.stage]}` },
              ].map((a, i, arr) => (
                <div
                  key={i}
                  className={`px-5 py-3 ${i < arr.length - 1 ? "border-b border-graphite" : ""}`}
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <Label>{a.actor}</Label>
                    <span className="label">{formatDate(a.ts)}</span>
                  </div>
                  <p className="text-[13px] text-bone-dim">{a.detail}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right: contact + partner */}
        <div className="flex flex-col gap-6">
          <Card>
            <div className="px-5 py-4 border-b border-graphite flex items-center justify-between">
              <Label>— Primary contact</Label>
              <Link href={`/contacts/${contact?.id}`} className="label-gold hover:underline">
                View →
              </Link>
            </div>
            <CardBody className="flex flex-col gap-3">
              <div>
                <div className="text-[16px] text-bone">{contact?.name}</div>
                <div className="text-[12px] text-bone-mute">{contact?.title} · {contact?.company}</div>
              </div>
              <Hairline />
              <div className="flex flex-col gap-2 text-[12px]">
                <a href={`mailto:${contact?.email}`} className="flex items-center gap-2 text-bone-dim hover:text-bone">
                  <Mail size={12} strokeWidth={1.5} />
                  {contact?.email}
                </a>
                {contact?.phone && (
                  <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-bone-dim hover:text-bone">
                    <Phone size={12} strokeWidth={1.5} />
                    {contact.phone}
                  </a>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <div className="px-5 py-4 border-b border-graphite">
              <Label>— Partner lead</Label>
            </div>
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
            <div className="px-5 py-4 border-b border-graphite">
              <Label>— Source</Label>
            </div>
            <CardBody>
              <p className="text-[13px] text-bone-dim">{contact?.source ?? "—"}</p>
            </CardBody>
          </Card>
        </div>
      </div>

      <ConvertDealModal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        deal={deal}
      />
    </>
  );
}
