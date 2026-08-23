import { buildFixture, type FixtureConfig } from "./fixture";
import { BANK_WINDOW_DAYS } from "./decide";
import { callToolRaw } from "./tools";
import { runClose } from "./orchestrate";
import {
  FAULT_TARGET,
  type AnswerKeyEntry,
  type Claim,
  type Sale,
  type World,
} from "./types";

export const EVAL_GATES = {
  minClaims: 50,
  minClosureRate: 0.95,
  minPlantedRecall: 1.0,
  maxFalseProve: 0,
};

export type EvalReport = {
  seed: number;
  claimsProcessed: number;
  agentSales: number;
  plantedSales: number;
  closed: number;
  closureRate: number;
  plantedRecall: number;
  plantedCaught: number;
  falseProve: number;
  falseProveExamples: string[];
  openOrAbstained: string[];
  exceptionsByCode: Record<string, number>;
  challenges: number;
  toolCalls: { total: number; p50: number; p95: number };
  naive: { falseClean: number; caught: number };
  pass: boolean;
  gateFailures: string[];
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function naiveBaseline(world: World): { falseClean: number; caught: number } {
  // Amount + date join only, ignoring mandates/receipts/idempotency/refunds.
  let falseClean = 0;
  let caught = 0;
  for (const sale of world.sales) {
    if (!sale.fault) continue;
    const payment = world.payments.find((p) => p.payment_id === sale.payment_id)!;
    const settlement = world.settlements.find((s) => s.payment_id === sale.payment_id)!;
    const candidates = callToolRaw(world, "bank_candidates", {
      amount_paise: payment.amount_paise,
      date: settlement.settled_on,
      window_days: BANK_WINDOW_DAYS,
    }) as unknown[];
    const looksClean = candidates.length > 0;
    if (looksClean) falseClean += 1;
    else caught += 1;
  }
  return { falseClean, caught };
}

export function evaluate(config: Partial<FixtureConfig> = {}): EvalReport {
  const { world, answer_key } = buildFixture(config);
  const run = runClose(world);

  const claimById = new Map<string, Claim>(run.claims.map((c) => [c.claim_id, c]));
  const keyById = new Map<string, AnswerKeyEntry>(
    answer_key.map((k) => [`${k.sale_id}:${k.type}`, k])
  );

  const agentSales = world.sales.length;
  const plantedSales = world.sales.filter((s) => s.fault).length;

  let closed = 0;
  let falseProve = 0;
  const falseProveExamples: string[] = [];
  const openOrAbstained: string[] = [];
  const exceptionsByCode: Record<string, number> = {};

  for (const claim of run.claims) {
    if (claim.status === "PROVEN" || claim.status === "EXCEPTED") closed += 1;
    else openOrAbstained.push(`${claim.claim_id} (${claim.status}: ${claim.reject_reason ?? ""})`);

    if (claim.status === "EXCEPTED" && claim.code) {
      exceptionsByCode[claim.code] = (exceptionsByCode[claim.code] ?? 0) + 1;
    }

    const key = keyById.get(claim.claim_id);
    if (key && key.expected_status === "EXCEPTED" && claim.status === "PROVEN") {
      falseProve += 1;
      falseProveExamples.push(claim.claim_id);
    }
  }

  // Planted recall: each planted sale's targeted claim excepted with the right code.
  let plantedCaught = 0;
  for (const sale of world.sales as Sale[]) {
    if (!sale.fault) continue;
    const type = FAULT_TARGET[sale.fault];
    const claim = claimById.get(`${sale.sale_id}:${type}`);
    if (claim && claim.status === "EXCEPTED" && claim.code === sale.fault) {
      plantedCaught += 1;
    }
  }
  const plantedRecall = plantedSales === 0 ? 1 : plantedCaught / plantedSales;

  const toolValues = Object.values(run.toolCallsPerSale);
  const toolTotal = toolValues.reduce((a, b) => a + b, 0);

  const closureRate = run.claims.length === 0 ? 0 : closed / run.claims.length;
  const naive = naiveBaseline(world);

  const gateFailures: string[] = [];
  if (run.claims.length < EVAL_GATES.minClaims) gateFailures.push("minClaims");
  if (closureRate < EVAL_GATES.minClosureRate) gateFailures.push("minClosureRate");
  if (plantedRecall < EVAL_GATES.minPlantedRecall) gateFailures.push("minPlantedRecall");
  if (falseProve > EVAL_GATES.maxFalseProve) gateFailures.push("maxFalseProve");

  return {
    seed: world.seed,
    claimsProcessed: run.claims.length,
    agentSales,
    plantedSales,
    closed,
    closureRate,
    plantedRecall,
    plantedCaught,
    falseProve,
    falseProveExamples,
    openOrAbstained,
    exceptionsByCode,
    challenges: run.challenges.length,
    toolCalls: {
      total: toolTotal,
      p50: percentile(toolValues, 50),
      p95: percentile(toolValues, 95),
    },
    naive,
    pass: gateFailures.length === 0,
    gateFailures,
  };
}
