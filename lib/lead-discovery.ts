// runDiscovery() — the Phase C Discovery Engine pipeline.
//
// Given a TargetSegment, source candidate companies from Apollo + Firecrawl,
// merge + dedup by normalized domain (against existing ProspectLead.domain and
// Contact.domain), then per fresh candidate: enrich firmographics, scrape the
// site for buying signals, find people, reveal ONLY the primary's work email
// (hybrid 1-credit cap per company), rate fit 1–10, and write a ProspectLead.
// Finalize a LeadRun row + audit + activity.
//
// Plain async (NO "use server") so it is tsx-unit-testable. Robust per-company
// try/catch: one company's scrape/enrich/match/rate failure is caught and
// skipped — it never aborts the run. Respects a hard wall-clock budget + a
// company cap. No UI wiring in this pass.

import { prisma } from "@/lib/prisma";
import { generate } from "@/lib/ai";
import { firecrawlScrape } from "@/lib/firecrawl";
import {
  apolloSearchCompaniesWide,
  apolloSearchPeople,
  apolloMatchPerson,
  apolloEnrichOrg,
  normalizeDomain,
  type ApolloPerson,
} from "@/lib/apollo";
import { prerank } from "@/lib/lead-prerank";
import { assemblePool } from "@/lib/lead-pool";
import { writeAudit, writeActivity, agentActor } from "@/lib/audit";

// ── Bounded-concurrency helper ────────────────────────────────────────────────

// Run async tasks with a concurrency cap; preserves input order in the result.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Mapping tables (the lead-discovery-apollo skill, encoded) ─────────────────

const SENIORITY_TO_APOLLO: Record<string, string> = {
  Owner: "owner",
  Founder: "founder",
  "C-Suite": "c_suite",
  Partner: "partner",
  VP: "vp",
  Head: "head",
  Director: "director",
  Manager: "manager",
  Senior: "senior",
  Entry: "entry",
};

const DEPARTMENT_TO_TITLES: Record<string, string[]> = {
  Executive: ["CEO", "President", "Chief Executive"],
  Operations: ["Operations", "COO", "Ops"],
  Engineering: ["Engineering", "CTO", "Engineer"],
  Finance: ["Finance", "CFO", "Controller"],
  Sales: ["Sales", "Revenue", "CRO"],
  Marketing: ["Marketing", "CMO", "Brand"],
  IT: ["IT", "Information Technology", "CIO"],
  HR: ["HR", "People", "Human Resources"],
  Product: ["Product", "CPO"],
  Legal: ["Legal", "General Counsel"],
  Procurement: ["Procurement", "Purchasing", "Supply Chain"],
};

const EXCLUDED_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "youtube.com",
  "crunchbase.com",
  "wikipedia.org",
  "glassdoor.com",
  "indeed.com",
  "yelp.com",
  "bloomberg.com",
  "reuters.com",
  "forbes.com",
  "medium.com",
  "reddit.com",
];

// ── Types ─────────────────────────────────────────────────────────────────────

type Persona = { department: string; seniority: string };

type Candidate = {
  companyName: string;
  domain: string;
  website?: string;
  foundBy: Set<string>;
};

type PersonJson = {
  name: string | null;
  title: string | null;
  email: string | null;
  source: string;
  apolloPersonId?: string;
  emailRevealed: boolean;
};

type Rating = { score: number; rationale: string; disqualified: boolean };

