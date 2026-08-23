import { sha256 } from "./canonical";
import { decideClaim } from "./decide";
import { callToolRaw, rowExists, type ToolName } from "./tools";
import type { Transcript } from "./transcript";
import type { Challenge, Claim, Proposal, Sale, World } from "./types";

export type VerifierInput = {
  world: World;
  transcript: Transcript;
  sales: Map<string, Sale>;
  proposals: Proposal[];
  challenges: Challenge[];
};

export type VerdictReason =
  | "ok"
  | "evidence_missing_in_transcript"
  | "evidence_hash_mismatch"
  | "unknown_row_id"
  | "no_evidence"
  | "action_disagrees_with_audit"
  | "unresolved_challenge";

export type Verdict = {
  claim_id: string;
  accepted: boolean;
  reason: VerdictReason;
};

const KNOWN_TOOLS = new Set<ToolName>([
  "get_intent",
  "verify_intent_sig",
  "get_cart",
  "verify_cart_sig",
  "cart_within_intent",
  "get_payment",
  "find_payment_by_idempotency",
  "get_receipt",
  "settlement_for_payment",
  "bank_candidates",
  "refunds_for_payment",
]);

/**
 * The only component allowed to set claim status. It re-derives the correct
 * decision from raw data, then only accepts a proposal whose evidence is
 * present in the transcript, hashes match a fresh tool run, cites real rows,
 * has no open challenge, and agrees with the independent audit.
 */
export function verify(input: VerifierInput): { claims: Claim[]; verdicts: Verdict[] } {
  const { world, transcript, sales, proposals, challenges } = input;
  const openChallenges = new Set(challenges.map((c) => c.claim_id));
  const claims: Claim[] = [];
  const verdicts: Verdict[] = [];

  for (const proposal of proposals) {
    const sale = sales.get(proposal.sale_id);
    if (!sale) {
      claims.push(mkClaim(proposal, "OPEN", "unknown sale"));
      verdicts.push({ claim_id: proposal.claim_id, accepted: false, reason: "no_evidence" });
      continue;
    }

    const reason = check(world, transcript, sale, proposal, openChallenges);
    if (reason !== "ok") {
      claims.push(mkClaim(proposal, "OPEN", reason));
      verdicts.push({ claim_id: proposal.claim_id, accepted: false, reason });
      continue;
    }

    const status = proposal.action === "prove" ? "PROVEN" : "EXCEPTED";
    claims.push({
      claim_id: proposal.claim_id,
      sale_id: proposal.sale_id,
      type: proposal.type,
      status,
      code: proposal.action === "except" ? proposal.code : undefined,
      accepted_by: "verifier",
    });
    verdicts.push({ claim_id: proposal.claim_id, accepted: true, reason: "ok" });
  }

  return { claims, verdicts };
}

function check(
  world: World,
  transcript: Transcript,
  sale: Sale,
  proposal: Proposal,
  openChallenges: Set<string>
): VerdictReason {
  if (openChallenges.has(proposal.claim_id)) return "unresolved_challenge";
  if (proposal.evidence.length === 0) return "no_evidence";

  for (const ev of proposal.evidence) {
    if (!KNOWN_TOOLS.has(ev.tool as ToolName)) return "evidence_hash_mismatch";
    const argsHash = sha256(ev.args);

    // Evidence must have been produced by the closer during this run.
    if (!transcript.has("closer", ev.tool as ToolName, argsHash, ev.result_hash)) {
      return "evidence_missing_in_transcript";
    }

    // Independently re-run the tool; the hash must match (anti-tamper).
    const fresh = callToolRaw(world, ev.tool as ToolName, ev.args);
    if (sha256(fresh) !== ev.result_hash) return "evidence_hash_mismatch";

    for (const id of ev.row_ids) {
      if (!rowExists(world, id)) return "unknown_row_id";
    }
  }

  // Re-derive the correct decision from raw data and require agreement.
  const truth = decideClaim(world, sale, proposal.type);
  if (truth.action !== proposal.action) return "action_disagrees_with_audit";
  if (truth.action === "except" && truth.code !== proposal.code) {
    return "action_disagrees_with_audit";
  }
  return "ok";
}

function mkClaim(proposal: Proposal, status: Claim["status"], reject_reason: string): Claim {
  return {
    claim_id: proposal.claim_id,
    sale_id: proposal.sale_id,
    type: proposal.type,
    status,
    reject_reason,
  };
}
