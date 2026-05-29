// prisma/wipe.ts — B6 data wipe. Clears the firm's BUSINESS data to a clean
// slate for go-live, while PRESERVING Partner rows so Google SSO keeps working.
//
// ⚠️  There is ONE shared Supabase DB — local and Vercel point at the same
//     project. Running this wipes PRODUCTION. It is irreversible.
//
// SAFE BY DEFAULT: with no/incorrect confirmation it does a DRY RUN — prints
// the row counts it WOULD delete and the exact command to run for real, then
// exits without touching anything.
//
// To actually wipe, pass the database host as the typed confirmation (the dry
// run prints it). Tying the confirmation to the live host prevents wiping the
// wrong database by muscle memory:
//
//     npx tsx prisma/wipe.ts --confirm <db-host>
//   e.g.
//     npx tsx prisma/wipe.ts --confirm db.tqtpglnbotaguiirodou.supabase.co
//
// Preserved: Partner (SSO). Recreated automatically on next use: the firm
// channels (#general/#pipeline/#deals) via ensureFirmChannels() on the next
// /messages load. Everything else is removed.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Aborting.");
  process.exit(1);
}

function hostFromUrl(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return "(unparseable)";
  }
}

const DB_HOST = hostFromUrl(url);

// Parse `--confirm <value>` or `--confirm=<value>`.
function parseConfirm(argv: string[]): string | null {
  const i = argv.indexOf("--confirm");
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith("--confirm="));
  if (eq) return eq.slice("--confirm=".length);
  return null;
}

const confirm = parseConfirm(process.argv.slice(2));
const args = process.argv.slice(2);
// Opt-in: also delete Partner rows (full clean slate). Default preserves them
// so SSO sessions stay linked. Real partners auto-provision on next sign-in,
// so wiping them is safe — but sign out/in afterward to refresh your session.
const includePartners = args.includes("--include-partners");
// Opt-in: reconcile the Partner table to exactly the real firm roster below
// (upsert these 4 by email, delete any other partner). This is the go-live
// command: wipe business data + set the real team in one shot.
const setTeam = args.includes("--set-team");

