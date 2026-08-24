import { latestClose, listCloses } from "@/server/ledger";
import { handle, requireUser } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const url = new URL(req.url);
    if (url.searchParams.get("latest") === "1") {
      const close = latestClose(user.id);
      if (!close) return Response.json({ close: null });
      return Response.json({
        close: close.summary,
        claims: close.claims,
        bundle: url.searchParams.get("bundle") === "1" ? close.bundle : undefined,
      });
    }
    return Response.json({ closes: listCloses(user.id) });
  });
}
