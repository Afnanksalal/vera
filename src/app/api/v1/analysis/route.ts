import { analyzeUser } from "@/server/analysis";
import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser("read");
    if (!rateLimit(`analysis:${user.id}`, 30, 60_000)) return Response.json({ error: "Analysis rate limit reached.", code: "rate_limited" }, { status: 429 });
    const url = new URL(req.url);
    return Response.json(await analyzeUser(user.id, {
      tolerance_paise: Number(url.searchParams.get("tolerance_paise") ?? 100),
      window_days: Number(url.searchParams.get("window_days") ?? 2),
    }));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser("operate");
    if (!rateLimit(`analysis:${user.id}`, 10, 60_000)) return Response.json({ error: "Analysis rate limit reached.", code: "rate_limited" }, { status: 429 });
    const body = (await readJson(req, 8_192)) as { ai?: boolean; tolerance_paise?: number; window_days?: number };
    return Response.json(await analyzeUser(user.id, body));
  });
}
