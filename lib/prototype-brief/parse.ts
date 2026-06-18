// lib/prototype-brief/parse.ts
import type { KickoffProposal, KickoffCandidate } from "@/lib/prototype-brief/types";

/** Strip an optional ```json … ``` fence, parse, and assert required top-level keys. */
export function parseJsonBlock<T>(raw: string, requiredKeys: string[]): T {
  const t = raw.trim();
  const m = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  const body = (m ? m[1] : t).trim();
  let obj: unknown;
  try {
    obj = JSON.parse(body);
  } catch (e) {
    throw new Error(`could not parse model JSON: ${e instanceof Error ? e.message : "unknown"}`);
  }
  if (obj === null || typeof obj !== "object") {
    throw new Error("model JSON is not an object");
  }
  for (const k of requiredKeys) {
    if (!(k in (obj as Record<string, unknown>))) {
      throw new Error(`model JSON missing key: ${k}`);
    }
  }
  return obj as T;
}

/** Decide whether to pre-select the inferred winner or ask the partner. */
export function decideKickoff(
  p: KickoffProposal,
): { mode: "preselect" | "ask"; preselected?: KickoffCandidate; options: KickoffCandidate[] } {
  const options = [...p.candidates].sort((a, b) => a.rank - b.rank);
  const preselected = p.preselectedId
    ? options.find((c) => c.id === p.preselectedId)
    : undefined;
  if (p.confidence === "clear" && preselected) {
    return { mode: "preselect", preselected, options };
  }
  return { mode: "ask", options };
}
