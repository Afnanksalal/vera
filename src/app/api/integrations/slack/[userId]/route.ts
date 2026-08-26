import { chatCommand, verifySlackRequest } from "@/server/chat-integrations";
import { handle } from "@/server/http";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/integrations/slack/[userId]">) {
  return handle(async () => {
    const { userId } = await ctx.params;
    const raw = await req.text();
    const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
    const signature = req.headers.get("x-slack-signature") ?? "";
    if (!verifySlackRequest(userId, timestamp, raw, signature)) return Response.json({ error: "Invalid Slack signature." }, { status: 401 });
    if (!rateLimit(`slack-command:${userId}`, 30, 60_000)) return Response.json({ response_type: "ephemeral", text: "Vera is receiving too many commands. Try again shortly." }, { status: 429 });
    const form = new URLSearchParams(raw);
    return Response.json({ response_type: "ephemeral", text: chatCommand(userId, form.get("text") ?? "") });
  });
}
