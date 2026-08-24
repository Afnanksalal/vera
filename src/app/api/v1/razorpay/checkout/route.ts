import { closeUser } from "@/server/ledger";
import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { ingestPaymentId, verifyCheckoutSignature } from "@/server/razorpay";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser();
    if (!rateLimit(`razorpay-checkout:${user.id}`, 20, 60_000)) return Response.json({ error: "Checkout rate limit reached.", code: "rate_limited" }, { status: 429 });
    const body = (await readJson(req, 8_192)) as {
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
      close?: boolean;
    };
    verifyCheckoutSignature(
      user.id,
      String(body.razorpay_order_id ?? ""),
      String(body.razorpay_payment_id ?? ""),
      String(body.razorpay_signature ?? "")
    );
    const ingest = await ingestPaymentId(user.id, String(body.razorpay_payment_id));
    const close = body.close === false || ingest.inserted + ingest.updated === 0 ? null : closeUser(user.id);
    return Response.json({ ingest, close });
  });
}
