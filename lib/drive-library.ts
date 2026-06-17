// Prototype Library — read past prototype projects out of a Drive "library" folder
// so the build agent can reuse proven structure, copy, and UI ideas. REUSES the
// service-account Drive client + helpers in lib/drive.ts (no new auth wiring).
//
// Drive layout the library expects:
//   <Library folder>/
//     <Project A>/
//       overview.md      ← what the project is, who it was for, the shape of it
//       why.md           ← why it worked / what to lift (the reuse notes)
//       ui/*.png         ← screenshots of the finished prototype
//     <Project B>/ ...
//
// Two reads, both LAZY — list the project folders cheaply, then load ONE project's
// metadata (text + screenshots) only when the agent asks for it. Never scan the
// whole library or pull every project's screenshots up front.

import {
  drive,
  listFolderFiles,
  downloadDriveFile,
  exportGoogleDoc,
  type DriveFileMeta,
} from "./drive";

const FOLDER_MIME = "application/vnd.google-apps.folder";

// Cap screenshots returned per project so a project with a large ui/ folder can't
// blow past the model's vision payload limit. Newest-first; the rest are dropped.
const MAX_SCREENSHOTS = 6;

export type LibraryProject = {
  id: string; // Drive folder ID — pass to loadProjectMetadata / get_project
  name: string;
};

export type LibraryScreenshot = {
  name: string;
  base64: string;
  mediaType: string; // e.g. "image/png"
};

export type ProjectMetadata = {
  overview: string;
  whyNotes: string;
  screenshots: LibraryScreenshot[];
};

/**
 * List the project folders directly under the library folder. Cheap — names + IDs
 * only, no file contents. The agent calls this first to see what's available.
 */
export async function listProjectFolders(libFolderId: string): Promise<LibraryProject[]> {
  const children = await listFolderFiles(libFolderId);
  return children
    .filter((f) => f.mimeType === FOLDER_MIME)
    .map((f) => ({ id: f.id, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Load ONE project's reuse material: overview.md + why.md text and the ui/*.png
 * screenshots as base64. Lazy by design — only the requested project is fetched.
 * Missing files degrade gracefully (empty string / empty array) rather than throw,
 * so a partially-filled library folder still returns something useful.
 */
export async function loadProjectMetadata(folderId: string): Promise<ProjectMetadata> {
  const children = await listFolderFiles(folderId);

  const overview = await readMarkdown(children, "overview.md");
  const whyNotes = await readMarkdown(children, "why.md");

  const uiFolder = children.find(
    (f) => f.mimeType === FOLDER_MIME && f.name.toLowerCase() === "ui",
  );
  const screenshots = uiFolder ? await loadScreenshots(uiFolder.id) : [];

  return { overview, whyNotes, screenshots };
}

// Read a markdown doc out of a folder's listing by (case-insensitive) name. The
// file is normally a raw text/markdown upload (downloadDriveFile / alt=media),
// but tolerate it having been imported as a native Google Doc (files.export).
async function readMarkdown(children: DriveFileMeta[], fileName: string): Promise<string> {
  const file = children.find((f) => f.name.toLowerCase() === fileName.toLowerCase());
  if (!file) return "";
  try {
    if (file.mimeType.startsWith("application/vnd.google-apps")) {
      const { text } = await exportGoogleDoc(file.id, file.mimeType);
      return text.trim();
    }
    const bytes = await downloadDriveFile(file.id);
    return bytes.toString("utf8").trim();
  } catch (err) {
    console.warn(`[drive-library] failed to read ${fileName} (${file.id}):`, err);
    return "";
  }
}

// Download the PNG/JPEG screenshots in a project's ui/ folder as base64. Newest
// first, capped at MAX_SCREENSHOTS to stay under the vision payload limit.
async function loadScreenshots(uiFolderId: string): Promise<LibraryScreenshot[]> {
  const files = (await listFolderFiles(uiFolderId))
    .filter((f) => f.mimeType.startsWith("image/"))
    .slice(0, MAX_SCREENSHOTS);

  const out: LibraryScreenshot[] = [];
  for (const f of files) {
    try {
      const bytes = await downloadDriveFile(f.id);
      out.push({ name: f.name, base64: bytes.toString("base64"), mediaType: f.mimeType });
    } catch (err) {
      console.warn(`[drive-library] failed to download screenshot ${f.name} (${f.id}):`, err);
    }
  }
  return out;
}

// Re-export the shared Drive singleton so callers that only need the library
// don't reach past this module into lib/drive.
export { drive };
