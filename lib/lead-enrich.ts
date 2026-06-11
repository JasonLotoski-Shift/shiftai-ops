// enrichLead() — enrich ONE ProspectLead with Apollo + Firecrawl + a web-sourced
// company picture and a positioning brief. Serves BOTH origins (discovery +
// imported); the detail-page and promoted-card Enrich buttons both call it.
//
// Scoped to the lead's domain: pull firmographics (Apollo), scrape the site for
// signals (Firecrawl), find more people at the company, reveal ONE primary work
// email (1 Apollo credit, credit-guarded), re-rate fit if a segment matched,
// then build the company picture (enrich-company-web, web search, auto-applied
// with deal-equivalent merge semantics) and the "how we'd sell to them"
// positioning view (lead-positioning skill). Every step is failure-isolated;
// whatever succeeded persists in one transaction.
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
import {
  parseEnrichmentJSON,
  applyLeadEnrichment,
  parsePositioning,
  type LeadProfileSnapshot,
  type Positioning,
} from "@/lib/lead-profile";
import type {
  ProspectLead as ProspectLeadModel,
  TargetSegment as TargetSegmentModel,
} from "@/lib/generated/prisma/client";

export type EnrichSummary = {
  revealed: number;
  peopleAdded: number;
  score: number;
  firmographics: boolean;
  // True when that enrich step produced applied data (a built company picture /
  // a usable positioning brief), surfaced on the Enrich button alongside notes.
  profile: boolean;
  positioning: boolean;
  // Non-fatal problems that would otherwise be invisible — a missing API key, a
  // domain that couldn't be resolved, an Apollo/Firecrawl call that failed. The
  // button surfaces these so "ran but did nothing" stops being a silent mystery.
  notes: string[];
};

// Turn a swallowed error into a partner-readable note (the env-var and credit
// cases are the ones worth calling out by name).
function noteFor(step: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("is not set")) return `${step}: API key not configured (check Vercel env vars).`;
  if (msg.startsWith("APOLLO_AUTH")) return `${step}: Apollo rejected the API key (auth).`;
  if (msg.startsWith("APOLLO_CREDITS")) return `${step}: out of Apollo credits.`;
  return `${step}: ${msg.slice(0, 140)}`;
}

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

// Project the Prisma row into the plain snapshot the pure apply reads.
function leadProfileSnapshot(lead: ProspectLeadModel): LeadProfileSnapshot {
  return {
    website: lead.website,
    linkedinUrl: lead.linkedinUrl,
    instagramUrl: lead.instagramUrl,
    companySize: lead.companySize,
    headquarters: lead.headquarters,
    founded: lead.founded,
    ownership: lead.ownership,
    description: lead.description,
    subIndustry: lead.subIndustry,
    revenueEstimate: lead.revenueEstimate,
    employeeEstimate: lead.employeeEstimate,
    currentSystems: lead.currentSystems,
    painPoints: lead.painPoints,
    companyKeyFacts: lead.companyKeyFacts,
  };
}

// Company-picture context for the web-search step — mirrors the deal ctx lines
// in generateDealCompanyEnrichment, substituting lead fields. The record is a
// PROSPECT LEAD (pre-pipeline). `enrich` is this pass's Apollo firmographics
// (preferred over stale stored values where present).
function buildProfileContext(
  lead: ProspectLeadModel,
  enrich: { name?: string; industry?: string; industryTags?: string[]; headquarters?: string | null; revenueEstimate?: number | null; employeeEstimate?: number | null } | null,
  domain: string,
): string {
  const industryTags = enrich?.industryTags?.length
    ? enrich.industryTags
    : [enrich?.industry, ...lead.industryTags].filter((x): x is string => !!x);
  return [
    "## Company record (existing — PROSPECT LEAD, pre-pipeline)",
    `Company: ${enrich?.name ?? lead.companyName}`,
    `Domain: ${domain}`,
    `Industry / tags: ${industryTags.join(", ") || "unknown"}`,
    `Website: ${lead.website || "(empty)"}`,
    `LinkedIn: ${lead.linkedinUrl || "(empty)"}`,
    `Instagram: ${lead.instagramUrl || "(empty)"}`,
    `Revenue estimate (CAD): ${lead.revenueEstimate ?? enrich?.revenueEstimate ?? "(empty)"}`,
    `Employee count: ${lead.employeeEstimate ?? enrich?.employeeEstimate ?? "(empty)"}`,
    `Company size: ${lead.companySize || "(empty)"}`,
    `Headquarters: ${lead.headquarters || enrich?.headquarters || "(empty)"}`,
    `Founded: ${lead.founded || "(empty)"}`,
    `Ownership: ${lead.ownership || "(empty)"}`,
    `Sub-industry: ${lead.subIndustry || "(empty)"}`,
    `Description: ${lead.description || "(empty)"}`,
    `Key facts: ${lead.companyKeyFacts.length ? lead.companyKeyFacts.join("; ") : "(none)"}`,
    `Current systems: ${lead.currentSystems.length ? lead.currentSystems.join("; ") : "(none)"}`,
    `Pain points: ${lead.painPoints.length ? lead.painPoints.join("; ") : "(none)"}`,
  ].join("\n");
}

