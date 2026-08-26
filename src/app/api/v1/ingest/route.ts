import { MAX_INGEST_BYTES } from "@/server/config";
import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { ingestRecords } from "@/server/ledger";
import { parseRecordList } from "@/server/records";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser("operate");
    if (!rateLimit(`ingest:${user.id}`, 30, 60_000)) return Response.json({ error: "Ingest rate limit reached.", code: "rate_limited" }, { status: 429 });
    const body = (await readJson(req, MAX_INGEST_BYTES)) as { records?: unknown };
    return Response.json(ingestRecords(user.id, "api", parseRecordList(body.records)), { status: 201 });
  });
}
