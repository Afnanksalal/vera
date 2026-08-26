import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { createVerifiedPurchase, listVerifiedPurchases } from "@/server/purchases";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser("read");
    return Response.json({ purchases: listVerifiedPurchases(user.id) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser("operate");
    if (!rateLimit(`verified-purchase:${user.id}`, 20, 60_000)) {
      return Response.json({ error: "Verified purchase rate limit reached.", code: "rate_limited" }, { status: 429 });
    }
    return Response.json(await createVerifiedPurchase(user.id, await readJson(req, 16_384)));
  });
}
