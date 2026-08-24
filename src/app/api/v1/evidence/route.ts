import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { attachExternalEvidence } from "@/server/evidence";
import { closeUser } from "@/server/ledger";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser();
    if (!rateLimit(`evidence:${user.id}`, 30, 60_000)) return Response.json({ error: "Evidence import rate limit reached.", code: "rate_limited" }, { status: 429 });
    const result = attachExternalEvidence(user.id, await readJson(req, 1_600_000));
    return Response.json({ result, close: closeUser(user.id) });
  });
}
