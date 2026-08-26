import { revokeApiKey } from "@/server/auth";
import { HttpError, assertSameOriginIfCookie, handle, requireUser } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser("manage_integrations");
    const { id } = await ctx.params;
    if (!revokeApiKey(user.id, id)) throw new HttpError(404, "API key not found.", "not_found");
    return Response.json({ ok: true });
  });
}
