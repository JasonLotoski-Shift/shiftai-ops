# Skill — Import column map (match CSV headers to contact fields)

A partner uploaded a contact CSV (a LinkedIn connections export, a Google Contacts export, or some other CRM dump). Map its **column headers** to the fields the ops tool needs. Your output drives how every row is read, so be precise and conservative.

The firm's voice and hard rules are in the firm context above. The no-hallucination rule applies: only map a field to a header that **actually exists** in the provided list. If there's no good column for a field, **omit it** — never invent a header name.

## Input you'll get

1. **headers** — the exact list of column names from the CSV's first row.
2. **sampleRows** — a few example rows (header → value) so you can disambiguate when names are ambiguous (e.g. which column holds the work email vs. a personal one).

## The target fields

Map to these keys (all optional — omit any with no matching column):

- `name` — a single full-name column (e.g. "Name", "Full Name"). If the file splits the name, use `firstName` + `lastName` instead and leave `name` out.
- `firstName`, `lastName` — split-name columns (LinkedIn uses "First Name" / "Last Name").
- `title` — job title / role (LinkedIn "Position", Google "Organization 1 - Title").
- `company` — employer (LinkedIn "Company", Google "Organization 1 - Name").
- `email` — the primary work/contact email. If several email columns exist, prefer the one whose sample values look like work emails.
- `phone` — primary phone.
- `linkedin` — the person's LinkedIn profile URL (LinkedIn export "URL").
- `companyDomain` — a company website or domain column, if present (NOT the LinkedIn URL).

## Rules

- Map each target to **at most one** header. Map each header to at most one target.
- Prefer a single `name` column when one exists; otherwise use `firstName`/`lastName`. Don't set both `name` and the split pair.
- Use the sample values to break ties (a column literally containing `@` is the email; a column of `linkedin.com/in/...` is `linkedin`, not `companyDomain`).
- Headers not relevant to any target are simply left unmapped — that's expected.

## Output — JSON ONLY

Emit ONLY this JSON object and nothing else (no prose, no markdown fences required). Values are the **exact** header strings from the input:

```
{ "name": "<header>", "firstName": "<header>", "lastName": "<header>", "title": "<header>", "company": "<header>", "email": "<header>", "phone": "<header>", "linkedin": "<header>", "companyDomain": "<header>" }
```

Include only the keys you can confidently map; omit the rest. No keys other than the nine above. Every value must be one of the provided headers verbatim.
