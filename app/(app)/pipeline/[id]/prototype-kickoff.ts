"use server";
// Stage 0 of the staged prototype-brief engine: read the deal's discovery report
// modules + discussion-call notes and propose a ranked target with a confidence
// verdict. The modal pre-selects the winner when obvious, or asks when torn.
import { auth } from "@/auth";
import { generate } from "@/lib/ai";
import { buildDealContext } from "@/lib/deal-context";
import { loadDealDriveFiles } from "@/lib/deal-drive-context";
import { parseJsonBlock, decideKickoff } from "@/lib/prototype-brief/parse";
import type { KickoffProposal, KickoffCandidate } from "@/lib/prototype-brief/types";

export async function proposePrototypeKickoff(
  dealId: string,
): Promise<{
  mode: "preselect" | "ask";
  preselected?: KickoffCandidate;
  options: KickoffCandidate[];
  reason: string;
}> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const { context } = await buildDealContext(dealId);
  const corpus = await loadDealDriveFiles(dealId);

  const intake = [
    "## Deal corpus (discovery report + discussion-call notes are load-bearing)",
    corpus.text || "No readable client files found in the deal's Drive folder.",
  ].join("\n");

  const raw = await generate({ skill: "prototype-kickoff", context, intake, maxTokens: 1500 });
  const proposal = parseJsonBlock<KickoffProposal>(raw, [
    "candidates",
    "preselectedId",
    "confidence",
    "reason",
  ]);

  const decision = decideKickoff(proposal);
  return { ...decision, reason: proposal.reason };
}
