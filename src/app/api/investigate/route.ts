import { NextResponse } from "next/server";
import { investigateSale } from "@/mandate/agent";
import { buildFixture } from "@/mandate/fixture";
import { getModelFromEnv, modelStatus } from "@/mandate/llm";
import { finalizeClose } from "@/mandate/orchestrate";
import { Transcript } from "@/mandate/transcript";
import type { Verdict } from "@/mandate/verifier";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const model = getModelFromEnv();
  const status = modelStatus();
  if (!model) {
    return NextResponse.json(
      { error: "No AI model configured. Set ANTHROPIC_API_KEY (or OPENAI_API_KEY)." },
      { status: 400 }
    );
  }

  let body: { sale_id?: string; seed?: number } = {};
  try {
    body = (await req.json()) as { sale_id?: string; seed?: number };
  } catch {
    /* empty body ok */
  }
  const seed = Number.isInteger(body.seed) ? (body.seed as number) : 42;
  const { world } = buildFixture({ seed });
  const sale =
    world.sales.find((s) => s.sale_id === body.sale_id) ??
    world.sales.find((s) => s.fault) ??
    world.sales[0];

  try {
    const transcript = new Transcript(world);
    const { proposals, report } = await investigateSale(model, world, sale, transcript);
    const run = finalizeClose(
      world,
      transcript,
      proposals,
      { [sale.sale_id]: report.toolCalls },
      `llm:${model.name}`,
      [sale]
    );

    const verdictById = new Map<string, Verdict>(run.verdicts.map((v) => [v.claim_id, v]));
    const finalById = new Map(run.claims.map((c) => [c.claim_id, c]));

    const claims = report.claims.map((rc) => {
      const id = `${sale.sale_id}:${rc.type}`;
      const v = verdictById.get(id);
      const c = finalById.get(id);
      return {
        type: rc.type,
        ai_action: rc.action,
        ai_code: rc.code ?? null,
        rationale: rc.rationale,
        verifier_accepted: v?.accepted ?? false,
        verifier_reason: v?.reason ?? (rc.action === "abstain" ? "abstained" : "no_verdict"),
        final_status: c?.status ?? "ABSTAINED",
        final_code: c?.code ?? null,
      };
    });

    return NextResponse.json({
      sale_id: sale.sale_id,
      fault: sale.fault,
      provider: status.provider,
      agent: model.name,
      tool_calls: report.toolCalls,
      claims,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
