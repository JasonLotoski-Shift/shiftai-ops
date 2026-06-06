# Skill — Lead discovery (TargetSegment → Apollo filters)

This is the **spec of record** for the deterministic mapping from a firm **TargetSegment** to Apollo's search filters. The pipeline (`lib/lead-discovery.ts`) encodes this mapping in code — this document is the canonical reference so the mapping stays consistent and reviewable. It is mostly mechanical; no creativity needed.

Apollo is the **primary** structured source for the Discovery Engine. Companies come from `mixed_companies/search`; people from `mixed_people/api_search`; the one work-email reveal per company comes from `people/match` (1 credit).

## 1. Segment → company filters (`/mixed_companies/search`)

| Segment field | Apollo param | Mapping rule |
|---|---|---|
| `geographies` | `organization_locations` | Pass the "Province/State, Country" or "Country" labels as-is — Apollo accepts these. |
| `employeeMin` / `employeeMax` | `organization_num_employees_ranges` | A single `"min,max"` string, e.g. `"50,500"`. If only one bound is set, pick a sensible open band: only a min → `"<min>,100000"`; only a max → `"1,<max>"`; neither set → omit the param entirely. |
| `industries` | `q_organization_keyword_tags` | Pass the industry tag strings directly. |

Revenue bands (`revenueMin`/`revenueMax`) are NOT a reliable company-search filter on Apollo and are used at the **rating** step instead, not here.

## 2. Segment personas → people filters (`/mixed_people/api_search`)

Each segment persona is `{ department, seniority }` from the firm's controlled vocab (`lib/data/apollo-taxonomy.ts`). Map:

- **seniority → `person_seniorities`** (Apollo's enum). Mapping:

  | Firm seniority | Apollo `person_seniorities` |
  |---|---|
  | Owner | `owner` |
  | Founder | `founder` |
  | C-Suite | `c_suite` |
  | Partner | `partner` |
  | VP | `vp` |
  | Head | `head` |
  | Director | `director` |
  | Manager | `manager` |
  | Senior | `senior` |
  | Entry | `entry` |

- **department → `person_titles` seed words.** Use the department to seed title keywords (Apollo matches loosely):

  | Firm department | Title seed words |
  |---|---|
  | Executive | CEO, President, Chief Executive |
  | Operations | Operations, COO, Ops |
  | Engineering | Engineering, CTO, Engineer |
  | Finance | Finance, CFO, Controller |
  | Sales | Sales, Revenue, CRO |
  | Marketing | Marketing, CMO, Brand |
  | IT | IT, Information Technology, CIO |
  | HR | HR, People, Human Resources |
  | Product | Product, CPO |
  | Legal | Legal, General Counsel |
  | Procurement | Procurement, Purchasing, Supply Chain |

- **geography** scopes the people search too: pass `geographies` as `organization_locations` (org-scoped) so people belong to companies in the segment's regions.
- Always scope by the candidate company: `q_organization_domains_list: [domain]`.

`name` on `api_search` results is frequently withheld/null — that is expected and free. Store name+title+`apolloPersonId` and reveal the email later.

## 3. Primary-person selection

Rank the returned people against the segment's personas, highest-priority persona first. Priority order of seniority for "who's the decision-maker we reach": **Owner / Founder / C-Suite → VP / Head → Director → Manager → Senior → Entry**. The top-ranked person (best title + seniority match to the highest-priority persona) is the **PRIMARY**. If nothing matches well, fall back to the first person returned.

## 4. Credit policy (HYBRID — decided)

- At discovery, reveal ONLY the **primary** contact's work email via `people/match` (1 credit). **Hard cap: 1 reveal per company per run.**
- Store every other candidate person as name + title (+ `apolloPersonId`) with `email: null` and `emailRevealed: false`, so a later "Reveal email" button can spend 1 credit on demand.
- Do not set `reveal_personal_emails` or `reveal_phone_number` — we want only the verified work email.

## Notes

- Auth is the `X-Api-Key` HEADER, never a URL param.
- Use `mixed_people/api_search` — the plain `mixed_people/search` is deprecated for API use.
- This skill is a reference doc; it is not invoked via `generate()` (the mapping is deterministic code).
