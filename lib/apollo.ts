// Apollo v1 client — company search, people search, org enrich, and the
// credit-spending email reveal for the Discovery Engine (Phase C).
//
// Auth is the X-Api-Key HEADER (not a URL param). Reads APOLLO_API_KEY at call
// time so importing this in a non-discovery path never throws. Plain global
// fetch + AbortSignal timeout, no SDK, tsx-unit-testable.
//
// Credit policy: apolloSearchCompanies / apolloSearchPeople / apolloEnrichOrg are
// the credit-free (or plan-included) net-new searches. apolloMatchPerson is the
// 1-CREDIT email reveal — the pipeline hard-caps it to one call per company.
//
// NOTE on field/param names: Apollo's docs (https://docs.apollo.io/llms.txt and
// the API reference) do not enumerate every response field. Mappings below use
// defensive optional-chaining + a raw passthrough so schema drift surfaces as a
// null field, not a crash. Confirm exact names against a live response on first
// run if a field comes back unexpectedly empty.

const BASE = "https://api.apollo.io/api/v1";
const DEFAULT_TIMEOUT_MS = 25_000;

function key(): string {
  const k = process.env.APOLLO_API_KEY;
  if (!k) {
    throw new Error(
      "APOLLO_API_KEY is not set. Add it to .env (dev) and Vercel env (prod).",
    );
  }
  return k;
}

/**
 * Normalize a raw domain/URL to a bare lowercase host (no scheme, www, or path).
 * Single source of truth so ProspectLead.domain (unique) and Contact.domain
 * dedup identically. Mirrors segment-drafter's anchor-domain regex chain.
 */
export function normalizeDomain(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

async function apolloPost(
  path: string,
  body: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "X-Api-Key": key(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error(`Apollo ${path} timed out after ${timeoutMs}ms`);
    }
    throw new Error(
      `Apollo ${path} request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Surface credit/plan exhaustion as a recognizable prefix so the pipeline
    // (and a later UI reveal button) can tell "out of credits" from transient.
    const lower = text.toLowerCase();
    if (
      res.status === 402 ||
      lower.includes("insufficient") ||
      lower.includes("credit")
    ) {
      throw new Error(`APOLLO_CREDITS ${path} ${res.status}: ${text.slice(0, 300)}`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`APOLLO_AUTH ${path} ${res.status}: ${text.slice(0, 300)}`);
    }
    throw new Error(`Apollo ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function omitEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "string" && v === "") continue;
    out[k] = v;
  }
  return out;
}

// ── Companies ────────────────────────────────────────────────────────────────

export type ApolloCompany = {
  name: string;
  domain: string;
  website?: string;
  employeeEstimate?: number;
  industry?: string;
  headquarters?: string;
  raw: unknown;
};

/** POST /mixed_companies/search — credit-free firmographic search. */
export async function apolloSearchCompanies(filters: {
  locations?: string[];
  employeeRanges?: string[]; // e.g. ["50,500"]
  keywordTags?: string[];
  page?: number;
  perPage?: number;
}): Promise<{ companies: ApolloCompany[]; total: number }> {
  const body = omitEmpty({
    organization_locations: filters.locations,
    organization_num_employees_ranges: filters.employeeRanges,
    q_organization_keyword_tags: filters.keywordTags,
    page: filters.page ?? 1,
    per_page: Math.min(filters.perPage ?? 25, 100),
  });
  const json = await apolloPost("/mixed_companies/search", body);
  const orgs = Array.isArray(json.organizations) ? json.organizations : [];
  const companies = orgs
    .map((o): ApolloCompany => {
      const r = (o ?? {}) as Record<string, unknown>;
      return {
        name: typeof r.name === "string" ? r.name : "",
        domain: normalizeDomain(
          (r.primary_domain as string) || (r.website_url as string),
        ),
        website: typeof r.website_url === "string" ? r.website_url : undefined,
        employeeEstimate:
          typeof r.estimated_num_employees === "number"
            ? r.estimated_num_employees
            : undefined,
        industry: typeof r.industry === "string" ? r.industry : undefined,
        raw: o,
      };
    })
    .filter((c) => c.domain);
  const pagination = (json.pagination ?? {}) as Record<string, unknown>;
  const total =
    typeof pagination.total_entries === "number" ? pagination.total_entries : 0;
  return { companies, total };
}

// ── People (net-new search — credit-free; name often locked/null) ─────────────

export type ApolloPerson = {
  apolloPersonId?: string;
  name?: string | null;
  title?: string;
  organizationName?: string;
  organizationDomain?: string;
  raw: unknown;
};

/**
 * POST /mixed_people/api_search — the credit-free net-new people search.
 * (The plain /mixed_people/search is DEPRECATED for API use.) `name` is often
 * locked/null here; that is expected — reveal via apolloMatchPerson when chosen.
 */
export async function apolloSearchPeople(filters: {
  titles?: string[];
  seniorities?: string[];
  personLocations?: string[];
  organizationLocations?: string[];
  domains?: string[];
  page?: number;
  perPage?: number;
}): Promise<ApolloPerson[]> {
  const body = omitEmpty({
    person_titles: filters.titles,
    person_seniorities: filters.seniorities,
    person_locations: filters.personLocations,
    organization_locations: filters.organizationLocations,
    q_organization_domains_list: filters.domains,
    page: filters.page ?? 1,
    per_page: Math.min(filters.perPage ?? 10, 100),
  });
  const json = await apolloPost("/mixed_people/api_search", body);
  const people = Array.isArray(json.people) ? json.people : [];
  return people.map((p): ApolloPerson => {
    const r = (p ?? {}) as Record<string, unknown>;
    const org = (r.organization ?? {}) as Record<string, unknown>;
    return {
      apolloPersonId: typeof r.id === "string" ? r.id : undefined,
      name: typeof r.name === "string" ? r.name : null,
      title: typeof r.title === "string" ? r.title : undefined,
      organizationName: typeof org.name === "string" ? org.name : undefined,
      organizationDomain: normalizeDomain(org.primary_domain as string) || undefined,
      raw: p,
    };
  });
}

