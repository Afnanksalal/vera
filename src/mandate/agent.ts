import { sha256 } from "./canonical";
import type { ChatMessage, ChatModel, ToolCall } from "./llm";
import { TOOL_SPECS } from "./llm";
import { rowIdsOf, TOOLS, type ToolName } from "./tools";
import type { Transcript } from "./transcript";
import {
  CLAIM_TYPES,
  EXCEPTION_CODES,
  type ClaimType,
  type Evidence,
  type ExceptionCode,
  type Proposal,
  type Sale,
  type World,
} from "./types";

export const MAX_MODEL_STEPS = 8;

const READ_TOOLS = new Set<string>(TOOL_SPECS.map((t) => t.name).filter((n) => n !== "submit_verdict"));

const SYSTEM = [
  "You are Vera, an AI auditor for agent-originated purchases.",
  "You investigate ONE claim about ONE sale by calling tools to gather evidence, then you call submit_verdict.",
  "Rules:",
  "- Never guess amounts or facts. Read them with tools.",
  "- Call only the tools you need for this claim, then submit_verdict.",
  "- action is 'prove' if the claim holds, 'except' if it is violated.",
  "- When 'except', pick the single most specific code.",
  "Claim meanings:",
  "- AUTHORIZED: intent signature valid AND cart within the intent budget, category, and time window. Else MANDATE_OVERSPEND (budget/category) or MANDATE_EXPIRED (time).",
  "- CART_BOUND: merchant signature valid, cart hash matches, and payment amount equals the cart total. Else CART_PAYMENT_MISMATCH.",
  "- RECEIPTED: a stored receipt exists. Else RECEIPT_ABSENT.",
  "- IDEMPOTENT: exactly one payment for the idempotency key. Else RETRY_DOUBLE_BOOK.",
  "- SETTLED: settlement net equals payment amount. Else SETTLEMENT_DRIFT.",
  "- BANKED: exactly one bank credit tagged to this intent. Else CHANNEL_UNTAGGED.",
  "- REFUND_POLICY: refunds (if any) carry a mandate_ref and there is no chargeback-plus-other collision. Else ORPHAN_REFUND or DOUBLE_REFUND.",
].join("\n");

export type Investigation = {
  proposal: Proposal | null;
  rationale: string;
  toolCalls: number;
  transcriptToolCalls: { tool: string; args: Record<string, unknown> }[];
  abstainReason?: string;
};

/** One claim, investigated by the model through a bounded tool-use loop. */
export async function investigateClaim(
  model: ChatModel,
  world: World,
  sale: Sale,
  type: ClaimType,
  transcript: Transcript
): Promise<Investigation> {
  const claim_id = `${sale.sale_id}:${type}`;
  const context = {
    sale_id: sale.sale_id,
    intent_id: sale.intent_id,
    cart_id: sale.cart_id,
    payment_id: sale.payment_id,
    settlement_id: sale.settlement_id,
    claim_type: type,
  };
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content:
        `Investigate the ${type} claim. Context (use these ids):\n` +
        JSON.stringify(context) +
        `\nGather evidence with tools, then call submit_verdict.`,
    },
  ];

  const evidence: Evidence[] = [];
  const seen = new Set<string>();
  const toolLog: { tool: string; args: Record<string, unknown> }[] = [];
  let calls = 0;

  for (let step = 0; step < MAX_MODEL_STEPS; step++) {
    const completion = await model.complete(messages, TOOL_SPECS);
    const toolCalls = completion.tool_calls ?? [];

    if (toolCalls.length === 0) {
      messages.push({ role: "assistant", content: completion.content ?? "" });
      messages.push({ role: "user", content: "Call submit_verdict now with your decision." });
      continue;
    }

    messages.push({ role: "assistant", content: completion.content ?? null, tool_calls: toolCalls });

    let verdict: { action: "prove" | "except"; code?: ExceptionCode; rationale: string } | null = null;

    for (const tc of toolCalls) {
      if (tc.name === "submit_verdict") {
        verdict = readVerdict(tc);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.name,
          content: JSON.stringify({ received: true }),
        });
        continue;
      }
      if (!READ_TOOLS.has(tc.name) || !(tc.name in TOOLS)) {
        messages.push({ role: "tool", tool_call_id: tc.id, name: tc.name, content: JSON.stringify({ error: "unknown tool" }) });
        continue;
      }
      let result: unknown;
      try {
        result = transcript.call("closer", tc.name as ToolName, tc.args);
      } catch (err) {
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.name,
          content: JSON.stringify({ error: String(err) }),
        });
        continue;
      }
      calls += 1;
      toolLog.push({ tool: tc.name, args: tc.args });
      const key = `${tc.name}:${sha256(tc.args)}`;
      if (!seen.has(key)) {
        seen.add(key);
        evidence.push({
          tool: tc.name,
          args: tc.args,
          result_hash: sha256(result),
          row_ids: rowIdsOf(result),
        });
      }
      messages.push({ role: "tool", tool_call_id: tc.id, name: tc.name, content: JSON.stringify(result) });
    }

    if (verdict) {
      if (evidence.length === 0) {
        return {
          proposal: null,
          rationale: verdict.rationale,
          toolCalls: calls,
          transcriptToolCalls: toolLog,
          abstainReason: "verdict_without_evidence",
        };
      }
      const proposal: Proposal = {
        claim_id,
        sale_id: sale.sale_id,
        type,
        action: verdict.action,
        code: verdict.action === "except" ? verdict.code : undefined,
        evidence,
      };
      return { proposal, rationale: verdict.rationale, toolCalls: calls, transcriptToolCalls: toolLog };
    }
  }

  return {
    proposal: null,
    rationale: "step budget exhausted",
    toolCalls: calls,
    transcriptToolCalls: toolLog,
    abstainReason: "step_budget_exhausted",
  };
}

function readVerdict(tc: ToolCall): { action: "prove" | "except"; code?: ExceptionCode; rationale: string } {
  const action = tc.args.action === "except" ? "except" : "prove";
  const rawCode = typeof tc.args.code === "string" ? tc.args.code : undefined;
  const code = EXCEPTION_CODES.includes(rawCode as ExceptionCode) ? (rawCode as ExceptionCode) : undefined;
  const rationale = typeof tc.args.rationale === "string" ? tc.args.rationale : "";
  return { action, code, rationale };
}

export type SaleInvestigation = {
  sale_id: string;
  claims: {
    type: ClaimType;
    action: "prove" | "except" | "abstain";
    code?: ExceptionCode;
    rationale: string;
  }[];
  toolCalls: number;
};

/** Investigate all seven claims of one sale with the model (used by the API). */
export async function investigateSale(
  model: ChatModel,
  world: World,
  sale: Sale,
  transcript: Transcript
): Promise<{ proposals: Proposal[]; report: SaleInvestigation }> {
  const proposals: Proposal[] = [];
  const report: SaleInvestigation = { sale_id: sale.sale_id, claims: [], toolCalls: 0 };
  for (const type of CLAIM_TYPES) {
    const inv = await investigateClaim(model, world, sale, type, transcript);
    report.toolCalls += inv.toolCalls;
    if (inv.proposal) {
      proposals.push(inv.proposal);
      report.claims.push({
        type,
        action: inv.proposal.action,
        code: inv.proposal.code,
        rationale: inv.rationale,
      });
    } else {
      report.claims.push({ type, action: "abstain", rationale: inv.rationale });
    }
  }
  return { proposals, report };
}
