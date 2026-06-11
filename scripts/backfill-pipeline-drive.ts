// One-off backfill: give every existing pipeline deal its proper Drive home.
//
// Before 2026-06-11, deal-stage docs (discovery prep, proposals, discovery
// reports, prototypes, questionnaire responses) uploaded loose into the Shared
// Drive ROOT. This script retrofits the new per-deal folder model onto the
// existing data:
//
//   1. Every OPEN deal gets its 00-Pipeline/<company> folder (created if
//      missing, stamped onto Deal.driveFolderId/driveFolderUrl).
//   2. Every file referenced by the deal's Artifacts + DiscoverySurveys that
//      still sits in the Shared Drive root MOVES into that folder. (A Drive
//      move keeps the file id, so every saved driveUrl link keeps working.)
//   3. SIGNED deals: same, then the working folder moves into the client's
//      folder as "00-Pipeline-files" (matching what Convert now does live),
//      and every deal Artifact gets clientId stamped so the docs show on the
//      client's Deliverables tab too.
//
// Run:  npx tsx scripts/backfill-pipeline-drive.ts --dry   (plan only)
//       npx tsx scripts/backfill-pipeline-drive.ts          (do it)

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { drive, folderIdFromUrl } from "../lib/drive";
import { ensureDealDriveFolder, moveDealFolderToClient } from "../lib/deal-drive";
import { writeAudit, agentActor } from "../lib/audit";

const DRY = process.argv.includes("--dry");

// Pull the file id out of any Drive webViewLink shape we produce.
function fileIdFromUrl(url: string): string | null {
  const m =
    url.match(/\/(?:file|document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/) ??
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

async function main() {
  const ROOT = process.env.DRIVE_SHARED_DRIVE_FOLDER_ID;
  if (!ROOT) throw new Error("DRIVE_SHARED_DRIVE_FOLDER_ID not set in .env");
  console.log(`${DRY ? "[DRY RUN] " : ""}Shared Drive root: ${ROOT}\n`);

  const deals = await prisma.deal.findMany({
    include: {
      artifacts: { select: { id: true, title: true, driveUrl: true, clientId: true } },
      discoverySurveys: { select: { id: true, title: true, driveUrl: true, clientId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  let foldersCreated = 0;
  let filesMoved = 0;
  let artifactsRepointed = 0;

  for (const deal of deals) {
    const docs: { label: string; url: string | null }[] = [
      ...deal.artifacts.map((a) => ({ label: a.title, url: a.driveUrl as string | null })),
      ...deal.discoverySurveys.map((s) => ({ label: `${s.title} (responses)`, url: s.driveUrl })),
    ].filter((d) => !!d.url);

    const signed = deal.stage === "signed";

    // Signed deals only matter if they have files to rehome; open deals all
    // get their folder so the 00-Pipeline structure is complete.
    if (signed && docs.length === 0) continue;

    // Find the client for a signed deal: the repointed artifacts/surveys carry
    // clientId; fall back to a company-name match.
    let clientFolderId: string | null = null;
    let clientLabel = "";
    if (signed) {
      const clientId =
        deal.artifacts.find((a) => a.clientId)?.clientId ??
        deal.discoverySurveys.find((s) => s.clientId)?.clientId ??
        null;
      const client = clientId
        ? await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, company: true, driveFolderUrl: true } })
        : await prisma.client.findFirst({ where: { company: deal.company }, select: { id: true, company: true, driveFolderUrl: true } });
      if (client?.driveFolderUrl) {
        try {
          clientFolderId = folderIdFromUrl(client.driveFolderUrl);
          clientLabel = client.company;
        } catch {
          clientFolderId = null;
        }
      }
      // Stamp clientId on any of this deal's artifacts that don't have it yet,
      // so they show on the client's Deliverables tab.
      if (client) {
        const toRepoint = deal.artifacts.filter((a) => !a.clientId).length;
        if (toRepoint > 0 && !DRY) {
          await prisma.artifact.updateMany({
            where: { dealId: deal.id, clientId: null },
            data: { clientId: client.id },
          });
        }
        artifactsRepointed += toRepoint;
        if (toRepoint > 0) console.log(`  ↳ ${deal.company}: ${DRY ? "would repoint" : "repointed"} ${toRepoint} artifact(s) to client ${client.company}`);
      }
    }

    console.log(`${deal.company} [${deal.stage}] — ${docs.length} doc(s)${deal.driveFolderId ? " (folder exists)" : ""}`);

    // Ensure the deal's working folder.
    let folderId = deal.driveFolderId;
    if (!folderId) {
      if (DRY) {
        console.log(`  ↳ would create 00-Pipeline/${deal.company}`);
        foldersCreated++;
      } else {
        const f = await ensureDealDriveFolder(deal.id);
        folderId = f.folderId;
        foldersCreated++;
        console.log(`  ↳ created 00-Pipeline/${deal.company} (${folderId})`);
      }
    }

    // Move root-parented files into the deal folder.
    for (const doc of docs) {
      const fileId = fileIdFromUrl(doc.url!);
      if (!fileId) {
        console.log(`  ↳ SKIP (no file id in url): ${doc.label}`);
        continue;
      }
      try {
        const meta = await drive.files.get({
          fileId,
          fields: "id, name, parents",
          supportsAllDrives: true,
        });
        const parents = meta.data.parents ?? [];
        if (!parents.includes(ROOT)) {
          console.log(`  ↳ in place already: ${doc.label}`);
          continue;
        }
        if (DRY || !folderId) {
          console.log(`  ↳ would move: ${doc.label}`);
          filesMoved++;
          continue;
        }
        await drive.files.update({
          fileId,
          addParents: folderId,
          removeParents: ROOT,
          supportsAllDrives: true,
        });
        filesMoved++;
        console.log(`  ↳ moved: ${doc.label}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`  ↳ SKIP (${msg.slice(0, 80)}): ${doc.label}`);
      }
    }

    // Signed + client folder known → tuck the working folder into the client
    // folder as 00-Pipeline-files (same as Convert does now).
    if (signed && clientFolderId && folderId) {
      if (DRY) {
        console.log(`  ↳ would move folder into ${clientLabel}'s client folder as 00-Pipeline-files`);
      } else {
        try {
          await moveDealFolderToClient({ dealFolderId: folderId, clientFolderId });
          console.log(`  ↳ folder moved into ${clientLabel}'s client folder as 00-Pipeline-files`);
        } catch (e) {
          console.log(`  ↳ folder move FAILED (left under 00-Pipeline): ${e instanceof Error ? e.message.slice(0, 80) : e}`);
        }
      }
    }

    if (!DRY) {
      await writeAudit(prisma, {
        actor: agentActor("drive-backfill"),
        action: "backfill.deal.driveFolder",
        targetType: "Deal",
        targetId: deal.id,
        changes: { company: deal.company, stage: deal.stage, docs: docs.length },
      });
    }
  }

  console.log(`\n${DRY ? "[DRY RUN] Plan" : "Done"}: ${foldersCreated} folder(s) ${DRY ? "to create" : "created"}, ${filesMoved} file(s) ${DRY ? "to move" : "moved"}, ${artifactsRepointed} artifact(s) ${DRY ? "to repoint" : "repointed"} to clients.`);
}

main()
  .catch((err) => {
    console.error("\nBackfill FAILED:");
    console.error(err?.errors ?? err?.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
