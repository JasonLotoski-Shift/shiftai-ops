// lib/feature-area-taxonomy.ts
//
// The list of app areas a Feature Request / Fix can be filed against. Drives
// the create form's tab dropdown + its dependent sub-tab menu, and the area
// pill on each board card.
//
// Why a hand-maintained constant and not derived live from the sidebar:
//   • the sidebar mixes role-gating, collapsibility, and unread badges — the
//     form shouldn't couple to any of that;
//   • we want a few areas the sidebar doesn't list: detail-page sub-tabs
//     ("Deal detail", "Project detail", …) and the cross-cutting option.
// When you add or rename a tab in the app, add/rename it here too.
//
// Client-safe (no server imports) — used by the board client component and the
// server actions for validation.

/** Sentinel key for items that aren't about any one tab (auth, speed, design…). */
export const APP_WIDE_AREA = "__app__";

export type FeatureArea = {
  /** Stable key stored on the FeatureRequest row (route slug, or "__app__"). */
  key: string;
  /** Human label shown in the dropdown + pill. */
  label: string;
  /** Sub-tabs/sections inside this tab; empty = no dependent sub-menu. */
  subTabs: string[];
};

export const FEATURE_AREAS: FeatureArea[] = [
  { key: APP_WIDE_AREA, label: "Whole app / cross-cutting", subTabs: [] },
  { key: "dashboard", label: "Dashboard", subTabs: [] },
  { key: "tasks", label: "Task Board", subTabs: [] },
  {
    key: "pipeline",
    label: "Pipeline",
    subTabs: ["Board", "AI Found Leads", "Promoted Leads", "Cold email sent", "Deal detail", "Lead detail"],
  },
  { key: "projects", label: "Projects", subTabs: ["Overview", "Financials", "Project detail"] },
  { key: "service-contracts", label: "Service Contracts", subTabs: ["Contract detail"] },
  { key: "import", label: "Contacts (Import)", subTabs: [] },
  { key: "targeting", label: "AI Targeting", subTabs: [] },
  { key: "ingest", label: "Ingest", subTabs: [] },
  { key: "financials", label: "Financials", subTabs: ["Overview", "Partner economics"] },
  { key: "contacts", label: "Contacts List", subTabs: ["Contact detail"] },
  {
    key: "clients",
    label: "Clients List",
    subTabs: ["Company profile", "Timeline", "Engagement & billing", "Deliverables"],
  },
  { key: "messages", label: "Messages", subTabs: [] },
  { key: "invoices", label: "Invoices", subTabs: ["Invoice detail"] },
  { key: "whats-new", label: "What's new", subTabs: [] },
  { key: "how-it-works", label: "How it works", subTabs: [] },
  { key: "architecture", label: "Architecture", subTabs: [] },
  { key: "agents", label: "Agents & MCPs", subTabs: [] },
  { key: "settings", label: "Settings", subTabs: ["Firm", "System status"] },
];

const AREA_BY_KEY = new Map(FEATURE_AREAS.map((a) => [a.key, a]));

/** The area record for a key, or undefined if the key isn't known. */
export function findArea(key: string): FeatureArea | undefined {
  return AREA_BY_KEY.get(key);
}

/** Is this a known area key? */
export function isValidArea(key: string): boolean {
  return AREA_BY_KEY.has(key);
}

/** Sub-tabs for an area (empty array for unknown keys or tabs with none). */
export function subTabsFor(key: string): string[] {
  return AREA_BY_KEY.get(key)?.subTabs ?? [];
}

/** Does this sub-tab belong to this area? Empty/missing sub-tab is always valid. */
export function isValidSubTab(key: string, subTab: string | null | undefined): boolean {
  if (!subTab) return true;
  return subTabsFor(key).includes(subTab);
}

/** The label for an area key (falls back to the raw key if unknown). */
export function areaLabel(key: string): string {
  return AREA_BY_KEY.get(key)?.label ?? key;
}

/** Display string for a card pill, e.g. "Financials › Partner economics". */
export function areaDisplay(key: string, subTab?: string | null): string {
  const label = areaLabel(key);
  return subTab ? `${label} › ${subTab}` : label;
}
