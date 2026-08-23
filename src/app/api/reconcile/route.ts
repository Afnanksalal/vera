import { NextResponse } from "next/server";
import { getModelFromEnv, modelStatus } from "@/mandate/llm";
import { buildMatchFixture } from "@/mandate/matching/fixture";
import { reconcileDeterministic, reconcileWithModel } from "@/mandate/matching/reconcile";
import { inr } from "@/mandate/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { seed?: number; llm?: boolean } = {};
  try {
    body = (await req.json()) as { seed?: number; llm?: boolean };
  } catch {
    /* empty body ok */
  }
  const seed = Number.isInteger(body.seed) ? (body.seed as number) : 42;
  const { problem, key } = buildMatchFixture({ seed });

  const model = body.llm ? getModelFromEnv() : null;
  const run = model ? await reconcileWithModel(model, problem) : reconcileDeterministic(problem);

  return NextResponse.json({
    source: run.source,
    provider: model ? modelStatus().provider : null,
    credits: problem.credits.length,
    units: problem.units.length,
    matched: run.coverage.matched,
    n_to_one: run.matches.filter((m) => m.unit_ids.length > 1).length,
    matched_value: inr(run.matched_value_paise),
    ambiguous: run.ambiguous_credit_ids,
    unexplained: run.unexplained_credit_ids,
    beyond_solver_planted: key.beyond_solver_credit_ids,
    verify_ok: run.verify.ok,
    matches: run.matches,
  });
}
