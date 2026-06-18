// Pure routing logic for the in-tab document viewer. Kept separate from the
// route handler so it can be unit-tested without pulling in auth / Prisma /
// googleapis. The route (app/api/artifacts/[id]/view/route.ts) is thin glue
// around these.

// Content-Security-Policy used when we re-serve a document's HTML from our own
// origin. `sandbox` with NO `allow-same-origin` forces an OPAQUE origin, so a
// self-contained (or untrusted) HTML deliverable can't read the app's cookies
// or storage; the allow-* flags let the document's own buttons, links,
// downloads and modals behave exactly as in a standalone tab. Identical to the
// prototype view route's CSP — keep them in sync.
export const SANDBOX_CSP =
  "sandbox allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads allow-top-navigation-by-user-activation";

// True only for HTML we should render inline. Drive reports self-contained HTML
// (uploaded via uploadFile with mimeType "text/html") as "text/html"; native
// Google Docs report "application/vnd.google-apps.document" and everything else
// (PDF, slides, sheets, images) reports its own type — all of which fall through
// to the Drive redirect. Tolerates a "; charset=..." suffix and odd casing.
export function isRenderableHtml(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return mimeType.split(";")[0].trim().toLowerCase() === "text/html";
}

// Builds a safe `Content-Disposition: attachment` header for a download. The
// filename comes from Drive (attacker-influenceable), so we strip control chars
// and CR/LF (header-injection guard), quote a sanitized ASCII fallback, and add
// an RFC 5987 UTF-8 form so non-ASCII names survive in modern browsers. Blank or
// nullish → "document".
export function contentDispositionAttachment(name: string | null | undefined): string {
  const clean = (name ?? "").replace(/[\x00-\x1f\x7f]/g, "").trim() || "document";
  const ascii = clean.replace(/[\\"]/g, "_").replace(/[^\x20-\x7e]/g, "_");
  const utf8 = encodeURIComponent(clean);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
