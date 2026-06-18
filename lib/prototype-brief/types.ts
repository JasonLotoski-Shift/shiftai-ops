// lib/prototype-brief/types.ts
// Shared types for the staged prototype-brief engine. Each LLM stage returns
// JSON matching one of these; lib/prototype-brief/parse.ts validates the shape.

/** One candidate target for the prototype — a module from the discovery report. */
export type KickoffCandidate = {
  /** Stable slug, e.g. "module-01-ai-dispatch". */
  id: string;
  /** Human title, e.g. "AI Dispatch + Runout Prediction". */
  title: string;
  /** The pain it solves, one line, grounded in the report. */
  pain: string;
  /** Why it ranks where it does (ROI / urgency), one line. */
  rationale: string;
  /** 1 = strongest. Dense rank over the candidates. */
  rank: number;
};

/** Stage 0 output: the ranked field + a confidence verdict on the winner. */
export type KickoffProposal = {
  /** Ranked candidates, 2–6. */
  candidates: KickoffCandidate[];
  /** The inferred winner's id, or null when genuinely torn. */
  preselectedId: string | null;
  /** "clear" = pre-select preselectedId; "torn" = ask the partner. */
  confidence: "clear" | "torn";
  /** One line: why this winner, or why it's torn. */
  reason: string;
};

/** What the partner confirms in the UI and hands to the chain. */
export type KickoffSeed = {
  candidate: KickoffCandidate;
  /** Optional partner nuance ("lean into X", a constraint). */
  steer?: string;
};

/** One ambitious solution direction (Stage 1). */
export type Direction = {
  title: string;
  /** The ONE interaction where AI does the hated hard thing, value in one click. */
  magicMoment: string;
  /** Where visuals carry the value (a live map / board / animated chart / before-after). */
  visualCenterpiece: string;
  /** Why a buyer leans in. */
  whyBuyerLeansIn: string;
  /** The 2–4 tabs this direction implies. */
  tabs: string[];
};

/** Stage 1 output: the interpreted signal + 2–3 directions. */
export type DirectionSet = {
  /** The interpreted signal sheet (markdown): pain in their words, workflow, user, data shape. */
  signal: string;
  directions: Direction[];
};

/** Stage 2 output: the chosen, sharpened winner + why the rest died. */
export type RedTeamVerdict = {
  winnerTitle: string;
  scores: { magicMoment: number; exactlyMyWorld: number; visualSpectacle: number };
  /** The improved winning direction the commit stage builds from. */
  sharpened: Direction;
  killed: { title: string; why: string }[];
};
