import type { ChatMessage, ChatModel, ChatToolSpec } from "../llm";
import {
  searchGroupingsDetailed,
  verifyAssignment,
  type Assignment,
  type MatchItem,
  type MatchProblem,
  type VerifyResult,
} from "./solver";

export type Match = {
  credit_id: string;
  unit_ids: string[];
  method: "exact-unique" | "propagated" | "model-verified";
  feasible_count: number;
  confidence: number;
};

export type ReconResult = {
  matches: Match[];
  ambiguous_credit_ids: string[];
  unexplained_credit_ids: string[];
  in_transit_unit_ids: string[];
  matched_value_paise: number;
  verify: VerifyResult;
  coverage: { credits: number; matched: number; abstained: number };
  source: string;
  search_truncated_credit_ids: string[];
};

function feasibleFor(problem: MatchProblem, credit: MatchItem, usedUnits: Set<string>) {
  const scoped: MatchProblem = {
    ...problem,
    units: problem.units.filter((u) => !usedUnits.has(u.id)),
  };
  return searchGroupingsDetailed(scoped, credit);
}

/**
 * Deterministic reconciliation by constraint propagation: repeatedly commit any
 * credit that currently has exactly one feasible grouping (which frees/uses
 * units and can make others unique). Credits left with several feasible
 * groupings are ambiguous and abstained; with none, unexplained. This is the
 * honest baseline the model must beat with semantic tie-breaks.
 */
export function reconcileDeterministic(problem: MatchProblem): ReconResult {
  const used = new Set<string>();
  const resolved = new Map<string, string[]>();
  const creditById = new Map(problem.credits.map((c) => [c.id, c]));
  const truncated = new Set<string>();

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const credit of problem.credits) {
      if (resolved.has(credit.id)) continue;
      const search = feasibleFor(problem, credit, used);
      if (search.truncated) truncated.add(credit.id);
      if (!search.truncated && search.groups.length === 1) {
        resolved.set(credit.id, search.groups[0]);
        search.groups[0].forEach((id) => used.add(id));
        progressed = true;
      }
    }
  }

  const ambiguous: string[] = [];
  const unexplained: string[] = [];
  for (const credit of problem.credits) {
    if (resolved.has(credit.id)) continue;
    const search = feasibleFor(problem, credit, used);
    if (search.truncated) truncated.add(credit.id);
    if (!search.truncated && search.groups.length === 0) unexplained.push(credit.id);
    else ambiguous.push(credit.id);
  }

  return assemble(problem, resolved, ambiguous, unexplained, used, "deterministic", creditById, undefined, truncated);
}

function assemble(
  problem: MatchProblem,
  resolved: Map<string, string[]>,
  ambiguous: string[],
  unexplained: string[],
  used: Set<string>,
  source: string,
  creditById: Map<string, MatchItem>,
  methodOverride?: Map<string, Match["method"]>,
  truncated = new Set<string>()
): ReconResult {
  const assignment: Assignment = [...resolved.entries()].map(([credit_id, unit_ids]) => ({ credit_id, unit_ids }));
  const verify = verifyAssignment(problem, assignment);

  const matches: Match[] = [...resolved.entries()].map(([credit_id, unit_ids]) => {
    const credit = creditById.get(credit_id)!;
    const search = feasibleFor(problem, credit, new Set([...used].filter((id) => !unit_ids.includes(id))));
    const feasible_count = Math.max(1, search.groups.length);
    return {
      credit_id,
      unit_ids,
      method: methodOverride?.get(credit_id) ?? (unit_ids.length === 1 ? "exact-unique" : "propagated"),
      feasible_count,
      confidence: 1 / feasible_count,
    };
  });

  const inTransit = problem.units.filter((u) => !used.has(u.id)).map((u) => u.id);

  return {
    matches,
    ambiguous_credit_ids: ambiguous,
    unexplained_credit_ids: unexplained,
    in_transit_unit_ids: inTransit,
    matched_value_paise: verify.matched_value_paise,
    verify,
    coverage: {
      credits: problem.credits.length,
      matched: resolved.size,
      abstained: ambiguous.length,
    },
    source,
    search_truncated_credit_ids: [...truncated],
  };
}

