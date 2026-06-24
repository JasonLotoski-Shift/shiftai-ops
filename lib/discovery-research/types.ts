// lib/discovery-research/types.ts
// Intermediate types the discovery-questionnaire chain passes between rounds.
// Round 1 emits a BusinessAreaMap; rounds 2-3 emit QuestionPools of
// CandidateQuestions; round 4 (the discovery-questionnaire assembler) turns those
// candidates into the canonical SurveyQuestion[] that lib/tally.ts consumes.
// These shapes are internal scaffolding — never the client-facing form.

import type { SurveyQuestionType } from "@/lib/survey";

// The seven business functions the research maps, plus a catch-all. Hyphenated
// to read cleanly in the model's JSON; this is NOT a Prisma enum.
export type BusinessFunction =
  | "operations"
  | "finance"
  | "sales-marketing"
  | "supply-chain"
  | "people-hr"
  | "it-systems"
  | "leadership"
  | "other";

// What round 1 establishes about one function — and, critically, what it still
// does not know (the gaps a questionnaire exists to close).
export type FunctionRead = {
  function: BusinessFunction;
  whatWeKnow: string;
  signals: string[];
  confidence: "high" | "medium" | "low";
  gaps: string[];
};

// Round 1 output: a structured read of the whole company across every function.
export type BusinessAreaMap = {
  vertical: string;
  companyShape: string;
  functions: FunctionRead[];
  /** ONLY what was actually discussed on the call — round 2 anchors here. */
  discussedOnCall: string[];
  crossCutting: string[];
  openGaps: string[];
};

// One candidate question from round 2 (call-anchored) or round 3 (whole-company).
// Carries the metadata the assembler uses to dedupe, ground, and balance — the
// final SurveyQuestion (label, not draftLabel) is produced in round 4.
export type CandidateQuestion = {
  section?: string;
  intent?: string;
  draftLabel: string;
  type: SurveyQuestionType;
  options?: string[];
  /** Both pools tag this so round 4 can balance coverage across the whole form. */
  function?: BusinessFunction;
  groundedIn?: string;
};

// Rounds 2 and 3 wrap their candidates in an object (parseJsonBlock requires a
// top-level object key; a bare array would fail its required-key check).
export type QuestionPool = { questions: CandidateQuestion[] };