// Positioning context — the now-known picture (existing fields overlaid with
// THIS pass's applied additions in `profileData`), the matched segment name,
// and the current fit rationale. No web search; the model reasons over facts.
function buildPositioningContext(
  lead: ProspectLeadModel,
  profileData: Record<string, unknown>,
  enrich: { name?: string; industry?: string; industryTags?: string[] } | null,
  rationale: string,
  segmentName: string,
  domain: string,
): string {
  // Overlay this pass's applied additions onto the stored row.
  const str = (k: keyof ProspectLeadModel) =>
    (profileData[k as string] as string | undefined) ?? (lead[k] as string | null) ?? "";
  const list = (k: keyof ProspectLeadModel) =>
    (profileData[k as string] as string[] | undefined) ?? ((lead[k] as string[]) ?? []);
  const industryTags = enrich?.industryTags?.length
    ? enrich.industryTags
    : [enrich?.industry, ...lead.industryTags].filter((x): x is string => !!x);
  const rev = (profileData["revenueEstimate"] as number | undefined) ?? lead.revenueEstimate;
  const emp = (profileData["employeeEstimate"] as number | undefined) ?? lead.employeeEstimate;
  return [
    "## Company picture",
    `Company: ${enrich?.name ?? lead.companyName}`,
    `Domain: ${domain}`,
    `Industry / tags: ${industryTags.join(", ") || "unknown"}`,
    `Sub-industry: ${str("subIndustry") || "unknown"}`,
    `Revenue estimate (CAD): ${rev ?? "unknown"}`,
    `Employee estimate: ${emp ?? "unknown"}`,
    `Company size: ${str("companySize") || "unknown"}`,
    `Headquarters: ${str("headquarters") || "unknown"}`,
    `Description: ${str("description") || "(none)"}`,
    `Current systems: ${list("currentSystems").join("; ") || "(none)"}`,
    `Pain points: ${list("painPoints").join("; ") || "(none)"}`,
    `Key facts: ${list("companyKeyFacts").join("; ") || "(none)"}`,
    "",
    "## Targeting",
    `Matched target segment: ${segmentName}`,
    `Why they fit our ICP (current rationale): ${rationale || "(none)"}`,
  ].join("\n");
}

