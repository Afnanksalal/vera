import { MAX_INGEST_BYTES } from "@/server/config";
import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { deleteRazorpayAccount, razorpayPublic, saveRazorpayAccount } from "@/server/razorpay";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!rateLimit(`razorpay-settings:${user.id}`, 10, 60_000)) return Response.json({ error: "Razorpay settings rate limit reached.", code: "rate_limited" }, { status: 429 });
    return Response.json(razorpayPublic(user.id));
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser();
    if (!rateLimit(`razorpay-settings:${user.id}`, 10, 60_000)) return Response.json({ error: "Razorpay settings rate limit reached.", code: "rate_limited" }, { status: 429 });
    const body = (await readJson(req, MAX_INGEST_BYTES)) as {
      key_id?: string;
      key_secret?: string;
      webhook_secret?: string;
    };
    return Response.json(
      saveRazorpayAccount(user.id, {
        key_id: String(body.key_id ?? ""),
        key_secret: String(body.key_secret ?? ""),
        webhook_secret: body.webhook_secret,
      })
    );
  });
}

export async function DELETE() {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser();
    if (!rateLimit(`razorpay-settings:${user.id}`, 10, 60_000)) return Response.json({ error: "Razorpay settings rate limit reached.", code: "rate_limited" }, { status: 429 });
    deleteRazorpayAccount(user.id);
    return Response.json({ ok: true });
  });
}
