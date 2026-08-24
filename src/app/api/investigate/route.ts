import { investigateSale } from "@/mandate/agent";
import { finalizeClose } from "@/mandate/orchestrate";
import { Transcript } from "@/mandate/transcript";
import type { Verdict } from "@/mandate/verifier";
import { worldForUser } from "@/server/analysis";
import { assertSameOriginIfCookie, handle, readJson, requireUser, HttpError } from "@/server/http";
import { modelForUser } from "@/server/settings";
import { rateLimit } from "@/server/policy";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser();
    if (!rateLimit(`investigate:${user.id}`, 10, 60_000)) return Response.json({ error: "Investigation rate limit reached.", code: "rate_limited" }, { status: 429 });
    const model = modelForUser(user.id);
    if (!model) throw new HttpError(400, "Configure an AI provider in Settings first.", "ai_not_configured");
    const body = (await readJson(req, 8_192)) as { sale_id?: string };
    const world = worldForUser(user.id);
    const sale = world.sales.find((item) => item.sale_id === body.sale_id);
    if (!sale) throw new HttpError(404, "Sale not found.", "not_found");
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

    return Response.json({
      sale_id: sale.sale_id,
      agent: model.name,
      tool_calls: report.toolCalls,
      claims,
    });
  });
}
