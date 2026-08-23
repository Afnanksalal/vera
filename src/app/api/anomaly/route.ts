import { NextResponse } from "next/server";
import { discoverDeterministic, extractFeatures, proposeAnomalyWithModel } from "@/mandate/anomaly";
import { buildFixture } from "@/mandate/fixture";
import { getModelFromEnv, modelStatus } from "@/mandate/llm";

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
  const { world, anomaly_key } = buildFixture({ seed });
  const features = extractFeatures(world);

  const model = body.llm ? getModelFromEnv() : null;
  if (model) {
    const proposal = await proposeAnomalyWithModel(model, features);
    return NextResponse.json({
      source: `llm:${model.name}`,
      provider: modelStatus().provider,
      planted_rings: anomaly_key.structuring_rings,
      status: proposal.status,
      rule: proposal.rule,
      validation: proposal.validation,
    });
  }

  const found = discoverDeterministic(features);
  return NextResponse.json({
    source: "deterministic",
    planted_rings: anomaly_key.structuring_rings,
    discovered: found.map((d) => ({
      name: d.rule.name,
      description: d.rule.description,
      fires: d.validation.fires,
      coverage: d.validation.coverage,
      status: d.status,
    })),
  });
}
