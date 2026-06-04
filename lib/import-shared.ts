// Import Contacts — PURE helpers shared by the client upload component and the
// server import action. No prisma, no env, no server-only imports: this file is
// safe to import from a "use client" component. The server owns the
// authoritative normalization (domain, completeness, dedupeKey) but it reuses
// these same functions so client preview and server write never disagree.

import type { ImportColumnMapping } from "@/lib/types";

// A row after the column mapping is applied — the wire shape sent to the server
// import action. `raw` preserves the original CSV row so a remap can re-derive.
export type CleanedImportRow = {
  name: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  companyDomain?: string;
  raw: Record<string, string>;
};

// The fields the mapping UI lets a partner assign, in display order.
export const MAPPABLE_FIELDS: {
  key: keyof ImportColumnMapping;
  label: string;
}[] = [
  { key: "name", label: "Full name" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "title", label: "Title / position" },
  { key: "company", label: "Company" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "linkedin", label: "LinkedIn URL" },
  { key: "companyDomain", label: "Company website / domain" },
];

const norm = (s: string) => s.trim().toLowerCase();

// Pick the best source header for a field: exact (normalized) match first
// across all candidates, then a substring match. Returns undefined if none.
function pickHeader(headers: string[], candidates: string[]): string | undefined {
  const normHeaders = headers.map((h) => ({ raw: h, n: norm(h) }));
  for (const c of candidates) {
    const cn = norm(c);
    const exact = normHeaders.find((h) => h.n === cn);
    if (exact) return exact.raw;
  }
  for (const c of candidates) {
    const cn = norm(c);
    const partial = normHeaders.find((h) => h.n.includes(cn));
    if (partial) return partial.raw;
  }
  return undefined;
}

// Exact-match only (no substring). Used for the full-name column, where a
// substring match for "name" would wrongly grab "First Name" / "Company Name".
function pickExact(headers: string[], candidates: string[]): string | undefined {
  const cand = new Set(candidates.map(norm));
  return headers.find((h) => cand.has(norm(h)));
}

// Detect the export's origin from its header signature — lets us label the
// batch and pick sensible defaults. Heuristic; the partner can still remap.
export function detectSource(headers: string[]): "linkedin" | "google" | "other" {
  const set = new Set(headers.map(norm));
  if (set.has("connected on") || (set.has("first name") && set.has("position") && set.has("url"))) {
    return "linkedin";
  }
  if (
    [...set].some((h) => h.startsWith("organization 1")) ||
    set.has("e-mail 1 - value") ||
    set.has("given name")
  ) {
    return "google";
  }
  return "other";
}

// Best-effort header→field mapping from the headers alone (free, instant). The
// AI mapper (import-column-map skill) can refine this, but the heuristic is
// strong enough that the feature works with the AI call disabled or failing.
export function heuristicMapping(headers: string[]): ImportColumnMapping {
  return {
    // Exact-only — a substring "name" match would grab "First Name"/"Given
    // Name". When there's no single full-name column, applyMapping composes the
    // name from firstName + lastName instead.
    name: pickExact(headers, ["full name", "name", "contact name", "display name"]),
    firstName: pickHeader(headers, ["first name", "given name", "firstname"]),
    lastName: pickHeader(headers, ["last name", "family name", "surname", "lastname"]),
    title: pickHeader(headers, [
      "position",
      "title",
      "job title",
      "organization 1 - title",
      "headline",
      "role",
    ]),
    company: pickHeader(headers, [
      "company",
      "organization 1 - name",
      "organization",
      "current company",
      "employer",
    ]),
    email: pickHeader(headers, [
      "email address",
      "e-mail 1 - value",
      "email",
      "e-mail",
      "emails",
    ]),
    phone: pickHeader(headers, [
      "phone 1 - value",
      "phone number",
      "phone",
      "mobile",
      "phones",
    ]),
    linkedin: pickHeader(headers, [
      "url",
      "person linkedin url",
      "linkedin url",
      "linkedin",
      "profile url",
    ]),
    companyDomain: pickHeader(headers, [
      "company domain",
      "organization 1 - domain",
      "company website",
      "website",
      "domain",
    ]),
  };
}

function cell(raw: Record<string, string>, header?: string): string {
  if (!header) return "";
  const v = raw[header];
  return typeof v === "string" ? v.trim() : "";
}

// Apply a mapping to one raw CSV row → the cleaned wire shape. Composes the
// full name from first/last when there's no single name column. Falls back to
// email/company so a row is never nameless when it carries other identity.
export function applyMapping(
  raw: Record<string, string>,
  mapping: ImportColumnMapping,
): CleanedImportRow {
  let name = cell(raw, mapping.name);
  if (!name) {
    const first = cell(raw, mapping.firstName);
    const last = cell(raw, mapping.lastName);
    name = [first, last].filter(Boolean).join(" ").trim();
  }
  const email = cell(raw, mapping.email);
  const company = cell(raw, mapping.company);
  if (!name) name = email || company || "";

  return {
    name,
    title: cell(raw, mapping.title) || undefined,
    company: company || undefined,
    email: email || undefined,
    phone: cell(raw, mapping.phone) || undefined,
    linkedin: cell(raw, mapping.linkedin) || undefined,
    companyDomain: cell(raw, mapping.companyDomain) || undefined,
    raw,
  };
}

// A row carrying no identity at all (no name, email, or company) is dropped on
// the client before submit — it can't become a useful contact.
export function isEmptyRow(row: CleanedImportRow): boolean {
  return !row.name && !row.email && !row.company;
}

// Did this row carry enough to judge fit? `needs_identification` only when it's
// effectively name-only (no company AND no title) — those are skipped by the
// scan (no AI/credit spend) and enriched on demand later.
export function computeCompleteness(
  row: Pick<CleanedImportRow, "company" | "title">,
): "complete" | "needs_identification" {
  const hasCompany = !!row.company?.trim();
  const hasTitle = !!row.title?.trim();
  return hasCompany || hasTitle ? "complete" : "needs_identification";
}

// Stable per-partner dedupe key. Email is the strongest signal; then the
// LinkedIn profile URL (unique per person); then name|company as a last resort.
export function computeDedupeKey(
  row: Pick<CleanedImportRow, "email" | "linkedin" | "name" | "company">,
): string {
  const email = row.email?.trim().toLowerCase();
  if (email) return `email:${email}`;
  const linkedin = row.linkedin?.trim().toLowerCase();
  if (linkedin) return `linkedin:${linkedin}`;
  return `nc:${(row.name ?? "").trim().toLowerCase()}|${(row.company ?? "").trim().toLowerCase()}`;
}
