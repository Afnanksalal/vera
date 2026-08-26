import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { syncRazorpayPayments } from "@/server/razorpay";
import { processPendingRazorpayWebhooks } from "@/server/webhooks";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser("operate");
    if (!rateLimit(`razorpay-sync:${user.id}`, 5, 60_000)) {
      return Response.json({ error: "Sync rate limit reached.", code: "rate_limited" }, { status: 429 });
    }
    const body = (await readJson(req, 4_096)) as { count?: number; settlement_year?: number; settlement_month?: number };
    const queue = await processPendingRazorpayWebhooks(user.id, 100);
    const now = new Date();
    const payments = await syncRazorpayPayments(user.id, Number(body.count ?? 100), {
      year: Number(body.settlement_year ?? now.getUTCFullYear()),
      month: Number(body.settlement_month ?? now.getUTCMonth() + 1),
    });
    return Response.json({ ...payments, webhook_queue: queue });
  });
}
