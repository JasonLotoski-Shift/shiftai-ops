// lib/survey.ts
// The structured question shape the discovery-questionnaire chain emits + the
// tolerant parser for the final round's JSON array. Deliberately free of
// prisma / drive / node-only imports so the discovery chain (and its unit test)
// can import it without dragging in the server-only Tally integration.
// lib/tally.ts re-exports these, so existing `@/lib/tally` importers are unchanged.

export type SurveyQuestionType =
  | "short_text" | "long_text" | "number" | "email"
  | "single_select" | "multi_select" | "dropdown"
  | "rating" | "linear_scale" | "ranking" | "file_upload";

export type SurveyQuestion = {
  type: SurveyQuestionType;
  label: string;
  options?: string[];
  required?: boolean;
  section?: string;
};

const Q_TYPES: SurveyQuestionType[] = [
  "short_text", "long_text", "number", "email", "single_select",
  "multi_select", "dropdown", "rating", "linear_scale", "ranking", "file_upload",
];
const NEEDS_OPTIONS = new Set<SurveyQuestionType>(["single_select", "multi_select", "dropdown", "ranking"]);

/** Parse + validate the skill's JSON array. Drops malformed items; never throws. */
export function parseQuestions(raw: string): SurveyQuestion[] {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("[")) {
    const s = text.indexOf("[");
    const e = text.lastIndexOf("]");
    if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
  }
  let arr: unknown;
  try {
    arr = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: SurveyQuestion[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const type = o.type as SurveyQuestionType;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!Q_TYPES.includes(type) || !label) continue;
    const options = Array.isArray(o.options)
      ? o.options.filter((x): x is string => typeof x === "string" && !!x.trim()).map((s) => s.trim())
      : undefined;
    if (NEEDS_OPTIONS.has(type) && (!options || options.length < 2)) continue; // a choice needs ≥2 real options
    out.push({
      type,
      label,
      options: options && options.length ? options : undefined,
      required: !!o.required,
      section: typeof o.section === "string" ? o.section.trim() : undefined,
    });
  }
  return out;
}
