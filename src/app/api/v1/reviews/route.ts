import { listReviews } from "@/server/ledger";
import { handle, requireUser } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const status = new URL(req.url).searchParams.get("status") ?? "open";
    return Response.json({ reviews: listReviews(user.id, status) });
  });
}
