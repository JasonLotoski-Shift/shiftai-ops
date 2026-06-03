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
import { firecrawlSearch, firecrawlScrape } from "@/lib/firecrawl";
import {
  apolloSearchCompanies,
  apolloSearchPeople,
  apolloMatchPerson,
  apolloEnrichOrg,
  normalizeDomain,
  type ApolloPerson,
} from "@/lib/apollo";
import { writeAudit, writeActivity, agentActor } from "@/lib/audit";

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
  evaluated: number;
  found: number;
  ghost: number;
  /** Per-company write failures that were NOT duplicates (FIX #1) — surfaced so a
   *  swallowed P2020/other error is never indistinguishable from a success. */
  errors: number;
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
  let ghost = 0;
  let errors = 0;
  const writtenSamples: DiscoverySummary["sampleLeads"] = [];

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
    // (3) SOURCE A — Apollo companies.
    const candidates = new Map<string, Candidate>();
    const addCandidate = (c: { companyName: string; domain: string; website?: string; source: string }) => {
      const domain = normalizeDomain(c.domain);
      if (!domain || isExcludedHost(domain)) return;
      const existing = candidates.get(domain);
      if (existing) {
        existing.foundBy.add(c.source);
        if (!existing.website && c.website) existing.website = c.website;
        if (!existing.companyName && c.companyName) existing.companyName = c.companyName;
      } else {
        candidates.set(domain, {
          companyName: c.companyName || domain,
          domain,
          website: c.website,
          foundBy: new Set([c.source]),
        });
      }
    };

    try {
      const { companies } = await apolloSearchCompanies({
        locations: segment.geographies,
        employeeRanges: buildEmployeeRanges(segment.employeeMin, segment.employeeMax),
        keywordTags: segment.industries,
        perPage: Math.min(Math.max(companyCap * 2, 25), 100),
      });
      for (const co of companies) {
        addCandidate({ companyName: co.name, domain: co.domain, website: co.website, source: "apollo" });
      }
    } catch (err) {
      console.error("[lead-discovery] Apollo company search failed:", err);
    }

    // SOURCE B — Firecrawl. Craft a query (LLM), fall back to deterministic.
    let query = "";
    const priority = segment.priorityLocation ?? segment.geographies[0] ?? "";
    try {
      const ctx = [
        `Industries: ${segment.industries.join(", ")}`,
        `Geographies: ${segment.geographies.join(", ")}`,
        `Priority location: ${priority || "—"}`,
        `Buying signals: ${segment.buyingSignals.join(", ") || "—"}`,
      ].join("\n");
      const raw = await generate({
        skill: "lead-discovery-firecrawl",
        context: ctx,
        intake: "Craft one compact Firecrawl search query for this segment. Return ONLY the query string.",
        maxTokens: 120,
      });
      query = raw.trim().split("\n")[0].replace(/^["']|["']$/g, "").trim();
    } catch (err) {
      console.error("[lead-discovery] Firecrawl query generation failed:", err);
    }
    if (!query) {
      query = `${segment.industries[0] ?? ""} companies ${priority} ${segment.buyingSignals[0] ?? ""}`
        .replace(/\s+/g, " ")
        .trim();
    }

    try {
      const results = await firecrawlSearch(query, { limit: 15 });
      for (const r of results) {
        const domain = extractDomainFromUrl(r.url);
        if (!domain || isExcludedHost(domain)) continue;
        addCandidate({ companyName: r.title || domain, domain, website: r.url, source: "firecrawl" });
      }
    } catch (err) {
      console.error("[lead-discovery] Firecrawl search failed:", err);
    }

    // (4) DEDUP against existing ProspectLead.domain + Contact.domain (FIX #2).
    // Load EVERY existing ProspectLead.domain (any status) and EVERY Contact.domain,
    // push BOTH through normalizeDomain into one Set, and normalize each candidate
    // the SAME way before checking. (No `{ in: domains }` filter: a stored domain
    // in a non-normalized form would slip past an IN clause and the engine would
    // re-create a ProspectLead it already has — the cascadeprocess.ca dedup miss.)
    const seen = new Set<string>();
    const [existingLeads, existingContacts] = await Promise.all([
      prisma.prospectLead.findMany({ select: { domain: true } }),
      prisma.contact.findMany({ select: { domain: true } }),
    ]);
    for (const l of existingLeads) {
      const d = normalizeDomain(l.domain);
      if (d) seen.add(d);
    }
    for (const c of existingContacts) {
      const d = normalizeDomain(c.domain);
      if (d) seen.add(d);
    }
    const fresh = [...candidates.values()].filter((c) => !seen.has(normalizeDomain(c.domain)));

    // Precompute people-search filters from personas.
    const titleSeeds = personasToTitles(personas);
    const seniorities = personasToSeniorities(personas);

    // (5) Per-fresh-candidate loop, capped by companyCap + wall-clock budget.
    for (const cand of fresh) {
      if (evaluated >= companyCap) break;
      if (budgetLeft() < 15_000) break;

      try {
        // a) Enrich firmographics.
        let enrich = null;
        try {
          enrich = await apolloEnrichOrg(cand.domain);
        } catch (err) {
          console.error(`[lead-discovery] enrich failed for ${cand.domain}:`, err);
        }

        // b) Scrape site for buying signals.
        let signals = "";
        try {
          const target = cand.website || `https://${cand.domain}`;
          const { markdown } = await firecrawlScrape(target);
          signals = markdown.slice(0, 2000);
        } catch (err) {
          console.error(`[lead-discovery] scrape failed for ${cand.domain}:`, err);
        }

        // c) Find people scoped to the domain + personas.
        let people: ApolloPerson[] = [];
        try {
          people = await apolloSearchPeople({
            titles: titleSeeds.length ? titleSeeds : undefined,
            seniorities: seniorities.length ? seniorities : undefined,
            organizationLocations: segment.geographies.length ? segment.geographies : undefined,
            domains: [cand.domain],
            perPage: 10,
          });
        } catch (err) {
          console.error(`[lead-discovery] people search failed for ${cand.domain}:`, err);
        }

        // d) Reveal emails per the segment's reveal policy (FIX #3 + PART B).
        //    "primary": reveal ONLY the chosen primary (1 credit/company).
        //    "all": reveal every found person (1 credit each). Each successful
        //    reveal writes a "reveal.apollo.email" AuditLog row for credit counting.
        const primary = choosePrimary(people, titleSeeds);

        // Reveal one person's work email; returns the resolved person row. On a
        // non-null email, records the reveal audit (a spent credit). Surfaces the
        // APOLLO_CREDITS-prefixed error so the caller can stop the per-person loop.
        const revealPerson = async (p: ApolloPerson): Promise<PersonJson> => {
          let matchedEmail: string | null = null;
          let matchedName: string | null = p.name ?? null;
          let matchedTitle: string | null = p.title ?? null;
          const matched = await apolloMatchPerson(
            p.apolloPersonId ? { id: p.apolloPersonId } : { domain: cand.domain },
          );
          matchedEmail = matched.email ?? null;
          matchedName = matched.name ?? matchedName;
          matchedTitle = matched.title ?? matchedTitle;
          if (matchedEmail) await recordReveal(cand.domain, matchedName, matchedTitle);
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
        // Order people so the primary is first (revealed first in either policy).
        const ordered = primary
          ? [primary, ...people.filter((p) => p !== primary)]
          : [...people];
        let creditsExhausted = false;
        for (const p of ordered) {
          const isPrimary = p === primary;
          const shouldReveal = !creditsExhausted && (revealAll || isPrimary);
          if (shouldReveal) {
            try {
              peopleJson.push(await revealPerson(p));
              continue;
            } catch (err) {
              console.error(`[lead-discovery] match (reveal) failed for ${cand.domain}:`, err);
              // Out of Apollo credits → stop revealing for the rest of the run; keep
              // the remaining people stored without email rather than dropping them.
              if (err instanceof Error && err.message.startsWith("APOLLO_CREDITS")) {
                creditsExhausted = true;
              }
            }
          }
          // Stored without email (reveal-on-demand later, or credits exhausted).
          peopleJson.push({
            name: p.name ?? null,
            title: p.title ?? null,
            email: null,
            source: "apollo",
            apolloPersonId: p.apolloPersonId,
            emailRevealed: false,
          });
        }

        // e) Rate fit.
        const industryTags = enrich?.industryTags?.length
          ? enrich.industryTags
          : [enrich?.industry].filter((x): x is string => !!x);
        const ratingCtx = [
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
          `Company: ${enrich?.name ?? cand.companyName}`,
          `Domain: ${cand.domain}`,
          `Industry / tags: ${industryTags.join(", ") || "unknown"}`,
          `Employee estimate: ${enrich?.employeeEstimate ?? "unknown"}`,
          `Revenue estimate: ${enrich?.revenueEstimate ?? "unknown"}`,
          `Headquarters: ${enrich?.headquarters ?? "unknown"}`,
          `Site signals snippet: ${signals.slice(0, 1200) || "none"}`,
        ].join("\n");

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
          console.error(`[lead-discovery] rating failed for ${cand.domain}:`, err);
        }

        evaluated++;

        // (6) Write the ProspectLead (P2002-safe; NOT in the finalize transaction).
        const status: "pending" | "ghost" = rating.score >= 6 ? "pending" : "ghost";
        const data = {
          companyName: enrich?.name ?? cand.companyName,
          domain: cand.domain,
          website: cand.website ?? enrich?.website ?? null,
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
          foundBy: [...cand.foundBy],
          sources: {
            apollo: enrich?.raw ?? null,
            firecrawl: { query, signalsSnippet: signals.slice(0, 500) },
          } as unknown as object,
          createdBy: "AGENT · CLAUDE",
          generatedFromSkill: "lead-discovery",
        };

        try {
          await prisma.prospectLead.create({ data });
          if (status === "pending") found++;
          else ghost++;
          if (writtenSamples.length < 5) {
            writtenSamples.push({
              companyName: data.companyName,
              domain: data.domain,
              score: data.score,
              status,
            });
          }
        } catch (err) {
          // FIX #1: distinguish a genuine duplicate (P2002 — domain race, skip
          // quietly) from ANY other write failure (P2020 overflow, etc.). A real
          // write failure is logged AND counted as an error — never silently
          // treated as a success, so the run counts stay honest.
          const code = (err as { code?: string })?.code;
          if (code === "P2002") {
            // Duplicate domain — already have this lead. Skip, no count change.
          } else {
            errors++;
            console.error(`[lead-discovery] ProspectLead write failed for ${cand.domain}:`, err);
          }
        }
      } catch (err) {
        // Whole-company failure → skip this candidate, continue the run.
        console.error(`[lead-discovery] candidate ${cand.domain} failed, skipping:`, err);
        continue;
      }
    }

    // (7) Finalize — LeadRun + audit + activity in one transaction.
    await prisma.$transaction(async (tx) => {
      await tx.leadRun.update({
        where: { id: runId },
        data: {
          evaluatedCount: evaluated,
          foundCount: found,
          ghostCount: ghost,
          status: "done",
          finishedAt: new Date(),
        },
      });
      await writeAudit(tx, {
        actor: agentActor("lead-discovery"),
        action: "run.leadDiscovery",
        targetType: "LeadRun",
        targetId: runId,
        changes: { segmentId: segment.id, evaluated, found, ghost, errors, companyCap, timeBudgetMs },
      });
      await writeActivity(tx, {
        actor: agentActor("lead-discovery"),
        type: "ai",
        target: segment.name,
        detail:
          `Discovery run — ${found} leads, ${ghost} ghosts from ${evaluated} evaluated` +
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

  return { runId, evaluated, found, ghost, errors, sampleLeads: writtenSamples };
}
