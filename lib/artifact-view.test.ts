// lib/artifact-view.test.ts — run: npx tsx lib/artifact-view.test.ts
import assert from "node:assert/strict";
import { isRenderableHtml, SANDBOX_CSP, contentDispositionAttachment } from "@/lib/artifact-view";

// renders inline
assert.equal(isRenderableHtml("text/html"), true, "text/html renders");
assert.equal(isRenderableHtml("text/html; charset=utf-8"), true, "charset suffix renders");
assert.equal(isRenderableHtml("  TEXT/HTML "), true, "case + whitespace tolerant");

// falls through to the Drive redirect
assert.equal(isRenderableHtml("application/pdf"), false, "pdf redirects");
assert.equal(isRenderableHtml("application/vnd.google-apps.document"), false, "google doc redirects");
assert.equal(isRenderableHtml("image/png"), false, "image redirects");
assert.equal(isRenderableHtml(null), false, "null redirects");
assert.equal(isRenderableHtml(undefined), false, "undefined redirects");
assert.equal(isRenderableHtml(""), false, "empty redirects");

// CSP: sandboxed, interactive, but NOT same-origin (the whole security point)
assert.ok(SANDBOX_CSP.startsWith("sandbox"), "is a sandbox CSP");
assert.ok(SANDBOX_CSP.includes("allow-scripts"), "allows scripts so the doc is interactive");
assert.ok(!SANDBOX_CSP.includes("allow-same-origin"), "must NOT allow same-origin");

// contentDispositionAttachment: normal name kept, with an RFC5987 utf8 form
{
  const h = contentDispositionAttachment("report.html");
  assert.ok(h.startsWith('attachment; filename="report.html"'), "normal name kept");
  assert.ok(h.includes("filename*=UTF-8''report.html"), "utf8 form present");
}
// header-injection guard: no CR/LF survives
{
  const h = contentDispositionAttachment("evil\r\nSet-Cookie: x=1.html");
  assert.ok(!/[\r\n]/.test(h), "no CR/LF survives in the header");
}
// quotes / backslashes neutralized in the ascii filename
{
  const h = contentDispositionAttachment('a"b\\c.pdf');
  assert.ok(h.includes('filename="a_b_c.pdf"'), "quotes and backslashes neutralized");
}
// non-ascii: ascii fallback sanitized, utf8 form carries the real bytes
{
  const h = contentDispositionAttachment("Café.md");
  assert.ok(h.includes('filename="Caf_.md"'), "non-ascii replaced in ascii fallback");
  assert.ok(h.includes("filename*=UTF-8''Caf%C3%A9.md"), "utf8 form percent-encodes");
}
// blank / null → "document"
assert.equal(
  contentDispositionAttachment("   "),
  `attachment; filename="document"; filename*=UTF-8''document`,
  "blank → document",
);
assert.equal(
  contentDispositionAttachment(null),
  `attachment; filename="document"; filename*=UTF-8''document`,
  "null → document",
);

console.log("artifact-view.test.ts OK");
