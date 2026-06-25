import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { Card, CardBody, Label, Badge, Avatar } from "@/components/ui";
import { InvoiceStatusActions } from "@/components/invoice-status-actions";
import { InvoicePdfButton } from "@/components/invoice-pdf-button";
import { InvoiceDraftEdit } from "@/components/billing/invoice-draft-edit";
import { ChangeThread } from "@/components/billing/change-thread";
import { prisma } from "@/lib/prisma";
import { getInvoiceThread } from "@/lib/audit-read";
import { formatCAD, formatDate, daysSince } from "@/lib/format";
import { ArrowLeft, FileOutput } from "lucide-react";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Invoice + its change-log thread are independent reads — one parallel wave.
  // Pass `id` (the route param) to the thread loader, NOT invoice.id, so it
  // doesn't have to wait on the invoice query.
  const [invoice, thread] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id },
      include: {
        client: true,
        project: {
          include: {
            partnerLead: true,
          },
        },
      },
    }),
    getInvoiceThread(id),
  ]);
  if (!invoice) notFound();

  const client = invoice.client;
  const project = invoice.project;
  const partner = project.partnerLead;
  const overdueDays = invoice.status === "overdue" ? daysSince(invoice.dueAt) : 0;

  return (
    <>
      <Header
        eyebrow={`${client.company} · ${invoice.number}`}
        title={formatCAD(invoice.amount).replace("CA$", "$")}
        actions={
          <>
            <InvoicePdfButton invoiceId={invoice.id} />
            <InvoiceStatusActions invoiceId={invoice.id} status={invoice.status} />
          </>
        }
      />

      <div className="px-8 py-8 flex flex-col gap-8">
        <Link href="/invoices" className="label hover:text-bone flex items-center gap-2">
          <ArrowLeft size={12} strokeWidth={1.5} />
          Back to billing
        </Link>

        {invoice.status === "draft" && (
          <div className="flex items-start gap-3 px-4 py-3 border border-track-gold/30 bg-track-gold-dim/10 rounded-[var(--radius-lg)]">
            <FileOutput size={15} strokeWidth={1.5} className="text-track-gold mt-0.5 shrink-0" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] text-bone">This invoice is a draft.</span>
              <span className="text-[12px] text-bone-dim leading-relaxed">
                Use <span className="text-bone">Generate invoice</span> above to produce the
                formatted document and send it, or <span className="text-bone">Send as-is</span> to
                mark it sent without generating a file.
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 flex flex-col gap-6">
          <Card>
            <div className="p-6 grid grid-cols-4 gap-6">
              <div className="flex flex-col gap-2">
                <Label>Number</Label>
                <span className="mono text-[20px] text-bone">{invoice.number}</span>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Status</Label>
                <Badge tone={invoice.status === "paid" ? "steel" : invoice.status === "overdue" ? "red" : invoice.status === "sent" ? "gold" : "neutral"}>
                  {invoice.status}
                </Badge>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Issued</Label>
                <span className="mono text-[14px] text-bone tabular-nums">
                  {formatDate(invoice.issuedAt)}
                </span>
                {invoice.sentAt && (
                  <span className="label text-[10px] text-bone-mute">
                    Sent {formatDate(invoice.sentAt)}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label>{invoice.status === "paid" ? "Paid" : "Due"}</Label>
                <span className={`mono text-[14px] tabular-nums ${overdueDays > 0 ? "text-flag-red" : "text-bone"}`}>
                  {formatDate(invoice.paidAt ?? invoice.dueAt)}
                  {overdueDays > 0 && (
                    <span className="block label text-[10px] text-flag-red mt-1">{overdueDays}d overdue</span>
                  )}
                </span>
              </div>
            </div>
            {invoice.status === "draft" && (
              <div className="px-6 pb-5">
                <InvoiceDraftEdit invoiceId={invoice.id} amount={invoice.amount} dueAt={invoice.dueAt.toISOString()} />
              </div>
            )}
          </Card>

          <Card>
            <div className="px-5 pt-5 pb-3">
              <h2 className="title-md">Line items</h2>
            </div>
            <div className="grid grid-cols-[1fr_140px] gap-4 px-5 py-2">
              <span className="text-[11px] text-bone-dim">Description</span>
              <span className="text-[11px] text-bone-dim text-right">Amount</span>
            </div>
            <div className="grid grid-cols-[1fr_140px] gap-4 px-5 py-4">
              <div className="flex flex-col gap-0.5">
                <div className="text-[14px] text-bone">{project.name.split("·")[1]?.trim() ?? project.name}</div>
                <div className="text-[11px] text-bone-mute">Professional services</div>
              </div>
              <span className="mono text-[14px] text-bone tabular-nums text-right self-center">
                {formatCAD(invoice.amount).replace("CA$", "$")}
              </span>
            </div>

            <div className="px-5 pt-4 pb-5 flex flex-col gap-2 items-end">
              <div className="grid grid-cols-2 gap-12">
                <span className="label">Total</span>
                <span className="mono text-[22px] tabular-nums text-track-gold text-right">
                  {formatCAD(invoice.amount).replace("CA$", "$")}
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <CardBody className="flex flex-col gap-2">
              <h2 className="title-md">Memo</h2>
              <p className="text-[13px] text-bone-dim leading-relaxed">
                Professional services rendered for {project.name}. Payment due {formatDate(invoice.dueAt)} via wire
                transfer or e-transfer to <code className="mono text-bone">jason@shiftai.partners</code>.
              </p>
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <div className="px-5 pt-5 pb-2">
              <h2 className="title-md">Bill to</h2>
            </div>
            <CardBody className="flex flex-col gap-3 pt-0">
              <Link href={`/clients/${client.id}`} className="text-[14px] text-bone hover:text-track-gold">
                {client.company}
              </Link>
              <div className="text-[12px] text-bone-mute leading-relaxed">
                {client.notes?.split(".")[0]}.
              </div>
            </CardBody>
          </Card>

          <Card>
            <div className="px-5 pt-5 pb-2">
              <h2 className="title-md">Project</h2>
            </div>
            <CardBody className="flex flex-col gap-3 pt-0">
              <Link href={`/projects/${project.id}`} className="text-[14px] text-bone hover:text-track-gold">
                {project.name.split("·")[1]?.trim() ?? project.name}
              </Link>
              <div className="flex items-center gap-2 text-[12px]">
                <Badge tone={project.phase === "build" ? "gold" : project.phase === "run" ? "steel" : "bone"}>
                  {project.phase}
                </Badge>
              </div>
            </CardBody>
          </Card>

          {partner && (
            <Card>
              <div className="px-5 pt-5 pb-2">
                <h2 className="title-md">Issued by</h2>
              </div>
              <CardBody className="flex items-center gap-3 pt-0">
                <Avatar initials={partner.initials} size="lg" gold />
                <div>
                  <div className="text-[14px] text-bone">{partner.name}</div>
                  <div className="text-[11px] text-bone-mute">{partner.role}</div>
                </div>
              </CardBody>
            </Card>
          )}
          </div>
        </div>

        <ChangeThread entries={thread} title="Invoice change log" />
      </div>
    </>
  );
}
