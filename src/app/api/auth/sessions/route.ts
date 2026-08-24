import { destroyOtherSessions, listSessions } from "@/server/auth";
import { assertSameOriginIfCookie, currentSession, handle, HttpError } from "@/server/http";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const session = await currentSession();
    if (!session) throw new HttpError(401, "Sign in to manage sessions.", "unauthorized");
    return Response.json({ sessions: listSessions(session.user.id, session.sessionId) });
  });
}

export async function DELETE() {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const session = await currentSession();
    if (!session) throw new HttpError(401, "Sign in to manage sessions.", "unauthorized");
    if (!rateLimit(`sessions:${session.user.id}`, 20, 60_000)) {
      return Response.json({ error: "Session-management rate limit reached.", code: "rate_limited" }, { status: 429 });
    }
    const revoked = destroyOtherSessions(session.user.id, session.sessionId);
    return Response.json({ ok: true, revoked });
  });
}
