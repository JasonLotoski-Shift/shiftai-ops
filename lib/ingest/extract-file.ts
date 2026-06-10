// Server-side file → text extraction for ingest. Turns an uploaded or email-
// attached PDF / Word / Excel / HTML / Markdown / text file into plain text that
// feeds the EXISTING extraction pipeline — the text becomes the Claude intake and
// the stored transcript, exactly like pasted notes. Parse-to-text (uniform): no
// Claude document blocks, so lib/ai.ts and prompt caching are untouched.
//
// Server-only — imports parsing libs (mammoth / xlsx / unpdf). NEVER import this
// from a client component; the browser passes file bytes (base64) to a server
// action, which calls extractFile() here.

import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { extractText, getDocumentProxy } from "unpdf";

export type ExtractedFile = {
  fileName: string;
  text: string;
  truncated?: boolean;
  // A human note when a file was skipped or unreadable — surfaced to the partner
  // so a dropped attachment is never silent (firm's "nothing happens silently" rule).
  note?: string;
};

// Per-file extracted-text cap. A huge spreadsheet/PDF can explode to enormous
// text; cap it and flag truncated so the partner knows the tail was dropped.
const MAX_CHARS = 50_000;

// Plain-text family — decoded as UTF-8 directly.
const TEXT_EXTS = new Set([
  "txt", "text", "md", "markdown", "csv", "tsv", "log", "vtt", "srt", "rtf", "json",
]);
// Everything extractFile() can turn into text. Callers pre-filter on this so they
// don't fetch/parse a binary they can't read (e.g. a Gmail .doc / image).
const SUPPORTED_EXTS = new Set([...TEXT_EXTS, "docx", "xlsx", "xls", "html", "htm", "pdf"]);

function ext(fileName: string): string {
  const m = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

/** True if extractFile() can read this file type — pre-filter before fetching bytes. */
export function isExtractable(fileName: string): boolean {
  return SUPPORTED_EXTS.has(ext(fileName));
}

function cap(raw: string): { text: string; truncated: boolean } {
  const text = raw.trim();
  if (text.length <= MAX_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_CHARS), truncated: true };
}

// Zero-dep HTML → text (mirrors the strip already used in lib/gmail.ts for email
// HTML; avoids pulling a parser dep for the occasional .html upload).
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract plain text from a file's bytes. Dispatches on extension first (MIME is
 * unreliable — Gmail / browsers often send application/octet-stream). Never
 * throws: a parse failure or unsupported type returns empty text + a `note`.
 */
export async function extractFile(input: {
  bytes: Buffer;
  fileName: string;
  mimeType?: string;
}): Promise<ExtractedFile> {
  const { bytes, fileName } = input;
  const e = ext(fileName);

  try {
    if (TEXT_EXTS.has(e)) {
      const { text, truncated } = cap(bytes.toString("utf8"));
      return { fileName, text, truncated };
    }

    if (e === "docx") {
      const { value } = await mammoth.extractRawText({ buffer: bytes });
      const { text, truncated } = cap(value);
      if (!text) return { fileName, text: "", note: `No text found in "${fileName}".` };
      return { fileName, text, truncated };
    }

    if (e === "xlsx" || e === "xls") {
      const wb = XLSX.read(bytes, { type: "buffer" });
      const parts: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]).trim();
        if (csv) parts.push(`# Sheet: ${sheetName}\n${csv}`);
      }
      const { text, truncated } = cap(parts.join("\n\n"));
      if (!text) return { fileName, text: "", note: `No data found in "${fileName}".` };
      return { fileName, text, truncated };
    }

    if (e === "html" || e === "htm") {
      const { text, truncated } = cap(stripHtml(bytes.toString("utf8")));
      return { fileName, text, truncated };
    }

    if (e === "pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text: pages } = await extractText(pdf, { mergePages: true });
      const merged = Array.isArray(pages) ? pages.join("\n") : pages;
      const { text, truncated } = cap(merged ?? "");
      if (!text) {
        return {
          fileName,
          text: "",
          note: `No extractable text in "${fileName}" — it may be a scanned or image-only PDF.`,
        };
      }
      return { fileName, text, truncated };
    }

    // .doc (legacy binary), .pages, .key, images, etc. — no text path.
    return { fileName, text: "", note: `Unsupported file type — skipped: ${fileName}` };
  } catch (err) {
    return {
      fileName,
      text: "",
      note: `Couldn't read "${fileName}": ${err instanceof Error ? err.message : "parse error"}`,
    };
  }
}
