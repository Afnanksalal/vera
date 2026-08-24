import { destroySessionById } from "@/server/auth";
import { assertSameOriginIfCookie, currentSession, handle, HttpError } from "@/server/http";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const session = await currentSession();
    if (!session) throw new HttpError(401, "Sign in to manage sessions.", "unauthorized");
    if (!rateLimit(`sessions:${session.user.id}`, 20, 60_000)) {
      return Response.json({ error: "Session-management rate limit reached.", code: "rate_limited" }, { status: 429 });
    }
    const { id } = await context.params;
    if (!id.startsWith("ses_") || id.length > 100) throw new HttpError(404, "Session not found.", "not_found");
    if (id === session.sessionId) {
      throw new HttpError(409, "Use Sign out to end the current session.", "current_session");
    }
    if (!destroySessionById(id, session.user.id)) throw new HttpError(404, "Session not found.", "not_found");
    return Response.json({ ok: true });
  });
}
