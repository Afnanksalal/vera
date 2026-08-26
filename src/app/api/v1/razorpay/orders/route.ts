import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { createRazorpayOrder } from "@/server/razorpay";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser("operate");
    if (!rateLimit(`razorpay-order:${user.id}`, 20, 60_000)) return Response.json({ error: "Order rate limit reached.", code: "rate_limited" }, { status: 429 });
    const body = (await readJson(req, 4_096)) as { amount_paise?: number; notes?: Record<string, string> };
    return Response.json(await createRazorpayOrder(user.id, Number(body.amount_paise), body.notes ?? {}));
  });
}
