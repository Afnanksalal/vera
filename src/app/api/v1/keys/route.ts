import { createApiKey, listApiKeys } from "@/server/auth";
import { assertSameOriginIfCookie, codedError, handle, readJson, requireUser } from "@/server/http";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return Response.json({ keys: listApiKeys(user.id) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser();
    if (!rateLimit(`api-key:${user.id}`, 10, 60_000)) return Response.json({ error: "API-key rate limit reached.", code: "rate_limited" }, { status: 429 });
    const body = (await readJson(req, 4_096)) as { name?: string };
    let key;
    try { key = createApiKey(user.id, String(body.name ?? "")); } catch (error) { codedError(error); }
    return Response.json({ id: key.id, prefix: key.prefix, secret: key.secret }, { status: 201 });
  });
}
