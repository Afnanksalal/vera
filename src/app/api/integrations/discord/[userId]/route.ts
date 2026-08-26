import { chatCommand, verifyDiscordRequest } from "@/server/chat-integrations";
import { handle } from "@/server/http";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DiscordOption = { name?: string; value?: unknown; options?: DiscordOption[] };
type DiscordInteraction = { type?: number; data?: { name?: string; options?: DiscordOption[] } };

function commandText(body: DiscordInteraction): string {
  const options = body.data?.options ?? [];
  const subcommand = options.find((option) => option.name === "issues" || option.name === "payment");
  if (!subcommand?.name) return "help";
  if (subcommand.name === "issues") return "issues";
  const id = subcommand.options?.find((option) => option.name === "id")?.value;
  return `payment ${typeof id === "string" ? id : ""}`.trim();
}

export async function POST(req: Request, ctx: RouteContext<"/api/integrations/discord/[userId]">) {
  return handle(async () => {
    const { userId } = await ctx.params;
    const raw = await req.text();
    const timestamp = req.headers.get("x-signature-timestamp") ?? "";
    const signature = req.headers.get("x-signature-ed25519") ?? "";
    if (!verifyDiscordRequest(userId, timestamp, raw, signature)) return Response.json({ error: "Invalid Discord signature." }, { status: 401 });
    const body = JSON.parse(raw) as DiscordInteraction;
    if (body.type === 1) return Response.json({ type: 1 });
    if (!rateLimit(`discord-command:${userId}`, 30, 60_000)) return Response.json({ type: 4, data: { flags: 64, content: "Vera is receiving too many commands. Try again shortly." } });
    return Response.json({ type: 4, data: { flags: 64, content: chatCommand(userId, commandText(body)) } });
  });
}
