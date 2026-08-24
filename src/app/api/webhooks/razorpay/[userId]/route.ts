import { after } from "next/server";
import { MAX_INGEST_BYTES } from "@/server/config";
import { HttpError, handle } from "@/server/http";
import { verifyWebhookSignature } from "@/server/razorpay";
import { enqueueRazorpayWebhook, processPendingRazorpayWebhooks } from "@/server/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  return handle(async () => {
    const { userId } = await ctx.params;
    if (!userId || !userId.startsWith("usr_")) throw new HttpError(404, "Unknown webhook target.", "not_found");
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_INGEST_BYTES) throw new HttpError(413, "Webhook payload too large.", "payload");
    const raw = await req.text();
    if (raw.length > MAX_INGEST_BYTES) throw new HttpError(413, "Webhook payload too large.", "payload");
    verifyWebhookSignature(userId, raw, req.headers.get("x-razorpay-signature"));
    try {
      JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Invalid JSON.", "invalid_json");
    }
    const providerEventId = req.headers.get("x-razorpay-event-id");
    if (!providerEventId) throw new HttpError(400, "Missing X-Razorpay-Event-Id.", "missing_event_id");
    const queued = enqueueRazorpayWebhook(userId, providerEventId, raw);
    after(async () => { await processPendingRazorpayWebhooks(userId); });
    return Response.json({ ok: true, accepted: true, duplicate: queued.duplicate, status: queued.status }, { status: queued.duplicate ? 200 : 202 });
  });
}
