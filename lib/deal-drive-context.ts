// Deal Drive corpus — read EVERY file in a deal's working folder (call
// transcripts, the discovery report, survey responses, call notes, screenshots)
// into one capped text block + a set of vision images, so the prototype brief can
// ground itself in what the client actually said. This is the deep-context step
// the prototype workflow was missing — before, it saw only Prisma + 4 screenshots.
//
// Server-only (Prisma + Drive). NOT "use server" — callers own auth. Mirrors
// lib/deal-context.ts as a plain helper module.

import { prisma } from "@/lib/prisma";
import { listFolderFiles, exportGoogleDoc, downloadDriveFile, fileIdFromUrl } from "@/lib/drive";
import { ensureDealDriveFolder } from "@/lib/deal-drive";
import { extractFile, isExtractable, imageMediaType } from "@/lib/ingest/extract-file";
import { loadScreenshotImages } from "@/lib/ingest-uploads";

// Drive files we generated ourselves — never feed our own output back in as if it
// were a client file (a self-feedback loop that degrades every later prototype).
const GENERATED_SKILLS = ["html-prototype", "proposal-deck", "prototype-brief"];

const GOOGLE_NATIVE = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
]);
const GOOGLE_FOLDER = "application/vnd.google-apps.folder";

export type DealDriveManifestEntry = {
  fileName: string;
  kind: string; // "google-doc" | "doc" | "image" | "skipped" | "error"
  chars: number;
  note?: string;
};

export type DealDriveContext = {
  text: string; // per-file-headed corpus, capped
  images: { base64: string; mediaType: string }[];
  manifest: DealDriveManifestEntry[];
  truncated: boolean;
};

type LoadOpts = {
  maxFiles?: number;
  perFileChars?: number;
  totalChars?: number;
  maxImages?: number;
};

/**
 * Read the deal's Drive folder into a text corpus + vision images. Best-effort:
 * a failed file becomes a manifest note, never a throw. If the folder can't be
 * opened at all, returns an empty corpus + one note so the caller can still run
 * on Prisma context alone (graceful degradation — the firm's "never silent" rule
 * is satisfied by the manifest).
 */
export async function loadDealDriveFiles(
  dealId: string,
  opts: LoadOpts = {},
): Promise<DealDriveContext> {
  const maxFiles = opts.maxFiles ?? 20;
  const perFileChars = opts.perFileChars ?? 12_000;
  const totalChars = opts.totalChars ?? 120_000;
  const maxImages = opts.maxImages ?? 4;

  const manifest: DealDriveManifestEntry[] = [];

  // Screenshots come through the existing vision path (handles the 5MB cap +
  // base64 + recency for us). Best-effort.
  let images: { base64: string; mediaType: string }[] = [];
  try {
    images = await loadScreenshotImages({ dealId }, maxImages);
  } catch {
    /* no screenshots / drive hiccup — fine */
  }

  let folderId: string;
  try {
    ({ folderId } = await ensureDealDriveFolder(dealId));
  } catch {
    manifest.push({ fileName: "(deal folder)", kind: "error", chars: 0, note: "Couldn't open the deal's Drive folder — ran on record data only." });
    return { text: "", images, manifest, truncated: false };
  }

  let files;
  try {
    files = await listFolderFiles(folderId);
  } catch {
    manifest.push({ fileName: "(deal folder)", kind: "error", chars: 0, note: "Couldn't list the deal's Drive files — ran on record data only." });
    return { text: "", images, manifest, truncated: false };
  }

  // Exclude Drive files that ARE our own generated artifacts (by file ID).
  const generated = await prisma.artifact.findMany({
    where: { dealId, generatedFromSkill: { in: GENERATED_SKILLS } },
    select: { driveUrl: true },
  });
  const excludeIds = new Set(
    generated.map((a) => fileIdFromUrl(a.driveUrl)).filter((id): id is string => !!id),
  );

  const blocks: string[] = [];
  let used = 0;
  let truncated = false;
  let count = 0;

  for (const f of files) {
    if (count >= maxFiles) {
      truncated = true;
      break;
    }
    if (f.mimeType === GOOGLE_FOLDER) continue; // don't recurse into subfolders
    if (excludeIds.has(f.id)) continue; // our own output
    if (imageMediaType(f.name)) {
      // Images are handled by the vision path above; just note them.
      manifest.push({ fileName: f.name, kind: "image", chars: 0 });
      continue;
    }
    if (used >= totalChars) {
      truncated = true;
      break;
    }

    // Native Google file → export; extractable binary → download + extract.
    let raw = "";
    let kind = "doc";
    try {
      if (GOOGLE_NATIVE.has(f.mimeType)) {
        kind = "google-doc";
        raw = (await exportGoogleDoc(f.id, f.mimeType)).text;
      } else if (isExtractable(f.name)) {
        const bytes = await downloadDriveFile(f.id);
        const ex = await extractFile({ bytes, fileName: f.name, mimeType: f.mimeType });
        raw = ex.text;
        if (ex.note && !raw) {
          manifest.push({ fileName: f.name, kind: "skipped", chars: 0, note: ex.note });
          continue;
        }
      } else {
        manifest.push({ fileName: f.name, kind: "skipped", chars: 0, note: "Unsupported file type." });
        continue;
      }
    } catch (e) {
      manifest.push({ fileName: f.name, kind: "error", chars: 0, note: e instanceof Error ? e.message : "read failed" });
      continue;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      manifest.push({ fileName: f.name, kind: "skipped", chars: 0, note: "Empty after extraction." });
      continue;
    }

    const remaining = totalChars - used;
    const slice = trimmed.length > Math.min(perFileChars, remaining)
      ? trimmed.slice(0, Math.min(perFileChars, remaining))
      : trimmed;
    if (slice.length < trimmed.length) truncated = true;

    blocks.push(`### ${f.name} (${kind})\n${slice}`);
    used += slice.length;
    count += 1;
    manifest.push({ fileName: f.name, kind, chars: slice.length });
  }

  return { text: blocks.join("\n\n"), images, manifest, truncated };
}