const PROPOSE_TOOL: ChatToolSpec = {
  name: "propose_matches",
  description:
    "Propose which settlement units make up each bank credit. Group units whose amounts sum to a credit within tolerance. Use only when confident; leave a credit out if unsure.",
  parameters: {
    type: "object",
    properties: {
      matches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            credit_id: { type: "string" },
            unit_ids: { type: "array", items: { type: "string" } },
          },
          required: ["credit_id", "unit_ids"],
        },
      },
    },
    required: ["matches"],
  },
};

/**
 * Model-guided reconciliation: the model proposes groupings using amounts,
 * dates, and any narration hints; each proposed group is independently verified
 * (exact sum, in-window, no reuse). Verified groups are committed; whatever the
 * model got wrong or skipped falls back to deterministic propagation. The model
 * can accelerate and disambiguate, but it can never book an unverified match.
 */
export async function reconcileWithModel(model: ChatModel, problem: MatchProblem): Promise<ReconResult> {
  const creditById = new Map(problem.credits.map((c) => [c.id, c]));
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You reconcile bank credits against settlement units. A credit is explained by a subset of units whose amounts sum to the credit within the given tolerance, dated within the window. Each unit belongs to at most one credit. When more than one subset sums correctly, break the tie using the shared counterparty tokens: prefer the grouping whose units share a token with the credit. Call propose_matches with the groupings you are confident about.",
    },
    {
      role: "user",
      content: JSON.stringify({
        tolerance_paise: problem.tolerance_paise,
        window_days: problem.window_days,
        credits: problem.credits.map((c) => ({ id: c.id, amount_paise: c.amount_paise, date: c.date, tokens: c.tokens ?? [] })),
        units: problem.units.map((u) => ({ id: u.id, amount_paise: u.amount_paise, date: u.date, tokens: u.tokens ?? [] })),
      }),
    },
  ];

  let proposed: { credit_id: string; unit_ids: string[] }[] = [];
  try {
    const completion = await model.complete(messages, [PROPOSE_TOOL]);
    const call = completion.tool_calls.find((t) => t.name === "propose_matches");
    const raw = call?.args?.matches;
    if (Array.isArray(raw)) {
      proposed = raw
        .map((m) => ({
          credit_id: typeof m?.credit_id === "string" ? m.credit_id : "",
          unit_ids: Array.isArray(m?.unit_ids) ? m.unit_ids.filter((x: unknown): x is string => typeof x === "string") : [],
        }))
        .filter((m) => m.credit_id && m.unit_ids.length > 0);
    }
  } catch {
    proposed = [];
  }

  // Commit only model groups that verify in isolation and reuse no unit.
  const used = new Set<string>();
  const resolved = new Map<string, string[]>();
  const method = new Map<string, Match["method"]>();
  const truncated = new Set<string>();
  for (const group of proposed) {
    if (resolved.has(group.credit_id)) continue;
    if (!creditById.has(group.credit_id)) continue;
    if (group.unit_ids.some((id) => used.has(id))) continue;
    const single: Assignment = [{ credit_id: group.credit_id, unit_ids: group.unit_ids }];
    const check = verifyAssignment(problem, single);
    if (check.ok) {
      resolved.set(group.credit_id, group.unit_ids);
      group.unit_ids.forEach((id) => used.add(id));
      method.set(group.credit_id, "model-verified");
    }
  }

  // Deterministic fallback for everything the model did not resolve.
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const credit of problem.credits) {
      if (resolved.has(credit.id)) continue;
      const search = feasibleFor(problem, credit, used);
      if (search.truncated) truncated.add(credit.id);
      if (!search.truncated && search.groups.length === 1) {
        resolved.set(credit.id, search.groups[0]);
        search.groups[0].forEach((id) => used.add(id));
        method.set(credit.id, "propagated");
        progressed = true;
      }
    }
  }

  const ambiguous: string[] = [];
  const unexplained: string[] = [];
  for (const credit of problem.credits) {
    if (resolved.has(credit.id)) continue;
    const search = feasibleFor(problem, credit, used);
    if (search.truncated) truncated.add(credit.id);
    if (!search.truncated && search.groups.length === 0) unexplained.push(credit.id);
    else ambiguous.push(credit.id);
  }

  return assemble(problem, resolved, ambiguous, unexplained, used, `llm:${model.name}`, creditById, method, truncated);
}
