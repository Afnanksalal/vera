import { sha256 } from "./canonical";
import { decideClaim } from "./decide";
import { PolicyPlanner, type Planner } from "./planner";
import { rowIdsOf } from "./tools";
import type { Transcript } from "./transcript";
import { CLAIM_TYPES, type Evidence, type Proposal, type Sale, type World } from "./types";

/** Stopping rule: a claim that needs more than this many tools is abstained. */
export const MAX_TOOLS_PER_CLAIM = 6;

export type CloserOutput = {
  proposals: Proposal[];
  abstained: { claim_id: string; reason: string }[];
  toolCallsPerSale: Record<string, number>;
  planner: string;
};

export function runCloser(
  world: World,
  transcript: Transcript,
  sales: Sale[],
  planner: Planner = new PolicyPlanner()
): CloserOutput {
  const proposals: Proposal[] = [];
  const abstained: { claim_id: string; reason: string }[] = [];
  const toolCallsPerSale: Record<string, number> = {};

  for (const sale of sales) {
    toolCallsPerSale[sale.sale_id] = 0;
    for (const type of CLAIM_TYPES) {
      const claim_id = `${sale.sale_id}:${type}`;
      const plan = planner.planFor(world, sale, type);
      if (plan.length > MAX_TOOLS_PER_CLAIM) {
        abstained.push({ claim_id, reason: "step_budget_exceeded" });
        continue;
      }

      const evidence: Evidence[] = [];
      for (const step of plan) {
        const result = transcript.call("closer", step.tool, step.args);
        toolCallsPerSale[sale.sale_id] += 1;
        evidence.push({
          tool: step.tool,
          args: step.args,
          result_hash: sha256(result),
          row_ids: rowIdsOf(result),
        });
      }

      const decision = decideClaim(world, sale, type);
      proposals.push({
        claim_id,
        sale_id: sale.sale_id,
        type,
        action: decision.action,
        code: decision.code,
        evidence,
      });
    }
  }

  return { proposals, abstained, toolCallsPerSale, planner: planner.name };
}
