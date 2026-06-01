// Seed the Supabase database with the same fixtures the prototype UI uses.
// Idempotent: clears all rows in reverse dep order, then re-inserts.
// IDs from lib/data/seed.ts are preserved so cross-refs stay stable.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

import {
  activities,
  artifacts,
  clients,
  consultants,
  contacts,
  deals,
  interactions,
  invoices,
  milestones,
  news,
  partners,
  projects,
  tasks,
  teamUpdates,
} from "../lib/data/seed";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Seed strings use hyphenated enum values ("on-track", "email-sent").
// Schema enums use underscored identifiers with @map → Prisma client expects the underscored form.
const toEnum = (s: string) => s.replace(/-/g, "_");

async function main() {
  console.log("Clearing existing data…");
  await prisma.auditLog.deleteMany();
  await prisma.artifact.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.task.deleteMany();
  await prisma.teamUpdate.deleteMany();
  await prisma.newsItem.deleteMany();
  await prisma.interaction.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.consultant.deleteMany();
  await prisma.partner.deleteMany();

  console.log(`Inserting ${partners.length} partners…`);
  for (const p of partners) {
    await prisma.partner.create({
      data: { id: p.id, name: p.name, initials: p.initials, role: p.role, email: p.email },
    });
  }

  console.log(`Inserting ${consultants.length} consultants…`);
  for (const co of consultants) {
    await prisma.consultant.create({
      data: {
        id: co.id,
        name: co.name,
        role: co.role,
        defaultPayRateCents: co.defaultPayRateCents,
        email: co.email,
        partnerId: co.partnerId,
      },
    });
  }

  console.log(`Inserting ${contacts.length} contacts…`);
  for (const c of contacts) {
    await prisma.contact.create({
      data: {
        id: c.id,
        name: c.name,
        title: c.title,
        company: c.company,
        email: c.email,
        phone: c.phone,
        industry: c.industry as any,
        source: c.source,
        notes: c.notes,
        lastTouchAt: new Date(c.lastTouchAt),
        partnerLeadId: c.partnerLeadId,
        persona: c.persona,
        communicationStyle: c.communicationStyle,
        keyFacts: c.keyFacts ?? [],
        background: c.background,
        hobbies: c.hobbies ?? [],
        networkAffiliations: c.networkAffiliations ?? [],
        enrichedAt: c.enrichedAt ? new Date(c.enrichedAt) : null,
      },
    });
  }

  console.log(`Inserting ${interactions.length} interactions…`);
  for (const i of interactions) {
    await prisma.interaction.create({
      data: {
        id: i.id,
        type: toEnum(i.type) as any,
        date: new Date(i.date),
        summary: i.summary,
        loggedBy: i.loggedBy,
        channel: i.channel,
        contactId: i.contactId,
      },
    });
  }

  console.log(`Inserting ${deals.length} deals…`);
  for (const d of deals) {
    await prisma.deal.create({
      data: {
        id: d.id,
        company: d.company,
        stage: d.stage as any,
        valueEstimate: d.valueEstimate,
        industry: d.industry as any,
        closeTargetDate: new Date(d.closeTargetDate),
        lastTouchAt: new Date(d.lastTouchAt),
        stageEnteredAt: new Date(d.stageEnteredAt),
        notes: d.notes,
        contactId: d.contactId,
        partnerLeadId: d.partnerLeadId,
        createdAt: new Date(d.createdAt),
      },
    });
  }

  console.log(`Inserting ${clients.length} clients…`);
  for (const cl of clients) {
    await prisma.client.create({
      data: {
        id: cl.id,
        company: cl.company,
        industry: cl.industry as any,
        revenue: cl.revenue,
        driveFolderUrl: cl.driveFolderUrl,
        workspacePath: cl.workspacePath,
        contractValue: cl.contractValue,
        contractSignedAt: new Date(cl.contractSignedAt),
        status: toEnum(cl.status) as any,
        notes: cl.notes,
        partnerLeadId: cl.partnerLeadId,
        primaryContactId: cl.primaryContactId,
        companySize: cl.companySize,
        headquarters: cl.headquarters,
        founded: cl.founded,
        website: cl.website,
        ownership: cl.ownership,
        description: cl.description,
        brandColors: cl.brandColors ?? [],
        logoMonogram: cl.logoMonogram,
        companyKeyFacts: cl.companyKeyFacts ?? [],
        enrichedAt: cl.enrichedAt ? new Date(cl.enrichedAt) : null,
        paymentTerms: cl.paymentTerms,
        contractEndAt: cl.contractEndAt ? new Date(cl.contractEndAt) : null,
        billingContactId: cl.billingContactId,
      },
    });
  }

  console.log(`Inserting ${projects.length} projects…`);
  for (const pr of projects) {
    await prisma.project.create({
      data: {
        id: pr.id,
        name: pr.name,
        phase: pr.phase as any,
        status: toEnum(pr.status) as any,
        startDate: new Date(pr.startDate),
        targetEndDate: new Date(pr.targetEndDate),
        budgetFee: pr.budgetFee,
        description: pr.description,
        clientId: pr.clientId,
        partnerLeadId: pr.partnerLeadId,
        consultants: { connect: pr.consultantIds.map((id) => ({ id })) },
      },
    });
  }

  console.log(`Inserting ${milestones.length} milestones…`);
  for (const m of milestones) {
    await prisma.milestone.create({
      data: {
        id: m.id,
        title: m.title,
        dueDate: m.dueDate ? new Date(m.dueDate) : null,
        status: toEnum(m.status) as any,
        projectId: m.projectId,
      },
    });
  }


  console.log(`Inserting ${invoices.length} invoices…`);
  for (const inv of invoices) {
    await prisma.invoice.create({
      data: {
        id: inv.id,
        number: inv.number,
        amount: inv.amount,
        issuedAt: new Date(inv.issuedAt),
        dueAt: new Date(inv.dueAt),
        paidAt: inv.paidAt ? new Date(inv.paidAt) : null,
        status: inv.status as any,
        clientId: inv.clientId,
        projectId: inv.projectId,
      },
    });
  }

  console.log(`Inserting ${activities.length} activities…`);
  for (const a of activities) {
    await prisma.activity.create({
      data: {
        id: a.id,
        ts: new Date(a.ts),
        actor: a.actor,
        type: a.type as any,
        target: a.target,
        detail: a.detail,
      },
    });
  }

  console.log(`Inserting ${tasks.length} tasks…`);
  for (const t of tasks) {
    await prisma.task.create({
      data: {
        id: t.id,
        title: t.title,
        due: new Date(t.due),
        priority: t.priority as any,
        relatedTo: t.relatedTo,
        done: t.done,
        ownerId: t.ownerId,
        clientId: t.clientId,
        projectId: t.projectId,
      },
    });
  }

  console.log(`Inserting ${artifacts.length} artifacts…`);
  for (const ar of artifacts) {
    await prisma.artifact.create({
      data: {
        id: ar.id,
        type: ar.type as any,
        title: ar.title,
        driveUrl: ar.driveUrl,
        fileName: ar.fileName,
        createdBy: ar.createdBy,
        generatedFromSkill: ar.generatedFromSkill,
        reviewStatus: ar.reviewStatus as any,
        clientId: ar.clientId,
        projectId: ar.projectId,
        dealId: ar.dealId,
        createdAt: new Date(ar.createdAt),
      },
    });
  }

  console.log(`Inserting ${teamUpdates.length} team updates…`);
  for (const u of teamUpdates) {
    await prisma.teamUpdate.create({
      data: {
        id: u.id,
        ts: new Date(u.ts),
        author: u.author,
        cadence: u.cadence as any,
        body: u.body,
      },
    });
  }

  console.log(`Inserting ${news.length} news items…`);
  for (const n of news) {
    await prisma.newsItem.create({
      data: {
        id: n.id,
        ts: new Date(n.ts),
        source: n.source,
        industry: n.industry as any,
        headline: n.headline,
        why: n.why,
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
