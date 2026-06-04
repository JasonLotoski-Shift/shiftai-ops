import assert from "node:assert/strict";
import { mapSearchOrg } from "@/lib/apollo";

// Full org -> ApolloCompany mapping, including the new growth/revenue fields.
const org = {
  name: "Mevotech",
  primary_domain: "mevotech.com",
  website_url: "https://www.mevotech.com",
  organization_revenue: 37200000,
  organization_headcount_twelve_month_growth: 0.0415,
  estimated_num_employees: 300,
  industry: "automotive",
};
const c = mapSearchOrg(org);
assert.equal(c.domain, "mevotech.com");
assert.equal(c.revenue, 37200000);
assert.equal(c.headcountGrowth12mo, 0.0415);

// Missing growth/revenue must be undefined (NOT 0) so the pre-rank can treat them as neutral.
const sparse = mapSearchOrg({ name: "X", primary_domain: "x.com" });
assert.equal(sparse.revenue, undefined);
assert.equal(sparse.headcountGrowth12mo, undefined);

// A row with no usable domain maps to empty domain (caller filters it).
assert.equal(mapSearchOrg({ name: "No Domain" }).domain, "");

console.log("apollo.test.ts PASS");
