import { closeById } from "@/server/ledger";
import { handle, HttpError, requireUser } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const close = closeById(user.id, (await ctx.params).id);
    if (!close) throw new HttpError(404, "Close not found.", "not_found");
    if (new URL(req.url).searchParams.get("download") === "bundle") {
      return new Response(JSON.stringify(close.bundle, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="vera-${close.summary.id}.json"` } });
    }
    return Response.json(close);
  });
}
