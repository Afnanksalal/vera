import { aiSettingsPublic, deleteAiSettings, getSystemSettings, saveAiSettings, saveSystemSettings } from "@/server/settings";
import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { isOwner } from "@/server/auth";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    if (!rateLimit(`settings:${user.id}`, 20, 60_000)) return Response.json({ error: "Settings rate limit reached.", code: "rate_limited" }, { status: 429 });
    return Response.json({ system: getSystemSettings(), ai: aiSettingsPublic(user.id) });
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser();
    if (!rateLimit(`settings:${user.id}`, 20, 60_000)) return Response.json({ error: "Settings rate limit reached.", code: "rate_limited" }, { status: 429 });
    const body = (await readJson(req, 16_384)) as {
      section?: "system" | "ai";
      public_url?: string;
      allow_live_razorpay?: boolean;
      max_ingest_events?: number;
      provider?: "anthropic" | "openai";
      model?: string;
      base_url?: string;
      api_key?: string;
    };
    if (body.section === "system") {
      if (!isOwner(user.id)) return Response.json({ error: "Only the installation owner can change system settings.", code: "forbidden" }, { status: 403 });
      return Response.json({ system: saveSystemSettings({ public_url: String(body.public_url ?? ""), allow_live_razorpay: Boolean(body.allow_live_razorpay), max_ingest_events: Number(body.max_ingest_events) }) });
    }
    if (body.section === "ai") {
      return Response.json({ ai: saveAiSettings(user.id, {
        provider: body.provider ?? "anthropic",
        model: String(body.model ?? ""),
        base_url: String(body.base_url ?? ""),
        api_key: String(body.api_key ?? ""),
      }) });
    }
    return Response.json({ error: "Unknown settings section.", code: "invalid_section" }, { status: 400 });
  });
}

export async function DELETE() {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser();
    if (!rateLimit(`settings:${user.id}`, 20, 60_000)) return Response.json({ error: "Settings rate limit reached.", code: "rate_limited" }, { status: 429 });
    deleteAiSettings(user.id);
    return Response.json({ ok: true });
  });
}
