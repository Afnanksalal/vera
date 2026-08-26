import { closeUser } from "@/server/ledger";
import { assertSameOriginIfCookie, handle, requireUser } from "@/server/http";
import { rateLimit } from "@/server/policy";
import { publishCloseNotifications } from "@/server/chat-integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser();
    if (!rateLimit(`close:${user.id}`, 10, 60_000)) return Response.json({ error: "Close rate limit reached.", code: "rate_limited" }, { status: 429 });
    const close = closeUser(user.id);
    const notifications = await publishCloseNotifications(user.id, close);
    return Response.json({ ...close, notifications }, { status: 201 });
  });
}
