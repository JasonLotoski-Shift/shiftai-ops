// Shared entity resolution — the SINGLE contact matcher every create path funnels
// through (manual "Add contact", ingest approval, ingest inline-add) so dedup is
// consistent instead of each flow rolling its own (or none).
//
// Signal ladder, strongest first:
//   exact  — same normalized email. The same person, full stop → safe to auto-attach.
//   strong — same domain + closely-matching name (handles "same person, new email").
//   fuzzy  — close name AND close company, but no exact/strong signal → NEVER
//            auto-merged. Surfaced for a human yes/no (the firm's flag-for-confirm
//            rule: strong/exact attach automatically, fuzzy asks first).
//
// Server-only (touches Prisma). NOT a "use server" module — the caller owns auth,
// mirroring lib/contacts.ts and lib/ingest/dedup.ts. The pure string helpers
// (normalize*, ratio, tokenJaccard) carry no Prisma and are reused by the task
// dedup in lib/ingest/dedup.ts.

import { prisma } from "@/lib/prisma";
import { normalizeDomain } from "@/lib/apollo";

// The client handed to a prisma.$transaction(async (tx) => …) callback, or the
// singleton itself — so resolution works inside or outside a transaction.
type Db = typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// ── Pure normalizers ──────────────────────────────────────────────────────────

export function normalizeEmail(raw?: string | null): string {
  return (raw ?? "").trim().toLowerCase();
}

/** Lowercase, drop honorifics + punctuation, collapse whitespace. */
export function normalizeName(raw?: string | null): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|dr|prof|sir)\.?\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Legal suffixes + generic filler — stripped so "Acme Inc." and "Acme" compare equal.
const COMPANY_NOISE =
  /\b(inc|llc|ltd|co|corp|corporation|company|holdings|group|gmbh|sa|plc|partners|international|global|industries|solutions|services|systems|technologies|labs|studio|studios|the|and)\b\.?/g;

/** Lowercase, strip legal suffixes + filler + punctuation, collapse whitespace. */
export function normalizeCompany(raw?: string | null): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(COMPANY_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Pure similarity ───────────────────────────────────────────────────────────

// Levenshtein edit distance (iterative, single-row). Small strings only.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** 0..1 edit-distance similarity. 1 = identical, 0 = nothing shared. */
export function ratio(a: string, b: string): number {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

/** 0..1 token-set overlap (Jaccard) — order-insensitive, good for company names. */
export function tokenJaccard(a: string, b: string): number {
  const ta = new Set(a.split(/\s+/).filter(Boolean));
  const tb = new Set(b.split(/\s+/).filter(Boolean));
  if (!ta.size && !tb.size) return 1;
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

// ── Contact resolution ─────────────────────────────────────────────────────────

export type MatchConfidence = "exact" | "strong" | "fuzzy";

export type ContactMatch = {
  id: string;
  name: string;
  email: string;
  company: string;
  confidence: MatchConfidence;
  reason: string; // human-readable why, e.g. "Same email"
};

export type ResolveContactResult = {
  // Best AUTO-usable match (exact or strong) or null. Callers attach to this
  // without asking the partner.
  match: ContactMatch | null;
  // Every plausible match, best-first, INCLUDING fuzzy. The flag-for-confirm UI
  // shows these when `match` is null so a human can decide.
  candidates: ContactMatch[];
};

// Thresholds — deliberately conservative on STRONG (auto-attach) and a touch
// looser on FUZZY (only ever flagged, never auto-applied).
const NAME_STRONG = 0.85; // same domain + this name similarity → strong
const NAME_FUZZY = 0.85; // name similarity floor for a fuzzy flag
const NAME_FUZZY_SOLO = 0.93; // very-close name alone (no company signal) → fuzzy
const COMPANY_FUZZY = 0.6; // company similarity to support a fuzzy name match

const firstToken = (s: string): string => s.split(/\s+/).filter(Boolean)[0] ?? "";

/**
 * Resolve a contact against the book by email → domain+name → fuzzy name/company.
 * Pure read; never writes. `match` is set only for exact/strong (safe to attach);
 * fuzzy results live in `candidates` for the partner to confirm.
 */
export async function resolveContact(
  input: { name?: string | null; email?: string | null; company?: string | null; domain?: string | null },
  db: Db = prisma,
): Promise<ResolveContactResult> {
  const email = normalizeEmail(input.email);
  const name = normalizeName(input.name);
  const company = normalizeCompany(input.company);
  const domain =
    normalizeDomain(input.domain) || (email.includes("@") ? email.split("@")[1] ?? "" : "");

  // 1) Exact email — the strongest signal; return immediately.
  if (email) {
    const hit = await db.contact.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, name: true, email: true, company: true },
    });
    if (hit) {
      const m: ContactMatch = { ...hit, confidence: "exact", reason: "Same email address" };
      return { match: m, candidates: [m] };
    }
  }

  // Build a bounded candidate pool: same domain, OR a shared leading company
  // token, OR a shared first name. (No signals → nothing to compare → no match.)
  const or: Record<string, unknown>[] = [];
  if (domain) or.push({ domain });
  if (company && firstToken(company).length >= 3)
    or.push({ company: { contains: firstToken(company), mode: "insensitive" } });
  if (name && firstToken(name).length >= 3)
    or.push({ name: { contains: firstToken(name), mode: "insensitive" } });
  if (or.length === 0) return { match: null, candidates: [] };

  const pool = await db.contact.findMany({
    where: { OR: or as never },
    select: { id: true, name: true, email: true, company: true, domain: true },
    take: 50,
  });

  const candidates: ContactMatch[] = [];
  for (const c of pool) {
    const cName = normalizeName(c.name);
    const cCompany = normalizeCompany(c.company);
    const nameSim = name && cName ? ratio(name, cName) : 0;
    const companySim =
      company && cCompany ? Math.max(ratio(company, cCompany), tokenJaccard(company, cCompany)) : 0;
    const domainEq = !!domain && normalizeDomain(c.domain) === domain;

    const base = { id: c.id, name: c.name, email: c.email, company: c.company };

    // strong — same company domain + a closely matching name.
    if (domainEq && nameSim >= NAME_STRONG) {
      candidates.push({ ...base, confidence: "strong", reason: "Same company domain + name" });
      continue;
    }
    // fuzzy — close name backed by a close company, or a very-close name alone.
    if (
      (nameSim >= NAME_FUZZY && companySim >= COMPANY_FUZZY) ||
      nameSim >= NAME_FUZZY_SOLO
    ) {
      candidates.push({
        ...base,
        confidence: "fuzzy",
        reason: companySim >= COMPANY_FUZZY ? "Similar name + company" : "Very similar name",
      });
    }
  }

  // Order strong before fuzzy; within a tier keep DB order (stable).
  const rank = (c: ContactMatch) => (c.confidence === "strong" ? 0 : 1);
  candidates.sort((a, b) => rank(a) - rank(b));

  const match = candidates.find((c) => c.confidence === "strong") ?? null;
  return { match, candidates };
}
