import { discoverDeterministic, extractFeatures, proposeAnomalyWithModel } from "@/mandate/anomaly";
import { reconcileDeterministic, reconcileWithModel } from "@/mandate/matching/reconcile";
import type { MatchItem, MatchProblem } from "@/mandate/matching/solver";
import { ingest } from "@/mandate/adapters";
import type { World } from "@/mandate/types";
import { modelForUser } from "./settings";
import { recordsForUser } from "./ledger";
import { HttpError } from "./http";
import { calibrationStatus } from "./calibration";
import { scoreCredits } from "@/mandate/matching/fuzzy";

function tokens(value: string): string[] {
  return [...new Set(value.toUpperCase().split(/[^A-Z0-9_-]+/).filter((part) => part.length >= 3))].slice(0, 24);
}

export function worldForUser(userId: string): World {
  const records = recordsForUser(userId);
  if (!records.length) throw new HttpError(400, "Ingest records before running analysis.", "empty");
  return ingest(records);
}

export function matchingProblem(world: World, tolerancePaise = 100, windowDays = 2): MatchProblem {
  const units: MatchItem[] = world.settlements.map((settlement) => ({
    id: settlement.settlement_id,
    amount_paise: settlement.net_paise,
    date: settlement.settled_on,
    label: settlement.psp_ref,
    tokens: tokens(settlement.psp_ref),
  }));
  const credits: MatchItem[] = world.bank.map((line) => ({
    id: line.bank_id,
    amount_paise: line.amount_paise,
    date: line.date,
    label: line.narration,
    tokens: tokens(`${line.narration} ${line.intent_id ?? ""}`),
  }));
  return { units, credits, tolerance_paise: tolerancePaise, window_days: windowDays };
}

export async function analyzeUser(
  userId: string,
  opts: { ai?: boolean; tolerance_paise?: number; window_days?: number } = {}
) {
  const world = worldForUser(userId);
  const tolerance = Number.isInteger(opts.tolerance_paise) ? Math.max(0, Math.min(10_000, opts.tolerance_paise!)) : 100;
  const windowDays = Number.isInteger(opts.window_days) ? Math.max(0, Math.min(30, opts.window_days!)) : 2;
  const problem = matchingProblem(world, tolerance, windowDays);
  const model = opts.ai ? modelForUser(userId) : null;
  if (opts.ai && !model) throw new HttpError(400, "Configure an AI provider in Settings first.", "ai_not_configured");
  const reconciliation = model ? await reconcileWithModel(model, problem) : reconcileDeterministic(problem);
  const features = extractFeatures(world);
  const deterministic = discoverDeterministic(features);
  const modelAnomaly = model ? await proposeAnomalyWithModel(model, features) : null;
  const risk = calibrationStatus(userId);
  const scored = scoreCredits(problem);
  const threshold = risk.calibration?.threshold ?? null;
  const acceptedMatches = threshold === null ? [] : scored.filter((match) => match.score <= threshold);
  const acceptedIds = new Set(acceptedMatches.map((match) => match.credit_id));
  return {
    generated_at: new Date().toISOString(),
    source: { sales: world.sales.length, settlements: problem.units.length, bank_credits: problem.credits.length },
    controls: { tolerance_paise: tolerance, window_days: windowDays, policy: "accept exact verified assignments; abstain on ambiguity" },
    risk: {
      calibration_rows: risk.rows,
      calibration: risk.calibration,
      candidates: scored.length,
      accepted: acceptedMatches.length,
      abstained: scored.length - acceptedMatches.length,
      accepted_matches: acceptedMatches,
      abstained_credit_ids: scored.filter((match) => !acceptedIds.has(match.credit_id)).map((match) => match.credit_id),
    },
    reconciliation,
    anomalies: {
      deterministic,
      model: modelAnomaly,
    },
    ai: model ? { enabled: true, model: model.name } : { enabled: false, model: null },
  };
}
