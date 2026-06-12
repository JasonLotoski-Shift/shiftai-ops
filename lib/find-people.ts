// findMorePeople() — surface MORE decision-maker contacts at a target company so
// cold outreach has someone real to reach. Two free sources, merged into the
// lead's people[]:
//
//   1. Apollo people search, filtered to decision-maker titles/seniorities
//      (broader than the enrich pass's generic top-10).
//   2. The company's own website — scrape the team / about / leadership pages
//      (Firecrawl) and extract the named people via the find-people-web skill.
//
// Discovery only — it spends NO Apollo credits. Found people land with their
// title + (when the site shows one) a LinkedIn link; the partner reveals a work
// email per person from the people list (the existing 1-credit reveal). Also
// reports how many contacts we ALREADY have at this domain, so a partner sees the
// relationships already in the book. Best-effort per source; whatever succeeds
// persists in one transaction.
//
// Plain async (NO "use server") — the thin action wrapper owns auth + maxDuration.

import { prisma } from "@/lib/prisma";
import { generate } from "@/lib/ai";
import { firecrawlScrape } from "@/lib/firecrawl";
import { apolloSearchCompanies, apolloSearchPeople, normalizeDomain } from "@/lib/apollo";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import type { ProspectPerson } from "@/lib/types";

export type FindPeopleSummary = {
  added: number;
  fromApollo: number;
  fromWebsite: number;
  peopleTotal: number;
  existingContacts: number; // contacts already on file at this domain
  notes: string[];
};

const personKey = (name: string, title: string) =>
  `${name.trim().toLowerCase()}|${(title ?? "").trim().toLowerCase()}`;

// Decision-maker filters for the Apollo people search — wider net than enrich's.
const DECISION_TITLES = [
  "CEO", "President", "COO", "CTO", "CFO", "CIO", "Owner", "Founder",
  "Managing Director", "General Manager", "VP", "Vice President", "Director",
  "Head of Operations", "Operations Manager", "Partner",
];
const DECISION_SENIORITIES = ["owner", "founder", "c_suite", "partner", "vp", "head", "director"];

// Senior-title heuristic → roleType (mirrors the find-people-web skill's classes).
function inferRoleType(title: string): ProspectPerson["roleType"] {
  const t = (title ?? "").toLowerCase();
  if (
    /\b(ceo|coo|cto|cfo|cio|cmo|cro|president|founder|owner|chief|vp|vice president|head|director|principal|partner|managing|general manager|gm)\b/.test(t)
  ) {
    return "decision_maker";
  }
  return undefined;
}

function noteFor(step: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("is not set")) return `${step}: API key not configured (check Vercel env vars).`;
  if (msg.startsWith("APOLLO_AUTH")) return `${step}: Apollo rejected the API key (auth).`;
  if (msg.startsWith("APOLLO_CREDITS")) return `${step}: out of Apollo credits.`;
  return `${step}: ${msg.slice(0, 140)}`;
}

// Resolve a real domain from a company name (imported leads carry a slug, no dot).
async function resolveDomainByName(company: string): Promise<string> {
  const name = company.trim();
  if (!name) return "";
  try {
    const { companies } = await apolloSearchCompanies({ keywordTags: [name], perPage: 5 });
    const lower = name.toLowerCase();
    const exact = companies.find((c) => c.domain && c.name.trim().toLowerCase() === lower);
    return exact?.domain || companies.find((c) => c.domain)?.domain || "";
  } catch {
    return "";
  }
}

type WebPerson = { name: string; title: string; roleType?: string; linkedin?: string };

// Lenient parse of the find-people-web skill's JSON → WebPerson[].
function parseWebPeople(raw: string): WebPerson[] {
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
    const arr = Array.isArray(o.people) ? o.people : [];
    return arr
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
      .map((p) => ({
        name: typeof p.name === "string" ? p.name.trim() : "",
        title: typeof p.title === "string" ? p.title.trim() : "",
        roleType: typeof p.roleType === "string" ? p.roleType : undefined,
        linkedin: typeof p.linkedin === "string" && p.linkedin.trim() ? p.linkedin.trim() : undefined,
      }))
      .filter((p) => p.name);
  } catch {
    return [];
  }
}

