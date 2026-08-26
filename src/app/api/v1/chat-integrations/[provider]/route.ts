import { deleteChatIntegration, saveChatIntegration, sendTestNotification, validateChatProvider } from "@/server/chat-integrations";
import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request, ctx: RouteContext<"/api/v1/chat-integrations/[provider]">) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser();
    if (!rateLimit(`chat-settings:${user.id}`, 20, 60_000)) return Response.json({ error: "Integration settings rate limit reached.", code: "rate_limited" }, { status: 429 });
    const { provider } = await ctx.params;
    const body = (await readJson(req, 16_384)) as {
      webhook_url?: string;
      signing_secret?: string;
      command_public_key?: string;
      enabled?: boolean;
      notify_reports?: boolean;
      notify_issues?: boolean;
    };
    return Response.json(saveChatIntegration(user.id, validateChatProvider(provider), body));
  });
}

export async function POST(_req: Request, ctx: RouteContext<"/api/v1/chat-integrations/[provider]">) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser();
    if (!rateLimit(`chat-test:${user.id}`, 5, 60_000)) return Response.json({ error: "Test delivery rate limit reached.", code: "rate_limited" }, { status: 429 });
    const { provider } = await ctx.params;
    await sendTestNotification(user.id, validateChatProvider(provider));
    return Response.json({ ok: true });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/v1/chat-integrations/[provider]">) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser();
    if (!rateLimit(`chat-settings:${user.id}`, 20, 60_000)) return Response.json({ error: "Integration settings rate limit reached.", code: "rate_limited" }, { status: 429 });
    const { provider } = await ctx.params;
    deleteChatIntegration(user.id, validateChatProvider(provider));
    return new Response(null, { status: 204 });
  });
}
