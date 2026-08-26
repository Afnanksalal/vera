import { deleteChatIntegration, deliverPendingNotifications, registerDiscordCommands, retryFailedNotifications, saveChatIntegration, sendTestNotification, validateChatProvider } from "@/server/chat-integrations";
import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request, ctx: RouteContext<"/api/v1/chat-integrations/[provider]">) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser("manage_integrations");
    if (!rateLimit(`chat-settings:${user.id}`, 20, 60_000)) return Response.json({ error: "Integration settings rate limit reached.", code: "rate_limited" }, { status: 429 });
    const { provider } = await ctx.params;
    const body = (await readJson(req, 16_384)) as {
      webhook_url?: string;
      signing_secret?: string;
      command_public_key?: string;
      application_id?: string;
      bot_token?: string;
      enabled?: boolean;
      notify_reports?: boolean;
      notify_issues?: boolean;
    };
    return Response.json(saveChatIntegration(user.id, validateChatProvider(provider), body));
  });
}

export async function POST(req: Request, ctx: RouteContext<"/api/v1/chat-integrations/[provider]">) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser("manage_integrations");
    if (!rateLimit(`chat-test:${user.id}`, 5, 60_000)) return Response.json({ error: "Test delivery rate limit reached.", code: "rate_limited" }, { status: 429 });
    const { provider } = await ctx.params;
    const kind = validateChatProvider(provider);
    const body = (await readJson(req, 4_096)) as { action?: string };
    if (body.action === "register_commands") {
      if (kind !== "discord") return Response.json({ error: "Command registration is available for Discord only.", code: "invalid_action" }, { status: 400 });
      await registerDiscordCommands(user.id);
      return Response.json({ ok: true });
    }
    if (body.action === "retry") {
      const queued = retryFailedNotifications(user.id);
      const delivery = await deliverPendingNotifications(user.id, 25);
      return Response.json({ ok: true, queued, ...delivery });
    }
    if (body.action !== "test") return Response.json({ error: "Unknown integration action.", code: "invalid_action" }, { status: 400 });
    await sendTestNotification(user.id, kind);
    return Response.json({ ok: true });
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/v1/chat-integrations/[provider]">) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser("manage_integrations");
    if (!rateLimit(`chat-settings:${user.id}`, 20, 60_000)) return Response.json({ error: "Integration settings rate limit reached.", code: "rate_limited" }, { status: 429 });
    const { provider } = await ctx.params;
    deleteChatIntegration(user.id, validateChatProvider(provider));
    return new Response(null, { status: 204 });
  });
}
