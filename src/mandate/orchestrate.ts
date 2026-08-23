import { investigateSale } from "./agent";
import { runChallenger } from "./challenger";
import { runCloser } from "./closer";
import type { ChatModel } from "./llm";
import type { Planner } from "./planner";
import { Transcript } from "./transcript";
import { verify, type Verdict } from "./verifier";
import { CLAIM_TYPES, type Challenge, type Claim, type Proposal, type Sale, type World } from "./types";

export type RunResult = {
  claims: Claim[];
  proposals: Proposal[];
  challenges: Challenge[];
  verdicts: Verdict[];
  transcript: Transcript;
  toolCallsPerSale: Record<string, number>;
  planner: string;
};

/** Challenge, verify, and materialize the full claim grid from a set of proposals. */
export function finalizeClose(
  world: World,
  transcript: Transcript,
  proposals: Proposal[],
  toolCallsPerSale: Record<string, number>,
  planner: string,
  sales: Sale[] = world.sales
): RunResult {
  const salesById = new Map<string, Sale>(world.sales.map((s) => [s.sale_id, s]));
  const challenges = runChallenger(world, proposals);
  const { claims: committed, verdicts } = verify({
    world,
    transcript,
    sales: salesById,
    proposals,
    challenges,
  });

  const committedById = new Map(committed.map((c) => [c.claim_id, c]));
  const claims: Claim[] = [];
  for (const sale of sales) {
    for (const type of CLAIM_TYPES) {
      const claim_id = `${sale.sale_id}:${type}`;
      const found = committedById.get(claim_id);
      if (found && (found.status === "PROVEN" || found.status === "EXCEPTED")) {
        claims.push(found);
      } else {
        claims.push({
          claim_id,
          sale_id: sale.sale_id,
          type,
          status: "ABSTAINED",
          reject_reason: found?.reject_reason ?? "no_proposal",
        });
      }
    }
  }

  return { claims, proposals, challenges, verdicts, transcript, toolCallsPerSale, planner };
}

/** Deterministic close: the policy planner proposes, the verifier commits. */
export function runClose(world: World, planner?: Planner): RunResult {
  const transcript = new Transcript(world);
  const closer = runCloser(world, transcript, world.sales, planner);
  return finalizeClose(world, transcript, closer.proposals, closer.toolCallsPerSale, closer.planner);
}

/**
 * AI close: the model investigates each claim through tool use, then the same
 * verifier commits. A hallucinated verdict is rejected exactly like any other.
 */
export async function runCloseLLM(world: World, model: ChatModel, sales: Sale[] = world.sales): Promise<RunResult> {
  const transcript = new Transcript(world);
  const proposals: Proposal[] = [];
  const toolCallsPerSale: Record<string, number> = {};
  for (const sale of sales) {
    const { proposals: saleProposals, report } = await investigateSale(model, world, sale, transcript);
    proposals.push(...saleProposals);
    toolCallsPerSale[sale.sale_id] = report.toolCalls;
  }
  return finalizeClose(world, transcript, proposals, toolCallsPerSale, `llm:${model.name}`, sales);
}
