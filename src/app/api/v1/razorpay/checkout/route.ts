import { closeUser } from "@/server/ledger";
import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { ingestPaymentId, verifyCheckoutSignature } from "@/server/razorpay";
import { rateLimit } from "@/server/policy";
import { attachVerifiedPurchaseEvidence } from "@/server/purchases";

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
    const paymentId = String(body.razorpay_payment_id);
    const orderId = String(body.razorpay_order_id);
    const ingest = await ingestPaymentId(user.id, paymentId);
    const evidence = attachVerifiedPurchaseEvidence(user.id, orderId, paymentId);
    const changed = ingest.inserted + ingest.updated + (evidence?.inserted ?? 0) + (evidence?.updated ?? 0);
    const close = body.close === false || changed === 0 ? null : closeUser(user.id);
    return Response.json({ ingest, evidence, close });
  });
}