export type DiscoverySummary = {
  runId: string;
  /** Stage-1 pool counts: fresh inserts ranked, re-admitted leads ranked. */
  poolFresh: number;
  poolReadmit: number;
  /** Finalists actually taken for stage-2 enrichment (capped). */
  finalists: number;
  evaluated: number;
  /** Fresh inserts that passed (score >= 6, status pending). */
  found: number;
  /** Re-admitted leads that passed on this look ("rescued from filtered"). */
  rescued: number;
  /** Fresh inserts that did not pass (status ghost). */
  ghost: number;
  /** Re-admitted leads that still did not pass (re-judged ghost). */
  rejudged: number;
  /** Per-company write failures that were NOT duplicates (FIX #1) — surfaced so a
   *  swallowed P2020/other error is never indistinguishable from a success. */
  errors: number;
  /** Companies in the ranked pool beyond the finalist cap, left to explore. */
  remaining: number;
  sampleLeads: { companyName: string; domain: string; score: number; status: string }[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePersonas(raw: unknown): Persona[] {
  if (!Array.isArray(raw)) return [];
  const out: Persona[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const department = typeof r.department === "string" ? r.department : "";
    const seniority = typeof r.seniority === "string" ? r.seniority : "";
    if (department && seniority) out.push({ department, seniority });
  }
  return out;
}

// Reuse the segment-drafter fence-stripping parse recipe, with safe defaults.
function parseRating(raw: string): Rating {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
  }
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    let score = typeof o.score === "number" ? Math.trunc(o.score) : 1;
    if (Number.isNaN(score)) score = 1;
    score = Math.min(10, Math.max(1, score));
    const rationale =
      typeof o.rationale === "string" && o.rationale.trim()
        ? o.rationale.trim()
        : "No rationale returned.";
    const disqualified = o.disqualified === true;
    return { score, rationale, disqualified };
  } catch {
    return { score: 1, rationale: "Rating could not be parsed.", disqualified: false };
  }
}

// Clamp a numeric estimate into Prisma's Int range before a write. Apollo can
// return values larger than a Postgres Int (e.g. revenue 3.5e9), which made the
// per-company create throw P2020 and silently drop the lead (FIX #1). Non-finite
// / NaN / negative → null; a value above `max` → null (absurd = bad data, not a
// fake ceiling). Employee estimates pass a 5,000,000 ceiling (no real company is
// larger — anything bigger is Apollo bad data); revenue passes the Int max.
const INT_MAX = 2_147_483_647;
export function toSafeInt(value: number | null | undefined, max = INT_MAX): number | null {
  if (value == null || typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  if (n < 0) return null;
  if (n > max) return null;
  return n;
}

function extractDomainFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    return normalizeDomain(host);
  } catch {
    return normalizeDomain(url);
  }
}

function isExcludedHost(domain: string): boolean {
  return EXCLUDED_HOSTS.some((h) => domain === h || domain.endsWith(`.${h}`));
}

function personasToTitles(personas: Persona[]): string[] {
  const set = new Set<string>();
  for (const p of personas) {
    for (const t of DEPARTMENT_TO_TITLES[p.department] ?? []) set.add(t);
  }
  return [...set];
}

function personasToSeniorities(personas: Persona[]): string[] {
  const set = new Set<string>();
  for (const p of personas) {
    const s = SENIORITY_TO_APOLLO[p.seniority];
    if (s) set.add(s);
  }
  return [...set];
}

// Rank a person's title against the segment's title seeds; lower = better match.
function choosePrimary(people: ApolloPerson[], titleSeeds: string[]): ApolloPerson | null {
  if (people.length === 0) return null;
  const seeds = titleSeeds.map((t) => t.toLowerCase());
  let best: ApolloPerson | null = null;
  let bestScore = Infinity;
  people.forEach((p, idx) => {
    const title = (p.title ?? "").toLowerCase();
    const matched = seeds.some((s) => title.includes(s));
    // Prefer a title-seed match; break ties by original order (Apollo relevance).
    const score = (matched ? 0 : 100) + idx * 0.001;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  });
  return best ?? people[0];
}

// Build the lead-rating context string. Extracted so the insert (fresh) and
// update (re-admit) finalist paths construct it identically.
function buildRatingCtx(
  segment: {
    industries: string[];
    revenueMin: number | null;
    revenueMax: number | null;
    employeeMin: number | null;
    employeeMax: number | null;
    geographies: string[];
    priorityLocation: string | null;
    buyingSignals: string[];
    disqualifiers: string[];
  },
  enrich: { name?: string | null; employeeEstimate?: number | null; revenueEstimate?: number | null; headquarters?: string | null } | null,
  domain: string,
  fallbackName: string,
  industryTags: string[],
  signals: string,
): string {
  return [
    "## Segment",
    `Industries: ${segment.industries.join(", ")}`,
    `Revenue band (CAD): ${segment.revenueMin ?? "?"} – ${segment.revenueMax ?? "?"}`,
    `Employee band: ${segment.employeeMin ?? "?"} – ${segment.employeeMax ?? "?"}`,
    `Geographies: ${segment.geographies.join(", ")}`,
    `Priority location: ${segment.priorityLocation ?? "—"}`,
    `Buying signals: ${segment.buyingSignals.join(", ") || "—"}`,
    `Disqualifiers: ${segment.disqualifiers.join(", ") || "—"}`,
    "",
    "## Candidate",
    `Company: ${enrich?.name ?? fallbackName}`,
    `Domain: ${domain}`,
    `Industry / tags: ${industryTags.join(", ") || "unknown"}`,
    `Employee estimate: ${enrich?.employeeEstimate ?? "unknown"}`,
    `Revenue estimate: ${enrich?.revenueEstimate ?? "unknown"}`,
    `Headquarters: ${enrich?.headquarters ?? "unknown"}`,
    `Site signals snippet: ${signals.slice(0, 1200) || "none"}`,
  ].join("\n");
}

