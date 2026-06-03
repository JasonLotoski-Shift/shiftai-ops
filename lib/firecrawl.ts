// Firecrawl v2 client — thin fetch wrappers for the Discovery Engine (Phase C).
//
// Two calls the pipeline needs:
//   firecrawlSearch(query)  — discover candidate company sites from a query
//   firecrawlScrape(url)    — pull a site's markdown for firmographics + signals
//
// Reads FIRECRAWL_API_KEY at call time (mirrors lib/ai.ts client()) so importing
// this module in a non-discovery path never throws. Plain global fetch + an
// AbortSignal timeout — no SDK, no React/Next imports, tsx-unit-testable.

const BASE = "https://api.firecrawl.dev/v2";

const SEARCH_TIMEOUT_MS = 30_000;
const SCRAPE_TIMEOUT_MS = 45_000; // scrape renders the page — give it longer.

function key(): string {
  const k = process.env.FIRECRAWL_API_KEY;
  if (!k) {
    throw new Error(
      "FIRECRAWL_API_KEY is not set. Add it to .env (dev) and Vercel env (prod).",
    );
  }
  return k;
}

async function request(
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error(`Firecrawl ${path} timed out after ${timeoutMs}ms`);
    }
    throw new Error(
      `Firecrawl ${path} request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Firecrawl ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export type FirecrawlResult = {
  title: string;
  url: string;
  description?: string;
  markdown?: string;
};

/**
 * POST /search — returns web results for a query. Set scrapeContent to also pull
 * each result's markdown (slower, more tokens). Defensive: tolerates a missing
 * data.web envelope by returning [] rather than throwing.
 */
export async function firecrawlSearch(
  query: string,
  opts?: { limit?: number; scrapeContent?: boolean; timeoutMs?: number },
): Promise<FirecrawlResult[]> {
  const body: Record<string, unknown> = {
    query,
    limit: opts?.limit ?? 10,
    ...(opts?.scrapeContent ? { scrapeOptions: { formats: ["markdown"] } } : {}),
  };
  const json = await request("/search", body, opts?.timeoutMs ?? SEARCH_TIMEOUT_MS);

  if (json.success === false) {
    const msg = typeof json.error === "string" ? json.error : "search failed";
    throw new Error(`Firecrawl /search: ${msg}`);
  }

  const data = (json.data ?? {}) as Record<string, unknown>;
  const web = Array.isArray(data.web) ? data.web : [];
  return web.map((r): FirecrawlResult => {
    const o = (r ?? {}) as Record<string, unknown>;
    return {
      title: typeof o.title === "string" ? o.title : "",
      url: typeof o.url === "string" ? o.url : "",
      description: typeof o.description === "string" ? o.description : undefined,
      markdown: typeof o.markdown === "string" ? o.markdown : undefined,
    };
  }).filter((r) => r.url);
}

/**
 * POST /scrape — returns a page's markdown. Always returns a string (empty on a
 * thin page) so signal-extraction downstream never NPEs. A real scrape failure
 * throws; the pipeline catches per-company.
 */
export async function firecrawlScrape(
  url: string,
  opts?: { timeoutMs?: number },
): Promise<{ markdown: string }> {
  const json = await request(
    "/scrape",
    { url, formats: ["markdown"] },
    opts?.timeoutMs ?? SCRAPE_TIMEOUT_MS,
  );
  const data = (json.data ?? {}) as Record<string, unknown>;
  return { markdown: typeof data.markdown === "string" ? data.markdown : "" };
}