export async function findMorePeople(opts: {
  leadId: string;
  actorPartnerId: string;
  actorLabel: string;
}): Promise<FindPeopleSummary> {
  const lead = await prisma.prospectLead.findUnique({ where: { id: opts.leadId } });
  if (!lead) throw new Error("Lead not found");

  const notes: string[] = [];
  let domain = normalizeDomain(lead.domain);
  // Empty/slug domain → prefer the lead's website, then Apollo name search.
  if (!domain || !domain.includes(".")) {
    const fromWebsite = normalizeDomain(lead.website);
    if (fromWebsite && fromWebsite.includes(".")) {
      domain = fromWebsite;
    } else {
      const resolved = await resolveDomainByName(lead.companyName);
      if (resolved) domain = resolved;
    }
  }
  if (!domain || !domain.includes(".")) {
    throw new Error("No company domain yet — add the company's website on this lead (or Enrich it first), then try again.");
  }

  const people: ProspectPerson[] = (lead.people as unknown as ProspectPerson[]) ?? [];
  const seen = new Set(people.map((p) => personKey(p.name ?? "", p.title ?? "")));
  let fromApollo = 0;
  let fromWebsite = 0;

  // 1) Apollo decision-maker search (credit-free; names are sometimes locked —
  //    those are skipped, their email is revealed later per-person on demand).
  try {
    const found = await apolloSearchPeople({
      domains: [domain],
      titles: DECISION_TITLES,
      seniorities: DECISION_SENIORITIES,
      perPage: 25,
    });
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
        roleType: inferRoleType(p.title || ""),
      });
      fromApollo++;
    }
  } catch (err) {
    notes.push(noteFor("Apollo people search", err));
  }

  // 2) Website team/about pages → Claude extraction. Cap scrapes (cost + time);
  //    short per-page timeout since most candidate paths 404 fast.
  try {
    const base =
      lead.website && /^https?:\/\//.test(lead.website)
        ? lead.website.replace(/\/+$/, "")
        : `https://${domain}`;
    const paths = ["", "/about", "/team", "/our-team", "/leadership", "/about-us", "/people"];
    let md = "";
    let scrapes = 0;
    for (const path of paths) {
      if (scrapes >= 3 || md.length > 12_000) break;
      try {
        const { markdown } = await firecrawlScrape(base + path, { timeoutMs: 20_000 });
        if (markdown && markdown.trim().length > 200) {
          md += `\n\n# Page: ${base + path}\n${markdown.slice(0, 6000)}`;
          scrapes++;
        }
      } catch {
        /* path may not exist — try the next */
      }
    }
    if (md.trim()) {
      const ctx = ["## Company", `Name: ${lead.companyName}`, `Domain: ${domain}`].join("\n");
      const raw = await generate({
        skill: "find-people-web",
        context: ctx,
        intake: `## Scraped website pages\n${md}`,
        maxTokens: 1500,
      });
      for (const wp of parseWebPeople(raw)) {
        const k = personKey(wp.name, wp.title);
        if (seen.has(k)) continue;
        seen.add(k);
        const roleType: ProspectPerson["roleType"] =
          wp.roleType === "connector"
            ? "connector"
            : wp.roleType === "decision_maker"
              ? "decision_maker"
              : inferRoleType(wp.title);
        people.push({
          name: wp.name,
          title: wp.title || "—",
          email: null,
          source: "website",
          emailRevealed: false,
          roleType,
          linkedin: wp.linkedin,
        });
        fromWebsite++;
      }
    } else {
      notes.push("No team/about page content found on the site.");
    }
  } catch (err) {
    notes.push(noteFor("Website scrape", err));
  }

  const added = fromApollo + fromWebsite;

  // 3) Relationships already in the book at this company (LinkedIn imports,
  //    prior contacts) — so the partner sees who we already know here.
  const existingContacts = await prisma.contact.count({ where: { domain } });

  // 4) Persist whatever we found.
  if (added > 0) {
    const actor = partnerActor(opts.actorPartnerId, opts.actorLabel);
    await prisma.$transaction(async (tx) => {
      await tx.prospectLead.update({
        where: { id: lead.id },
        data: {
          people: people as unknown as object,
          foundBy: Array.from(
            new Set([
              ...lead.foundBy,
              ...(fromApollo ? ["apollo"] : []),
              ...(fromWebsite ? ["firecrawl"] : []),
            ]),
          ),
        },
      });
      await writeAudit(tx, {
        actor,
        action: "find-people.prospectLead",
        targetType: "ProspectLead",
        targetId: lead.id,
        changes: { domain, added, fromApollo, fromWebsite },
      });
      await writeActivity(tx, {
        actor,
        type: "ai",
        target: lead.companyName,
        detail: `Found ${added} more ${added === 1 ? "person" : "people"} at ${lead.companyName}`,
        link: `/pipeline/leads/${lead.id}`,
      });
    });
  }

  return { added, fromApollo, fromWebsite, peopleTotal: people.length, existingContacts, notes };
}
