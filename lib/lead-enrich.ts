// enrichLead() — enrich ONE promoted ProspectLead with Apollo + Firecrawl.
//
// A promoted (origin=imported) lead starts with just the person(s) the partner
// imported. This runs the same per-company enrichment the discovery engine does,
// scoped to the lead's domain: pull firmographics (Apollo), scrape the site for
// signals (Firecrawl), find more people at the company, reveal ONE primary work
// email (1 Apollo credit, credit-guarded), and re-rate fit if a segment matched.
//
// Plain async (NO "use server"), reusing lib/apollo + lib/firecrawl + lib/ai +
// lib/lead-discovery helpers. Bounded to one company so a single user-initiated
// enrich fits a normal request; the enrich-action sets maxDuration on the route.

import { prisma } from "@/lib/prisma";
import { generate } from "@/lib/ai";
import { firecrawlScrape } from "@/lib/firecrawl";
import {
  apolloEnrichOrg,
  apolloSearchCompanies,
  apolloSearchPeople,
  apolloMatchPerson,
  normalizeDomain,
  type ApolloPerson,
} from "@/lib/apollo";
import { toSafeInt } from "@/lib/lead-discovery";
import { writeAudit, writeActivity, partnerActor, agentActor } from "@/lib/audit";
import type { ProspectPerson } from "@/lib/types";

export type EnrichSummary = {
  revealed: number;
  peopleAdded: number;
  score: number;
  firmographics: boolean;
};

const personKey = (name: string, title: string) =>
  `${name.trim().toLowerCase()}|${(title ?? "").trim().toLowerCase()}`;

// Resolve a real company domain from a company name via Apollo's credit-free
// keyword search — used when a promoted lead was keyed on a company-name slug
// (the import carried no domain). Prefers an exact name match; falls back to the
// first result that has a domain. Returns "" if nothing usable.
async function resolveDomainByName(company: string): Promise<string> {
  const name = company.trim();
  if (!name) return "";
  try {
    const { companies } = await apolloSearchCompanies({ keywordTags: [name], perPage: 5 });
    const lower = name.toLowerCase();
    const exact = companies.find((c) => c.domain && c.name.trim().toLowerCase() === lower);
    return exact?.domain || companies.find((c) => c.domain)?.domain || "";
  } catch (err) {
    console.error(`[lead-enrich] domain resolve failed for "${name}":`, err);
    return "";
  }
}

// Minimal rating parse (the discovery engine's is module-private). Fence-strip,
// then read score/rationale with safe clamps.
function parseRating(raw: string): { score: number; rationale: string } {
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
    let score = typeof o.score === "number" ? Math.trunc(o.score) : 5;
    if (Number.isNaN(score)) score = 5;
    score = Math.min(10, Math.max(1, score));
    const rationale =
      typeof o.rationale === "string" && o.rationale.trim() ? o.rationale.trim() : "";
    return { score, rationale };
  } catch {
    return { score: 5, rationale: "" };
  }
}

// Pick the best person to reveal a work email for: first one missing an email,
// preferring a known decision-maker, then a connector, then anyone.
function pickRevealIndex(people: ProspectPerson[]): number {
  const order: (ProspectPerson["roleType"] | undefined)[] = ["decision_maker", "connector", undefined];
  for (const role of order) {
    const idx = people.findIndex(
      (p) => !p.email?.trim() && (role === undefined ? true : p.roleType === role),
    );
    if (idx !== -1) return idx;
  }
  return -1;
}