export async function enrichLead(opts: {
  leadId: string;
  actorPartnerId: string;
  actorLabel: string;
}): Promise<EnrichSummary> {
  const lead = await prisma.prospectLead.findUnique({ where: { id: opts.leadId } });
  if (!lead) throw new Error("Lead not found");
  const notes: string[] = [];
  let domain = normalizeDomain(lead.domain);

  // Promoted-from-import leads may be keyed on a company-name slug (no dot) when
  // the import carried no domain. Resolve the real domain via Apollo first, and
  // best-effort upgrade the lead's key (skip on a rare unique collision).
  if (domain && !domain.includes(".")) {
    const resolved = await resolveDomainByName(lead.companyName);
    if (!resolved) {
      // Couldn't find the company — nothing to enrich against yet. This is the
      // most common silent "did nothing" for imported leads (no real domain).
      return {
        revealed: 0,
        peopleAdded: 0,
        score: lead.score,
        firmographics: false,
        profile: false,
        positioning: false,
        notes: [
          `Couldn't resolve a company domain for "${lead.companyName}" via Apollo. Add a website to the lead, or check the Apollo API key.`,
        ],
      };
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
    notes.push(noteFor("Firmographics (Apollo)", err));
  }

  // 2) Site signals (Firecrawl, best-effort — the slow step).
  let signals = "";
  try {
    const { markdown } = await firecrawlScrape(lead.website || `https://${domain}`);
    signals = markdown.slice(0, 2000);
  } catch (err) {
    console.error(`[lead-enrich] scrape failed for ${domain}:`, err);
    notes.push(noteFor("Site scrape (Firecrawl)", err));
  }

  // 3) Find more people at the company (surfaces decision-makers near the
  //    imported person). Merge net-new ones; dedupe by name+title.
  let found: ApolloPerson[] = [];
  try {
    found = await apolloSearchPeople({ domains: [domain], perPage: 10 });
  } catch (err) {
    console.error(`[lead-enrich] people search failed for ${domain}:`, err);
    notes.push(noteFor("People search (Apollo)", err));
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
        notes.push("Email reveal skipped: out of Apollo credits.");
      } else {
        console.error(`[lead-enrich] reveal failed for ${domain}:`, err);
        notes.push(noteFor("Email reveal (Apollo)", err));
      }
    }
  }

  // 5) Re-rate with firmographics if a segment matched (refresh score).
  //    The matched segment is fetched once here and reused by positioning (7).
  let score = lead.score;
  let rationale = lead.rationale;
  let segment: TargetSegmentModel | null = null;
  if (lead.segmentId) {
    try {
      segment = await prisma.targetSegment.findUnique({ where: { id: lead.segmentId } });
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
      notes.push(noteFor("Re-rate (Claude)", err));
    }
  }

  // 6) Company picture: web-search enrichment (deal field subset), auto-applied.
  let profileData: Record<string, unknown> = {};
  let profileApplied = 0;
  try {
    const ctx = buildProfileContext(lead, enrich, domain);
    const raw = await generate({
      skill: "enrich-company-web",
      context: ctx,
      intake: [
        "Use web search to find public, authoritative facts about this exact company (use the company name, industry tags, and website to disambiguate).",
        "This record is a PROSPECT LEAD (pre-pipeline), so use the deal field set — `field` must be exactly one of:",
        "website, companySize, headquarters, founded, ownership, description, linkedinUrl, instagramUrl, revenueEstimate, employeeCount, subIndustry (single-value); companyKeyFacts, currentSystems, painPoints (lists — one addition per item).",
        "No brandColors. revenueEstimate and employeeCount must be numbers a source actually states.",
        "Propose company-profile additions, citing a source for every fact. Return the JSON object exactly as specified.",
      ].join("\n"),
      webSearch: true,
      maxTokens: 2000,
    });
    // Conflicts dropped: keep existing values (conservative auto-apply).
    const { additions } = parseEnrichmentJSON(raw);
    const res = applyLeadEnrichment(leadProfileSnapshot(lead), additions);
    profileData = res.data;
    profileApplied = res.applied;
  } catch (err) {
    console.error(`[lead-enrich] company picture failed for ${domain}:`, err);
    notes.push(noteFor("Company picture (web search)", err));
  }

  // 7) Positioning — how we'd sell to them. Runs over the now-known picture
  //    (existing fields + this pass's applied additions), no web search.
  let positioning: Positioning | null = null;
  try {
    const segmentName = segment?.name ?? "(unmatched)";
    const ctx = buildPositioningContext(lead, profileData, enrich, rationale, segmentName, domain);
    const raw = await generate({
      skill: "lead-positioning",
      context: ctx,
      intake: "Write the selling view for this prospect. Output ONLY the JSON object.",
      maxTokens: 800,
    });
    positioning = parsePositioning(raw);
    if (!positioning) notes.push("Positioning: model returned no usable JSON.");
  } catch (err) {
    console.error(`[lead-enrich] positioning failed for ${domain}:`, err);
    notes.push(noteFor("Positioning (Claude)", err));
  }

  // 8) Persist everything in one transaction.
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
        // Company-picture additions applied this pass (fills empties only; an
        // unparseable/empty value is never emitted, so this can't resurrect null).
        ...profileData,
        ...(positioning && (positioning.fitSummary || positioning.likelyNeeds.length || positioning.salesAngle)
          ? {
              fitSummary: positioning.fitSummary || null,
              likelyNeeds: positioning.likelyNeeds,
              salesAngle: positioning.salesAngle || null,
            }
          : {}),
        enrichedAt: new Date(),
      },
    });
    await writeAudit(tx, {
      actor: partnerActor(opts.actorPartnerId, opts.actorLabel),
      action: "enrich.prospectLead",
      targetType: "ProspectLead",
      targetId: lead.id,
      changes: { domain, revealed, peopleAdded, score, firmographics: !!enrich, profileApplied, positioning: !!positioning },
    });
    await writeActivity(tx, {
      actor: partnerActor(opts.actorPartnerId, opts.actorLabel),
      type: "ai",
      target: lead.companyName,
      detail: `Enriched ${enrich?.name ?? lead.companyName} — +${peopleAdded} people, ${revealed} email${revealed === 1 ? "" : "s"} revealed`,
      link: `/pipeline/leads/${lead.id}`,
    });
  });

  return {
    revealed,
    peopleAdded,
    score,
    firmographics: !!enrich,
    profile: profileApplied > 0,
    positioning: !!positioning,
    notes,
  };
}