// The real firm roster (confirmed by Jason 2026-05-29). Three Managing
// Partners + Jack Nyrose, Jr Consultant. Edit here if the team changes.
const TEAM = [
  { email: "jason@shiftai.partners", name: "Jason Lotoski", initials: "JL", role: "Managing Partner" },
  { email: "jay@shiftai.partners", name: "Jay Giraud", initials: "JG", role: "Managing Partner" },
  { email: "steve@shiftai.partners", name: "Steve Devries", initials: "SD", role: "Managing Partner" },
  { email: "jack@shiftai.partners", name: "Jack Nyrose", initials: "JN", role: "Jr Consultant" },
];

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Count what's there now. Order = the order we'd delete in (child → parent),
  // so the printout doubles as the delete plan. Partner is intentionally absent.
  const counts: { table: string; n: number }[] = [
    { table: "Message", n: await prisma.message.count() },
    { table: "ChannelMember", n: await prisma.channelMember.count() },
    { table: "Channel", n: await prisma.channel.count() },
    { table: "Interaction", n: await prisma.interaction.count() },
    { table: "Artifact", n: await prisma.artifact.count() },
    { table: "Invoice", n: await prisma.invoice.count() },
    { table: "Milestone", n: await prisma.milestone.count() },
    { table: "Task", n: await prisma.task.count() },
    { table: "Project", n: await prisma.project.count() },
    { table: "Deal", n: await prisma.deal.count() },
    { table: "Client", n: await prisma.client.count() },
    { table: "Contact", n: await prisma.contact.count() },
    { table: "AgentPlan", n: await prisma.agentPlan.count() },
    { table: "Activity", n: await prisma.activity.count() },
    { table: "TeamUpdate", n: await prisma.teamUpdate.count() },
    { table: "NewsItem", n: await prisma.newsItem.count() },
    { table: "IngestProposal", n: await prisma.ingestProposal.count() },
    { table: "AuditLog", n: await prisma.auditLog.count() },
  ];
  const partnerCount = await prisma.partner.count();
  const total = counts.reduce((s, c) => s + c.n, 0);

  console.log(`\nDatabase host: ${DB_HOST}`);
  console.log(`Rows that would be DELETED${includePartners ? " (INCLUDING Partner)" : " (Partner preserved)"}:`);
  for (const c of counts) console.log(`  ${c.table.padEnd(16)} ${c.n}`);
  if (includePartners) console.log(`  ${"Partner".padEnd(16)} ${partnerCount}`);
  console.log(`  ${"—".repeat(16)}`);
  console.log(`  ${"TOTAL".padEnd(16)} ${total + (includePartners ? partnerCount : 0)}`);
  if (setTeam) {
    console.log(`\nPartner roster will be RECONCILED to the real firm (${TEAM.length}):`);
    for (const t of TEAM) console.log(`  ${t.name.padEnd(16)} ${t.email.padEnd(28)} ${t.role}`);
    console.log(`  (any partner not in this list is deleted; the ${partnerCount} current rows are all fictional seed)`);
  } else if (includePartners) {
    console.log(`\n⚠️  Partner rows WILL be deleted (${partnerCount}). Real partners re-provision on next Google sign-in; sign out/in afterward.`);
  } else {
    console.log(`\nPreserved: Partner (${partnerCount} rows) — SSO keeps working.`);
  }

  const confirmed = confirm === DB_HOST;
  if (!confirmed) {
    console.log("\n── DRY RUN — nothing was deleted. ──");
    if (confirm) console.log(`Confirmation "${confirm}" did not match the DB host.`);
    console.log("To wipe for real, run:");
    console.log(`  npx tsx prisma/wipe.ts --confirm ${DB_HOST}\n`);
    return;
  }

  console.log("\nConfirmation matches. Wiping in one transaction…");
  const ops = [
    prisma.message.deleteMany(),
    prisma.channelMember.deleteMany(),
    prisma.channel.deleteMany(),
    prisma.interaction.deleteMany(),
    prisma.artifact.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.milestone.deleteMany(),
    prisma.task.deleteMany(),
    prisma.project.deleteMany(),
    prisma.deal.deleteMany(),
    prisma.client.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.agentPlan.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.teamUpdate.deleteMany(),
    prisma.newsItem.deleteMany(),
    prisma.ingestProposal.deleteMany(),
    prisma.auditLog.deleteMany(),
  ];
  // Partner last (everything referencing it is already gone above).
  // --include-partners wipes them blank; --set-team reconciles instead (below).
  if (includePartners && !setTeam) ops.push(prisma.partner.deleteMany());
  await prisma.$transaction(ops);

  const wiped = total + (includePartners && !setTeam ? partnerCount : 0);
  console.log(`✓ Wiped ${wiped} business rows.`);

  if (setTeam) {
    // Upsert the real roster by email, then delete any partner not in it.
    for (const t of TEAM) {
      await prisma.partner.upsert({
        where: { email: t.email },
        update: { name: t.name, initials: t.initials, role: t.role },
        create: { email: t.email, name: t.name, initials: t.initials, role: t.role },
      });
    }
    const removed = await prisma.partner.deleteMany({
      where: { email: { notIn: TEAM.map((t) => t.email) } },
    });
    console.log(`✓ Roster set to the ${TEAM.length} real partners; removed ${removed.count} fictional partner row(s).`);
  } else if (includePartners) {
    console.log("Partner rows ALSO deleted — sign out/in to re-provision.");
  } else {
    console.log(`${partnerCount} Partner rows preserved.`);
  }
  console.log("Firm channels (#general/#pipeline/#deals) regenerate on the next /messages load.\n");
}

main()
  .catch((e) => {
    console.error("Wipe failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
