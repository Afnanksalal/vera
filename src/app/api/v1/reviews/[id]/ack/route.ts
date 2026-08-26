import { acknowledgeReview } from "@/server/ledger";
import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser("review");
    if (!rateLimit(`review:${user.id}`, 30, 60_000)) return Response.json({ error: "Review rate limit reached.", code: "rate_limited" }, { status: 429 });
    const { id } = await ctx.params;
    const body = (await readJson(req, 4_096)) as { note?: string };
    return Response.json(acknowledgeReview(user.id, id, body.note));
  });
}