// ── Person match (THE 1-CREDIT EMAIL REVEAL) ──────────────────────────────────

export type ApolloMatch = {
  name?: string | null;
  title?: string;
  email?: string | null;
  emailStatus?: string | null;
  raw: unknown;
};

/**
 * POST /people/match — COSTS 1 CREDIT (verified work email). Prefer { id } when
 * available, else name + organization, else domain/email. Does NOT set
 * reveal_personal_emails / reveal_phone_number (those are extra paid reveals —
 * we want only the work email). The pipeline calls this AT MOST once per company.
 */
export async function apolloMatchPerson(input: {
  id?: string;
  firstName?: string;
  lastName?: string;
  organizationName?: string;
  domain?: string;
  email?: string;
}): Promise<ApolloMatch> {
  let body: Record<string, unknown>;
  if (input.id) {
    body = { id: input.id };
  } else if (input.firstName && input.lastName) {
    body = omitEmpty({
      first_name: input.firstName,
      last_name: input.lastName,
      organization_name: input.organizationName,
      domain: input.domain ? normalizeDomain(input.domain) : undefined,
    });
  } else if (input.domain) {
    body = { domain: normalizeDomain(input.domain) };
  } else if (input.email) {
    body = { email: input.email };
  } else {
    throw new Error("apolloMatchPerson: provide id, name+org, domain, or email");
  }
  const json = await apolloPost("/people/match", body);
  const person = (json.person ?? {}) as Record<string, unknown>;
  return {
    name: typeof person.name === "string" ? person.name : null,
    title: typeof person.title === "string" ? person.title : undefined,
    email: typeof person.email === "string" ? person.email : null,
    emailStatus:
      typeof person.email_status === "string" ? person.email_status : null,
    raw: json.person ?? null,
  };
}

// ── Org enrich ────────────────────────────────────────────────────────────────

export type ApolloOrg = {
  name?: string;
  domain: string;
  website?: string;
  industry?: string;
  industryTags?: string[];
  employeeEstimate?: number;
  // NOTE: Apollo reports annual_revenue in USD; the pipeline/rater treat the band
  // loosely — currency conversion is out of scope for this client.
  revenueEstimate?: number;
  headquarters?: string;
  raw: unknown;
};

/** POST /organizations/enrich — firmographics for one domain. */
export async function apolloEnrichOrg(domain: string): Promise<ApolloOrg | null> {
  const norm = normalizeDomain(domain);
  if (!norm) return null;
  const json = await apolloPost("/organizations/enrich", { domain: norm });
  const org = json.organization as Record<string, unknown> | undefined;
  if (!org) return null;

  const city = typeof org.city === "string" ? org.city : "";
  const state = typeof org.state === "string" ? org.state : "";
  const country = typeof org.country === "string" ? org.country : "";
  const headquarters = [city, state, country].filter(Boolean).join(", ") || undefined;

  const revenueRaw =
    typeof org.annual_revenue === "number"
      ? org.annual_revenue
      : typeof org.organization_revenue === "number"
        ? org.organization_revenue
        : undefined;

  const keywords = Array.isArray(org.keywords)
    ? (org.keywords as unknown[]).filter((k): k is string => typeof k === "string")
    : undefined;

  return {
    name: typeof org.name === "string" ? org.name : undefined,
    domain: normalizeDomain((org.primary_domain as string) || norm),
    website: typeof org.website_url === "string" ? org.website_url : undefined,
    industry: typeof org.industry === "string" ? org.industry : undefined,
    industryTags: keywords,
    employeeEstimate:
      typeof org.estimated_num_employees === "number"
        ? org.estimated_num_employees
        : undefined,
    revenueEstimate: revenueRaw !== undefined ? Math.round(revenueRaw) : undefined,
    headquarters,
    raw: json.organization ?? null,
  };
}

// ── Optional: named top people (fallback when api_search names are locked) ─────

/**
 * POST /mixed_people/organization_top_people — named top people for an org.
 * Param name (organization_ids vs organization_id) is the least-documented bit;
 * re-confirm against the live endpoint before relying on this. Optional fallback.
 */
export async function apolloTopPeople(orgId: string): Promise<ApolloPerson[]> {
  const json = await apolloPost("/mixed_people/organization_top_people", {
    organization_ids: [orgId],
  });
  const people = Array.isArray(json.people) ? json.people : [];
  return people.map((p): ApolloPerson => {
    const r = (p ?? {}) as Record<string, unknown>;
    const org = (r.organization ?? {}) as Record<string, unknown>;
    return {
      apolloPersonId: typeof r.id === "string" ? r.id : undefined,
      name: typeof r.name === "string" ? r.name : null,
      title: typeof r.title === "string" ? r.title : undefined,
      organizationName: typeof org.name === "string" ? org.name : undefined,
      organizationDomain: normalizeDomain(org.primary_domain as string) || undefined,
      raw: p,
    };
  });
}
