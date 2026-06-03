// Apollo-aligned department/seniority taxonomy for the persona builder.
// Interim static lists — reconciled with Apollo's exact enum values in Phase C
// (the discovery layer that wires segments to Apollo's people-search API).

export const DEPARTMENTS = [
  "Executive",
  "Operations",
  "Engineering",
  "Finance",
  "Sales",
  "Marketing",
  "IT",
  "HR",
  "Product",
  "Legal",
  "Procurement",
] as const;

export const SENIORITIES = [
  "Owner",
  "Founder",
  "C-Suite",
  "Partner",
  "VP",
  "Head",
  "Director",
  "Manager",
  "Senior",
  "Entry",
] as const;

export type Department = (typeof DEPARTMENTS)[number];
export type Seniority = (typeof SENIORITIES)[number];