function buildEmployeeRanges(min: number | null, max: number | null): string[] | undefined {
  if (min !== null && max !== null) return [`${min},${max}`];
  if (min !== null) return [`${min},100000`];
  if (max !== null) return [`1,${max}`];
  return undefined;
}

// ── runDiscovery ──────────────────────────────────────────────────────────────

export async function runDiscovery(opts: {
  segmentId: string;
  companyCap?: number;
  timeBudgetMs?: number;
  /** Stage-1 Apollo wide-search pool size (free). Added in the discovery
   *  redesign; the targeting dials are wired in a later task. */
  wideLimit?: number;
  /** Stage-2 bounded parallelism for finalist enrichment. */
  concurrency?: number;
  /** When set, run against this PRE-CREATED LeadRun (status running) instead of
   *  creating a new one. Lets a server action create the run synchronously and
   *  return its id immediately, then execute the heavy work in the background
   *  (FIX #2). The finalize tx + error catch already key off `runId`, so they
   *  work unchanged whether the run was pre-created or self-created. */
  runId?: string;
}): Promise<DiscoverySummary> {
  const companyCap = opts.companyCap ?? 15;
  const timeBudgetMs = opts.timeBudgetMs ?? 240_000;
  const startedAt = Date.now();
  const budgetLeft = () => timeBudgetMs - (Date.now() - startedAt);

  // (1) Load the segment. When a run was pre-created by the caller, a
  // "segment not found" throw must mark THAT run errored (mirror the top-level
  // catch below) before re-throwing.
  const segment = await prisma.targetSegment.findUnique({ where: { id: opts.segmentId } });
  if (!segment) {
    if (opts.runId) {
      await prisma.leadRun
        .update({ where: { id: opts.runId }, data: { status: "error", finishedAt: new Date() } })
        .catch(() => {});
    }
    throw new Error(`TargetSegment not found: ${opts.segmentId}`);
  }
  const personas = parsePersonas(segment.personas);

  // (2) Use the pre-created LeadRun if one was supplied; otherwise create one.
  const run = opts.runId
    ? null
    : await prisma.leadRun.create({
        data: { status: "running", segmentId: segment.id, createdBy: "AGENT · CLAUDE" },
      });
  const runId = opts.runId ?? run!.id;

  let evaluated = 0;
  let found = 0;
  let rescued = 0;
  let ghost = 0;
  let rejudged = 0;
  let errors = 0;
  const writtenSamples: DiscoverySummary["sampleLeads"] = [];
  // Stage-1 pool counts, captured at function scope so the return (outside the
  // try) can report them even if stage 2 partially runs.
  const summaryPool = { fresh: 0, readmit: 0, finalists: 0, remaining: 0 };

  // PART B: per-segment reveal policy. "all" reveals every found person's email
  // (1 credit each); "primary" (default/null) keeps the single-primary 1-credit
  // cap per company. Reading an absent column yields undefined → safely "primary".
  const revealAll =
    (segment as { revealAtDiscovery?: string | null }).revealAtDiscovery === "all";

  // FIX #3: each Apollo email reveal (a spent credit) must write an AuditLog row
  // ("reveal.apollo.email") so monthly credit usage can be counted (Part E). The
  // reveal happens before the ProspectLead row exists, so we key the audit by
  // domain and write it immediately — a later row-write failure must not lose the
  // record of a credit that was already spent.
  const recordReveal = async (domain: string, name: string | null, title: string | null) => {
    try {
      await writeAudit(prisma, {
        actor: agentActor("lead-discovery"),
        action: "reveal.apollo.email",
        targetType: "ProspectLead",
        targetId: domain,
        changes: { domain, name, title },
      });
    } catch (err) {
      console.error(`[lead-discovery] reveal audit failed for ${domain}:`, err);
    }
  };

  try {
    // ── STAGE 1 (pure, free): wide search → pool assembly → pre-rank → finalists.

    const WIDE_LIMIT = opts.wideLimit ?? 150;
    const FINALISTS = opts.companyCap ?? 40;

    // (1) Wide, free Apollo search.
    let wide: Awaited<ReturnType<typeof apolloSearchCompaniesWide>> = { companies: [], total: 0 };
    try {
      wide = await apolloSearchCompaniesWide({
        locations: segment.geographies,
        employeeRanges: buildEmployeeRanges(segment.employeeMin, segment.employeeMax),
        keywordTags: segment.industries,
        limit: WIDE_LIMIT,
      });
    } catch (err) {
      console.error("[lead-discovery] Apollo wide search failed:", err);
    }

    // (2) Load existing leads + contacts (read-only) for pool assembly.
    const [existingLeads, existingContacts] = await Promise.all([
      prisma.prospectLead.findMany({
        select: {
          domain: true,
          origin: true,
          status: true,
          reviewedBy: true,
          segmentId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.contact.findMany({ select: { domain: true } }),
    ]);

    // (3) Assemble pool (fresh inserts + re-admitted updates, origin-scoped).
    const { freshCompanies, readmitLeads } = assemblePool({
      fresh: wide.companies,
      existingLeads: existingLeads as unknown as Parameters<typeof assemblePool>[0]["existingLeads"],
      contactDomains: existingContacts
        .map((c) => c.domain)
        .filter((d): d is string => !!d),
      segmentId: segment.id,
      lastOptimizedAt: segment.lastOptimizedAt ?? null,
    });

    // (4) Pre-rank fresh + re-admitted together (re-admitted carry domain only; load
    //     their growth/revenue lazily in stage 2 via enrich — pre-rank them neutral).
    type Finalist =
      | { kind: "insert"; company: (typeof freshCompanies)[number] }
      | { kind: "update"; leadDomain: string };
    const bands = { revenueMin: segment.revenueMin, revenueMax: segment.revenueMax };
    const rankedFresh = prerank(freshCompanies, bands).map(
      (company): Finalist => ({ kind: "insert", company }),
    );
    const rankedReadmit = readmitLeads.map(
      (l): Finalist => ({ kind: "update", leadDomain: normalizeDomain(l.domain) }),
    );
    // Re-admitted leads interleave after the signal-ranked fresh ones (neutral signal),
    // then everything is capped at FINALISTS.
    const finalists = [...rankedFresh, ...rankedReadmit].slice(0, FINALISTS);
    const remainingEstimate = Math.max(
      0,
      rankedFresh.length + rankedReadmit.length - FINALISTS,
    );
    summaryPool.fresh = rankedFresh.length;
    summaryPool.readmit = rankedReadmit.length;
    summaryPool.finalists = finalists.length;
    summaryPool.remaining = remainingEstimate;

    // Precompute people-search filters from personas.
    const titleSeeds = personasToTitles(personas);
    const seniorities = personasToSeniorities(personas);

    const CONCURRENCY = opts.concurrency ?? 6;

    // Re-admits carry domain only and load their firmographics lazily via enrich.

    // (5) STAGE 2 (I/O, bounded-parallel): per finalist, enrich + scrape + people +
    //     re-rank, reveal the primary email ONLY on a pass (score >= 6), then write
    //     (insert fresh / update re-admit). One finalist's failure never aborts the run.
    await mapWithConcurrency(finalists, CONCURRENCY, async (f) => {
      // Skip remaining finalists once the wall-clock budget is nearly spent.
      if (budgetLeft() < 15_000) return;
      const domain = f.kind === "insert" ? f.company.domain : f.leadDomain;

      try {
        // a) Enrich firmographics.
        let enrich = null;
        try {
          enrich = await apolloEnrichOrg(domain);
        } catch (err) {
          console.error(`[lead-discovery] enrich failed for ${domain}:`, err);
        }

        // b) Scrape site for buying signals (use the fresh company's website if known).
        const website = f.kind === "insert" ? f.company.website : undefined;
        let signals = "";
        try {
          const target = website || enrich?.website || `https://${domain}`;
          const { markdown } = await firecrawlScrape(target);
          signals = markdown.slice(0, 2000);
        } catch (err) {
          console.error(`[lead-discovery] scrape failed for ${domain}:`, err);
        }

        // Firecrawl genuinely contributed iff the scrape returned signal text.
        // Drives the foundBy label below (apollo+firecrawl vs apollo-only) so the
        // UI stops mislabeling enriched leads as Apollo-only.
        const firecrawlHit = signals.trim().length > 0;
        const foundBy = firecrawlHit ? ["apollo", "firecrawl"] : ["apollo"];

        // c) Find people scoped to the domain + personas.
        let people: ApolloPerson[] = [];
        try {
          people = await apolloSearchPeople({
            titles: titleSeeds.length ? titleSeeds : undefined,
            seniorities: seniorities.length ? seniorities : undefined,
            organizationLocations: segment.geographies.length ? segment.geographies : undefined,
            domains: [domain],
            perPage: 10,
          });
        } catch (err) {
          console.error(`[lead-discovery] people search failed for ${domain}:`, err);
        }
        const primary = choosePrimary(people, titleSeeds);

        // d) Rate fit (signal-aware), using the shared rating-context builder.
        const industryTags = enrich?.industryTags?.length
          ? enrich.industryTags
          : [enrich?.industry].filter((x): x is string => !!x);
        const ratingCtx = buildRatingCtx(
          segment,
          enrich,
          domain,
          f.kind === "insert" ? f.company.name : domain,
          industryTags,
          signals,
        );

        let rating: Rating = { score: 1, rationale: "Not rated.", disqualified: false };
        try {
          const raw = await generate({
            skill: "lead-rating",
            context: ratingCtx,
            intake: "Rate this company for segment fit. Output ONLY the JSON.",
            maxTokens: 400,
          });
          rating = parseRating(raw);
        } catch (err) {
          console.error(`[lead-discovery] rating failed for ${domain}:`, err);
        }

        const passes = rating.score >= 6 && !rating.disqualified;

        // e) Reveal emails ONLY when the lead passes. Policy: reveal the primary
        //    (1 credit/company); "all" reveals every found person (1 credit each).
        //    Each successful reveal writes a "reveal.apollo.email" AuditLog row.
        const revealPerson = async (p: ApolloPerson): Promise<PersonJson> => {
          const matched = await apolloMatchPerson(
            p.apolloPersonId ? { id: p.apolloPersonId } : { domain },
          );
          const matchedEmail = matched.email ?? null;
          const matchedName = matched.name ?? p.name ?? null;
          const matchedTitle = matched.title ?? p.title ?? null;
          if (matchedEmail) await recordReveal(domain, matchedName, matchedTitle);
          return {
            name: matchedName,
            title: matchedTitle,
            email: matchedEmail,
            source: "apollo",
            apolloPersonId: p.apolloPersonId,
            emailRevealed: !!matchedEmail,
          };
        };

        const peopleJson: PersonJson[] = [];
        const ordered = primary
          ? [primary, ...people.filter((p) => p !== primary)]
          : [...people];
        let creditsExhausted = false;
        for (const p of ordered) {
          const isPrimary = p === primary;
          // Gate the reveal on a passing score (the redesign reveal-on-pass rule).
          const shouldReveal = passes && !creditsExhausted && (revealAll || isPrimary);
          if (shouldReveal) {
            try {
              peopleJson.push(await revealPerson(p));
              continue;
            } catch (err) {
              console.error(`[lead-discovery] match (reveal) failed for ${domain}:`, err);
              if (err instanceof Error && err.message.startsWith("APOLLO_CREDITS")) {
                creditsExhausted = true;
              }
            }
          }
          peopleJson.push({
            name: p.name ?? null,
            title: p.title ?? null,
            email: null,
            source: "apollo",
            apolloPersonId: p.apolloPersonId,
            emailRevealed: false,
          });
        }

        evaluated++;

        // (6) Persist. Insert fresh discovery leads; update re-admitted ones.
        const status: "pending" | "ghost" = passes ? "pending" : "ghost";
        const data = {
          companyName: enrich?.name ?? (f.kind === "insert" ? f.company.name : domain),
          website: (f.kind === "insert" ? f.company.website : undefined) ?? enrich?.website ?? null,
          industryTags,
          // Clamp to the Int range; absurd values → null (FIX #1, prevents P2020).
          revenueEstimate: toSafeInt(enrich?.revenueEstimate),
          employeeEstimate: toSafeInt(enrich?.employeeEstimate, 5_000_000),
          headquarters: enrich?.headquarters ?? null,
          segmentId: segment.id,
          score: rating.score,
          rationale: rating.rationale,
          disqualified: rating.disqualified,
          status,
          people: peopleJson as unknown as object,
          sources: {
            apollo: enrich?.raw ?? null,
            firecrawl: { signalsSnippet: signals.slice(0, 500) },
          } as unknown as object,
        };

        try {
          if (f.kind === "insert") {
            await prisma.prospectLead.create({
              data: {
                ...data,
                domain,
                foundBy,
                origin: "discovery",
                createdBy: "AGENT · CLAUDE",
                generatedFromSkill: "lead-discovery",
              },
            });
            if (passes) found++;
            else ghost++;
          } else {
            // Re-admit update: bumps updatedAt (the "one look per optimization"
            // guard). NEVER touch origin / reviewedBy / createdAt. Only stamp
            // foundBy when this pass actually got firecrawl signals, so a transient
            // scrape miss never downgrades a previously firecrawl-enriched lead.
            await prisma.prospectLead.update({
              where: { domain },
              data: firecrawlHit ? { ...data, foundBy } : data,
            });
            if (passes) rescued++;
            else rejudged++;
          }
          if (passes && writtenSamples.length < 5) {
            writtenSamples.push({
              companyName: data.companyName,
              domain,
              score: rating.score,
              status,
            });
          }
        } catch (err) {
          // FIX #1: distinguish a genuine duplicate (P2002 — domain race, skip
          // quietly) from ANY other write failure (P2020 overflow, etc.).
          const code = (err as { code?: string })?.code;
          if (code !== "P2002") {
            errors++;
            console.error(`[lead-discovery] ProspectLead write failed for ${domain}:`, err);
          }
        }
      } catch (err) {
        // Whole-finalist failure → skip it, continue the run.
        console.error(`[lead-discovery] finalist ${domain} failed, skipping:`, err);
      }
    });

    // (7) Finalize — LeadRun + audit + activity in one transaction. The legacy
    //     LeadRun columns keep aggregate counts (found includes rescued; ghost
    //     includes rejudged); the richer stage-aware breakdown lives in the audit.
    const totalFound = found + rescued;
    const totalGhost = ghost + rejudged;
    await prisma.$transaction(async (tx) => {
      await tx.leadRun.update({
        where: { id: runId },
        data: {
          evaluatedCount: evaluated,
          foundCount: totalFound,
          ghostCount: totalGhost,
          status: "done",
          finishedAt: new Date(),
        },
      });
      await writeAudit(tx, {
        actor: agentActor("lead-discovery"),
        action: "run.leadDiscovery",
        targetType: "LeadRun",
        targetId: runId,
        changes: {
          segmentId: segment.id,
          poolFresh: rankedFresh.length,
          poolReadmit: rankedReadmit.length,
          finalists: finalists.length,
          evaluated,
          found,
          rescued,
          ghost,
          rejudged,
          errors,
          remaining: remainingEstimate,
          companyCap,
          timeBudgetMs,
        },
      });
      await writeActivity(tx, {
        actor: agentActor("lead-discovery"),
        type: "ai",
        target: segment.name,
        detail:
          `Discovery run — ${found} new` +
          (rescued ? ` + ${rescued} rescued` : "") +
          `, ${totalGhost} filtered from ${evaluated} evaluated` +
          (errors ? ` (${errors} write error${errors === 1 ? "" : "s"})` : ""),
        link: "/targeting",
      });
    });
  } catch (err) {
    // Top-level fatal error before finalize → mark the run errored.
    console.error("[lead-discovery] run failed:", err);
    await prisma.leadRun
      .update({ where: { id: runId }, data: { status: "error", finishedAt: new Date() } })
      .catch(() => {});
    throw err;
  }

  return {
    runId,
    poolFresh: summaryPool.fresh,
    poolReadmit: summaryPool.readmit,
    finalists: summaryPool.finalists,
    evaluated,
    found,
    rescued,
    ghost,
    rejudged,
    errors,
    remaining: summaryPool.remaining,
    sampleLeads: writtenSamples,
  };
}
