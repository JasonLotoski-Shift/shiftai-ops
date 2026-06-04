// Deterministic stage-1 pre-rank. Apollo already filtered the pool for fit
// (vertical/geo/size) server-side; this only decides ENRICHMENT ORDER, for free.
// Missing data is NEUTRAL, never a penalty (Apollo's search payload omits
// keywords/industry, and revenue is often 0 — see the design doc, section 1).

export type PrerankCompany = {
  domain?: string;
  revenue?: number | null;
  headcountGrowth12mo?: number | null;
};

export type RevenueBands = { revenueMin?: number | null; revenueMax?: number | null };

const GROWTH_WEIGHT = 100; // dominates
const REVENUE_TIEBREAK = 5; // smaller magnitude than a typical growth contribution (true tiebreak)

export function prerankScore(c: PrerankCompany, bands: RevenueBands): number {
  let s = 0;
  const g = c.headcountGrowth12mo;
  if (typeof g === "number" && Number.isFinite(g)) {
    // Clamp absurd values; positive boosts, negative demotes, missing stays 0.
    const clamped = Math.max(-1, Math.min(1, g));
    s += clamped * GROWTH_WEIGHT;
  }
  const r = c.revenue;
  if (typeof r === "number" && Number.isFinite(r) && r > 0) {
    const min = bands.revenueMin ?? null;
    const max = bands.revenueMax ?? null;
    const inBand = (min == null || r >= min) && (max == null || r <= max);
    s += inBand ? REVENUE_TIEBREAK : -REVENUE_TIEBREAK;
  }
  return s;
}

/** Stable descending sort by prerank score (ties keep input order). */
export function prerank<T extends PrerankCompany>(companies: T[], bands: RevenueBands): T[] {
  return companies
    .map((c, i) => ({ c, i, score: prerankScore(c, bands) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.c);
}
