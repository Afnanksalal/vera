import { latestClose, listReviews, recordsForUser } from "@/server/ledger";
import { handle, requireUser } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const close = latestClose(user.id);
    return Response.json({
      events: recordsForUser(user.id).length,
      close: close?.summary ?? null,
      claims: close?.claims ?? [],
      open_reviews: listReviews(user.id, "open").length,
    });
  });
}
