// lib/artifact-view.test.ts — run: npx tsx lib/artifact-view.test.ts
import assert from "node:assert/strict";
import { isRenderableHtml, SANDBOX_CSP } from "@/lib/artifact-view";

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

console.log("artifact-view.test.ts OK");
