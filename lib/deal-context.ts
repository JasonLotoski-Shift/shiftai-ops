// Shared deal context — the "who/where this opportunity is" block fed to every
// deal-scoped skill (proposal, discovery prep, survey, book-meeting, and the
// proposal engine). One loader so each surface reads the same picture.
//
// Server-only (touches Prisma). Plain module — NOT a "use server" file — so it
// can export a non-action helper used by several server-action modules.

import { prisma } from "@/lib/prisma";
import { formatCAD, formatDate } from "@/lib/format";

export async function buildDealContext(dealId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      contact: {
        select: {
          id: true,
          name: true,
          title: true,
          company: true,
          email: true,
          source: true,
          interactions: {
            orderBy: { date: "desc" },
            take: 6,
            select: { type: true, date: true, summary: true },
          },
        },
      },
      partnerLead: { select: { name: true } },
    },
  });
  if (!deal) throw new Error("Deal not found");

  const contextLines: string[] = [
    "## Opportunity",
    `Company: ${deal.company}`,
    `Industry: ${deal.industry}`,
    `Deal stage: ${deal.stage}`,
    `Estimated value: ${formatCAD(deal.valueEstimate)}`,
    `Target close: ${formatDate(deal.closeTargetDate)}`,
  ];
  if (deal.notes) contextLines.push(`Deal notes: ${deal.notes}`);
  contextLines.push(
    "",
    "## Primary contact",
    `${deal.contact.name} — ${deal.contact.title}, ${deal.contact.company}`,
  );
  if (deal.contact.source) contextLines.push(`Lead source: ${deal.contact.source}`);
  if (deal.contact.interactions.length) {
    contextLines.push("", "## Recent interactions (newest first)");
    for (const i of deal.contact.interactions) {
      contextLines.push(`- ${formatDate(i.date)} · ${i.type.replace("_", "-")} — ${i.summary}`);
    }
  } else {
    contextLines.push("", "## Recent interactions", "None logged yet.");
  }
  return { deal, context: contextLines.join("\n") };
}
