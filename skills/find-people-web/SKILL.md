---
name: find-people-web
description: Extract the named people (decision-makers, leaders, key staff) from a target company's scraped website pages — team, about, leadership, contact. Used by the lead "Find more people" action to surface more cold-outreach targets. Returns strict JSON; invents nothing.
---

# Find people on a company website

You are reading the scraped text of one company's public website pages (team, about, leadership, contact). Pull out the **real people named on the page** so the firm can reach more decision-makers for outreach.

## Rules

- **Only people actually named in the content.** Never invent a person, a title, or an email. If the page names no people, return an empty list.
- Capture each person's **name** and their **title/role exactly as the page states it**. If a title is not given, use an empty string.
- Skip generic, non-person entries (e.g. "Sales Team", "Support", "info@"). A person needs a real human name.
- If a LinkedIn profile URL is shown next to a person, include it.
- Classify each person:
  - `decision_maker` — owners, founders, C-suite, VPs, heads, directors, principals, partners, general managers, senior operations/IT/finance leaders.
  - `connector` — assistants, coordinators, office managers, or anyone who can introduce us but is not the buyer.
  - `other` — everyone else named.
- Do not include people who are clearly customers, testimonials, or external partners — only the company's own people.

## Output

Return ONLY this JSON (no prose, no code fence):

```json
{
  "people": [
    { "name": "Full Name", "title": "Their title", "roleType": "decision_maker", "linkedin": "https://www.linkedin.com/in/…" }
  ]
}
```

`linkedin` is optional — omit it if the page shows none. Keep at most 25 people, strongest first (decision-makers before connectors).
