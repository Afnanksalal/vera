import { sha256 } from "./canonical";
import { decideClaim } from "./decide";
import { callToolRaw, type ToolName } from "./tools";
import type { Challenge, Proposal, Sale, World } from "./types";

/**
 * Independent adversary. For every proposal it (1) re-runs each cited tool from
 * scratch and challenges any evidence whose hash does not reproduce (tamper),
 * and (2) re-derives the correct decision from raw data and challenges any
 * proposal whose action or code disagrees. It never trusts the closer's output.
 */
export function runChallenger(world: World, proposals: Proposal[]): Challenge[] {
  const challenges: Challenge[] = [];
  const salesById = new Map<string, Sale>(world.sales.map((s) => [s.sale_id, s]));

  for (const proposal of proposals) {
    let tampered = false;
    for (const ev of proposal.evidence) {
      let fresh: unknown;
      try {
        fresh = callToolRaw(world, ev.tool as ToolName, ev.args);
      } catch {
        challenges.push({ claim_id: proposal.claim_id, reason: `tool_error:${ev.tool}` });
        tampered = true;
        break;
      }
      if (sha256(fresh) !== ev.result_hash) {
        challenges.push({ claim_id: proposal.claim_id, reason: `replay_mismatch:${ev.tool}` });
        tampered = true;
        break;
      }
    }
    if (tampered) continue;

    const sale = salesById.get(proposal.sale_id);
    if (!sale) {
      challenges.push({ claim_id: proposal.claim_id, reason: "unknown_sale" });
      continue;
    }
    const truth = decideClaim(world, sale, proposal.type);
    const disagrees =
      truth.action !== proposal.action ||
      (truth.action === "except" && truth.code !== proposal.code);
    if (disagrees) {
      challenges.push({
        claim_id: proposal.claim_id,
        reason: `audit_disagree:${truth.action}${truth.code ? `:${truth.code}` : ""}`,
      });
    }
  }

  return challenges;
}
