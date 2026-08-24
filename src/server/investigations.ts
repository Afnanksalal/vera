import { randomId } from "./crypto";
import { getDb, nowMs } from "./db";

export type InvestigationClaim = {
  type: string;
  ai_action: "prove" | "except" | "abstain";
  ai_code: string | null;
  rationale: string;
  verifier_accepted: boolean;
  verifier_reason: string;
  final_status: string;
  final_code: string | null;
};

export type AiInvestigation = {
  id: string;
  close_id: string | null;
  sale_id: string;
  model: string;
  tool_calls: number;
  claims: InvestigationClaim[];
  created_at: number;
};

type StoredResult = { tool_calls: number; claims: InvestigationClaim[] };

function materialize(row: {
  id: string;
  close_id: string | null;
  sale_id: string;
  model: string;
  result_json: string;
  created_at: number;
}): AiInvestigation {
  const result = JSON.parse(row.result_json) as StoredResult;
  return { id: row.id, close_id: row.close_id, sale_id: row.sale_id, model: row.model, created_at: row.created_at, ...result };
}

export function saveInvestigation(
  userId: string,
  input: { close_id: string | null; sale_id: string; model: string; tool_calls: number; claims: InvestigationClaim[] }
): AiInvestigation {
  const id = randomId("inv");
  const createdAt = nowMs();
  getDb().prepare(
    "INSERT INTO ai_investigations (id, user_id, close_id, sale_id, model, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, userId, input.close_id, input.sale_id, input.model, JSON.stringify({ tool_calls: input.tool_calls, claims: input.claims }), createdAt);
  return { id, close_id: input.close_id, sale_id: input.sale_id, model: input.model, tool_calls: input.tool_calls, claims: input.claims, created_at: createdAt };
}

export function latestInvestigations(userId: string, closeId: string): Map<string, AiInvestigation> {
  const rows = getDb().prepare(
    `SELECT id, close_id, sale_id, model, result_json, created_at
     FROM ai_investigations WHERE user_id = ? AND close_id = ?
     ORDER BY created_at DESC, rowid DESC`
  ).all(userId, closeId) as {
    id: string;
    close_id: string | null;
    sale_id: string;
    model: string;
    result_json: string;
    created_at: number;
  }[];
  const latest = new Map<string, AiInvestigation>();
  for (const row of rows) if (!latest.has(row.sale_id)) latest.set(row.sale_id, materialize(row));
  return latest;
}
