import { calibrationStatus, clearCalibration, importCalibration } from "@/server/calibration";
import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() { return handle(async () => Response.json(calibrationStatus((await requireUser("read")).id))); }

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser("operate");
    if (!rateLimit(`calibration:${user.id}`, 10, 60_000)) return Response.json({ error: "Calibration rate limit reached.", code: "rate_limited" }, { status: 429 });
    const body = (await readJson(req, 1_000_000)) as { rows?: unknown; mode?: "replace" | "append" };
    return Response.json({ imported: importCalibration(user.id, body.rows, body.mode ?? "replace"), mode: body.mode ?? "replace", ...calibrationStatus(user.id) }, { status: 201 });
  });
}

export async function DELETE() {
  return handle(async () => { await assertSameOriginIfCookie(); const user = await requireUser("operate"); if (!rateLimit(`calibration:${user.id}`, 10, 60_000)) return Response.json({ error: "Calibration rate limit reached.", code: "rate_limited" }, { status: 429 }); clearCalibration(user.id); return Response.json({ ok: true }); });
}