export async function enrichLead(opts: {
  leadId: string;
  actorPartnerId: string;
  actorLabel: string;
}): Promise<EnrichSummary> {
  const lead = await prisma.prospectLead.findUnique({ where: { id: opts.leadId } });
  if (!lead) throw new Error("Lead not found");
  let domain = normalizeDomain(lead.domain);

  // Promoted-from-import leads may be keyed on a company-name slug (no dot) when
  // the import carried no domain. Resolve the real domain via Apollo first, and
  // best-effort upgrade the lead's key (skip on a rare unique collision).
  if (domain && !domain.includes(".")) {
    const resolved = await resolveDomainByName(lead.companyName);
    if (!resolved) {
      // Couldn't find the company — nothing to enrich against yet.
      return { revealed: 0, peopleAdded: 0, score: lead.score, firmographics: false };
    }
    if (resolved !== domain) {
      try {
        await prisma.prospectLead.update({ where: { id: lead.id }, data: { domain: resolved } });
      } catch {
        // A lead for the real domain already exists — keep the slug key and
        // still enrich using the resolved domain.
      }
    }
    domain = resolved;
  }
  if (!domain) throw new Error("This lead has no company domain to enrich.");

  const people: ProspectPerson[] = (lead.people as unknown as ProspectPerson[]) ?? [];
  let revealed = 0;
  let peopleAdded = 0;

  // 1) Firmographics (Apollo, fast).
  let enrich = null;
  try {
    enrich = await apolloEnrichOrg(domain);
  } catch (err) {
    console.error(`[lead-enrich] enrich failed for ${domain}:`, err);
  }

  // 2) Site signals (Firecrawl, best-effort — the slow step).
  let signals = "";
  try {
    const { markdown } = await firecrawlScrape(lead.website || `https://${domain}`);
    signals = markdown.slice(0, 2000);
  } catch (err) {
    console.error(`[lead-enrich] scrape failed for ${domain}:`, err);
  }

  // 3) Find more people at the company (surfaces decision-makers near the
  //    imported person). Merge net-new ones; dedupe by name+title.
  let found: ApolloPerson[] = [];
  try {
    found = await apolloSearchPeople({ domains: [domain], perPage: 10 });
  } catch (err) {
    console.error(`[lead-enrich] people search failed for ${domain}:`, err);
  }
  const seen = new Set(people.map((p) => personKey(p.name ?? "", p.title ?? "")));
  for (const p of found) {
    const name = (p.name ?? "").trim();
    if (!name) continue;
    const k = personKey(name, p.title ?? "");
    if (seen.has(k)) continue;
    seen.add(k);
    people.push({
      name,
      title: p.title || "—",
      email: null,
      source: "apollo",
      apolloPersonId: p.apolloPersonId,
      emailRevealed: false,
    });
    peopleAdded++;
  }

  // 4) Reveal ONE primary work email (1 credit). Records the reveal audit
  //    immediately (a spent credit is always logged), mirroring discovery.
  const revealIdx = pickRevealIndex(people);
  if (revealIdx !== -1) {
    const p = people[revealIdx];
    try {
      let match;
      if (p.apolloPersonId) {
        match = await apolloMatchPerson({ id: p.apolloPersonId });
      } else {
        const parts = (p.name ?? "").trim().split(/\s+/);
        const firstName = parts[0] || undefined;
        const lastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
        match =
          firstName && lastName
            ? await apolloMatchPerson({ firstName, lastName, domain })
            : await apolloMatchPerson({ domain });
      }
      const email = match.email?.trim();
      if (email) {
        people[revealIdx] = {
          ...p,
          email,
          emailRevealed: true,
          name: match.name ?? p.name,
          title: match.title ?? p.title,
        };
        revealed++;
        await writeAudit(prisma, {
          actor: agentActor("lead-discovery"),
          action: "reveal.apollo.email",
          targetType: "ProspectLead",
          targetId: domain,
          changes: { domain, name: p.name, title: p.title },
        }).catch(() => {});
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("APOLLO_CREDITS")) {
        // Out of Apollo credits — keep the rest of the enrichment, skip reveal.
        console.warn("[lead-enrich] out of Apollo credits, skipping reveal");
      } else {
        console.error(`[lead-enrich] reveal failed for ${domain}:`, err);
      }
    }
  }

  // 5) Re-rate with firmographics if a segment matched (refresh score).
  let score = lead.score;
  let rationale = lead.rationale;
  if (lead.segmentId) {
    try {
      const segment = await prisma.targetSegment.findUnique({ where: { id: lead.segmentId } });
      if (segment) {
        const industryTags = enrich?.industryTags?.length
          ? enrich.industryTags
          : [enrich?.industry].filter((x): x is string => !!x);
        const ctx = [
          "## Segment",
          `Industries: ${segment.industries.join(", ")}`,
          `Revenue band (CAD): ${segment.revenueMin ?? "?"} – ${segment.revenueMax ?? "?"}`,
          `Employee band: ${segment.employeeMin ?? "?"} – ${segment.employeeMax ?? "?"}`,
          `Geographies: ${segment.geographies.join(", ")}`,
          `Buying signals: ${segment.buyingSignals.join(", ") || "—"}`,
          `Disqualifiers: ${segment.disqualifiers.join(", ") || "—"}`,
          "",
          "## Candidate",
          `Company: ${enrich?.name ?? lead.companyName}`,
          `Domain: ${domain}`,
          `Industry / tags: ${industryTags.join(", ") || "unknown"}`,
          `Employee estimate: ${enrich?.employeeEstimate ?? "unknown"}`,
          `Revenue estimate: ${enrich?.revenueEstimate ?? "unknown"}`,
          `Headquarters: ${enrich?.headquarters ?? "unknown"}`,
          `Site signals snippet: ${signals.slice(0, 1200) || "none"}`,
        ].join("\n");
        const raw = await generate({
          skill: "lead-rating",
          context: ctx,
          intake: "Rate this company for segment fit. Output ONLY the JSON.",
          maxTokens: 400,
        });
        const r = parseRating(raw);
        score = r.score;
        if (r.rationale) rationale = r.rationale;
      }
    } catch (err) {
      console.error(`[lead-enrich] re-rate failed for ${domain}:`, err);
    }
  }

  // 6) Persist everything in one transaction.
  const industryTags = enrich?.industryTags?.length
    ? enrich.industryTags
    : [enrich?.industry].filter((x): x is string => !!x);
  const foundBy = Array.from(new Set([...lead.foundBy, "apollo", ...(signals ? ["firecrawl"] : [])]));
  const sources = {
    ...((lead.sources as Record<string, unknown> | null) ?? {}),
    apollo: enrich?.raw ?? null,
    firecrawl: signals ? { signalsSnippet: signals.slice(0, 500) } : null,
  };

  await prisma.$transaction(async (tx) => {
    await tx.prospectLead.update({
      where: { id: lead.id },
      data: {
        companyName: enrich?.name ?? lead.companyName,
        website: lead.website ?? enrich?.website ?? null,
        industryTags: industryTags.length ? industryTags : lead.industryTags,
        revenueEstimate: toSafeInt(enrich?.revenueEstimate) ?? lead.revenueEstimate,
        employeeEstimate: toSafeInt(enrich?.employeeEstimate, 5_000_000) ?? lead.employeeEstimate,
        headquarters: enrich?.headquarters ?? lead.headquarters,
        people: people as unknown as object,
        score,
        rationale,
        foundBy,
        sources: sources as unknown as object,
      },
    });
    await writeAudit(tx, {
      actor: partnerActor(opts.actorPartnerId, opts.actorLabel),
      action: "enrich.prospectLead",
      targetType: "ProspectLead",
      targetId: lead.id,
      changes: { domain, revealed, peopleAdded, score, firmographics: !!enrich },
    });
    await writeActivity(tx, {
      actor: partnerActor(opts.actorPartnerId, opts.actorLabel),
      type: "ai",
      target: lead.companyName,
      detail: `Enriched ${enrich?.name ?? lead.companyName} — +${peopleAdded} people, ${revealed} email${revealed === 1 ? "" : "s"} revealed`,
      link: `/pipeline/leads/${lead.id}`,
    });
  });

  return { revealed, peopleAdded, score, firmographics: !!enrich };
}
