import assert from "node:assert/strict";
import {
  parseEnrichmentJSON,
  applyLeadEnrichment,
  parsePositioning,
  type LeadProfileSnapshot,
} from "@/lib/lead-profile";

// A baseline empty snapshot — every field present, scalars empty, lists empty.
function snapshot(over: Partial<LeadProfileSnapshot> = {}): LeadProfileSnapshot {
  return {
    website: null,
    linkedinUrl: null,
    instagramUrl: null,
    companySize: null,
    headquarters: null,
    founded: null,
    ownership: null,
    description: null,
    subIndustry: null,
    revenueEstimate: null,
    employeeEstimate: null,
    currentSystems: [],
    painPoints: [],
    companyKeyFacts: [],
    ...over,
  };
}

// ── parseEnrichmentJSON ──────────────────────────────────────────────────────

// Valid JSON → additions/conflicts arrays.
{
  const raw = JSON.stringify({
    additions: [
      { field: "description", value: "A roofing contractor." },
      { field: "companyKeyFacts", value: "Founded 1998" },
    ],
    conflicts: [
      { field: "website", existing: "a.com", proposed: "b.com", note: "differs" },
    ],
  });
  const { additions, conflicts } = parseEnrichmentJSON(raw);
  assert.equal(additions.length, 2);
  assert.equal(additions[0].field, "description");
  assert.equal(additions[0].value, "A roofing contractor.");
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].field, "website");
}

// Fenced JSON unwraps.
{
  const raw = "```json\n" + JSON.stringify({ additions: [{ field: "founded", value: "1998" }] }) + "\n```";
  const { additions } = parseEnrichmentJSON(raw);
  assert.equal(additions.length, 1);
  assert.equal(additions[0].field, "founded");
}

// Junk → empty arrays (no throw).
{
  const { additions, conflicts } = parseEnrichmentJSON("not json at all");
  assert.deepEqual(additions, []);
  assert.deepEqual(conflicts, []);
}

// Non-string / empty values filtered; unknown fields filtered.
{
  const raw = JSON.stringify({
    additions: [
      { field: "description", value: "" }, // empty → dropped
      { field: "founded", value: 1998 }, // non-string → dropped
      { field: "bogus", value: "x" }, // unknown field → dropped
      { field: "ownership", value: "  Private  " }, // trimmed, kept
    ],
  });
  const { additions } = parseEnrichmentJSON(raw);
  assert.equal(additions.length, 1);
  assert.equal(additions[0].field, "ownership");
  assert.equal(additions[0].value, "Private");
}

// ── applyLeadEnrichment ──────────────────────────────────────────────────────

// Fills an empty scalar; skips a non-empty one (never overwrite).
{
  const lead = snapshot({ ownership: "Private" });
  const { data, applied, skipped } = applyLeadEnrichment(lead, [
    { field: "description", value: "Roofing contractor." },
    { field: "ownership", value: "Public" },
  ]);
  assert.equal(data.description, "Roofing contractor.");
  assert.equal("ownership" in data, false);
  assert.equal(applied, 1);
  assert.equal(skipped, 1);
}

// employeeCount addition maps onto employeeEstimate; revenueEstimate onto itself.
// Coerces "220 (source: x)" → 220 and "$45M (source: y)" → 45000000.
{
  const lead = snapshot();
  const { data, applied } = applyLeadEnrichment(lead, [
    { field: "employeeCount", value: "220 (source: x)" },
    { field: "revenueEstimate", value: "$45M (source: y)" },
  ]);
  assert.equal(data.employeeEstimate, 220);
  assert.equal("employeeCount" in data, false);
  assert.equal(data.revenueEstimate, 45000000);
  assert.equal(applied, 2);
}

// Unparseable int values are skipped; already-set int not overwritten.
{
  const lead = snapshot({ revenueEstimate: 100 });
  const { data, applied, skipped } = applyLeadEnrichment(lead, [
    { field: "employeeCount", value: "between 10 and 20" }, // multi-number → null
    { field: "revenueEstimate", value: "$50M" }, // target already set → skip
  ]);
  assert.equal("employeeEstimate" in data, false);
  assert.equal("revenueEstimate" in data, false);
  assert.equal(applied, 0);
  assert.equal(skipped, 2);
}

// List additions append with case-insensitive dedupe; merged array emitted only when it grew.
{
  const lead = snapshot({ currentSystems: ["Salesforce"] });
  const { data, applied, skipped } = applyLeadEnrichment(lead, [
    { field: "currentSystems", value: "salesforce" }, // dup (case) → skip
    { field: "currentSystems", value: "QuickBooks" }, // new → append
    { field: "painPoints", value: "Manual dispatch" }, // new list grows
  ]);
  assert.deepEqual(data.currentSystems, ["Salesforce", "QuickBooks"]);
  assert.deepEqual(data.painPoints, ["Manual dispatch"]);
  assert.equal("companyKeyFacts" in data, false); // unchanged list not emitted
  assert.equal(applied, 2);
  assert.equal(skipped, 1);
}

// URL fields strip the trailing (source: ...) tag.
{
  const lead = snapshot();
  const { data } = applyLeadEnrichment(lead, [
    { field: "website", value: "https://acme.com (source: homepage)" },
    { field: "linkedinUrl", value: "https://linkedin.com/company/acme (source: li)" },
    { field: "instagramUrl", value: "https://instagram.com/acme (source: ig)" },
  ]);
  assert.equal(data.website, "https://acme.com");
  assert.equal(data.linkedinUrl, "https://linkedin.com/company/acme");
  assert.equal(data.instagramUrl, "https://instagram.com/acme");
}

// Unknown field names are skipped; data contains ONLY changed keys, never domain.
{
  const lead = snapshot();
  const { data, applied } = applyLeadEnrichment(lead, [
    { field: "website", value: "https://acme.com" },
    { field: "totallyUnknown", value: "whatever" },
  ]);
  assert.equal(data.website, "https://acme.com");
  assert.equal("domain" in data, false); // never emit domain
  assert.deepEqual(Object.keys(data), ["website"]); // only changed keys
  assert.equal(applied, 1);
}

// ── parsePositioning ─────────────────────────────────────────────────────────

// Valid JSON → trimmed strings; likelyNeeds capped at 5 non-empty strings.
{
  const raw = JSON.stringify({
    fitSummary: "  They fit because X.  ",
    likelyNeeds: ["A", "", "B", "C", "D", "E", "F"],
    salesAngle: "  Open with the dispatch pain.  ",
  });
  const p = parsePositioning(raw);
  assert.notEqual(p, null);
  assert.equal(p!.fitSummary, "They fit because X.");
  assert.deepEqual(p!.likelyNeeds, ["A", "B", "C", "D", "E"]);
  assert.equal(p!.salesAngle, "Open with the dispatch pain.");
}

// Fenced JSON unwraps.
{
  const raw =
    "```json\n" +
    JSON.stringify({ fitSummary: "Fit.", likelyNeeds: [], salesAngle: "" }) +
    "\n```";
  const p = parsePositioning(raw);
  assert.notEqual(p, null);
  assert.equal(p!.fitSummary, "Fit.");
}

// Junk → null.
assert.equal(parsePositioning("not json"), null);

// All-empty → null.
assert.equal(
  parsePositioning(JSON.stringify({ fitSummary: "", likelyNeeds: [], salesAngle: "" })),
  null,
);

console.log("lead-profile.test.ts: all assertions passed");
