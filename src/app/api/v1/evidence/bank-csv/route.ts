import { publishCloseNotifications } from "@/server/chat-integrations";
import { importBankStatementCsv } from "@/server/evidence";
import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { closeUser } from "@/server/ledger";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser();
    if (!rateLimit(`bank-csv:${user.id}`, 10, 60_000)) return Response.json({ error: "Bank import rate limit reached.", code: "rate_limited" }, { status: 429 });
    const result = importBankStatementCsv(user.id, await readJson(req, 1_600_000));
    const close = closeUser(user.id);
    const notifications = await publishCloseNotifications(user.id, close);
    return Response.json({ result, close, notifications });
  });
}
