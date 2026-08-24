import { cookies } from "next/headers";
import { changePassword, createSession, destroyAllSessions, sessionContext, sessionCookie, sessionFromToken } from "@/server/auth";
import { assertSameOriginIfCookie, codedError, handle, HttpError, readJson, readSessionToken, requestIsSecure } from "@/server/http";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const session = sessionFromToken(await readSessionToken());
    if (!session) throw new HttpError(401, "Sign in again before changing the password.", "unauthorized");
    if (!rateLimit(`password:${session.user.id}`, 5, 15 * 60_000)) {
      return Response.json({ error: "Password-change rate limit reached.", code: "rate_limited" }, { status: 429 });
    }
    const body = (await readJson(req, 4_096)) as { current_password?: string; new_password?: string };
    try {
      changePassword(session.user.id, String(body.current_password ?? ""), String(body.new_password ?? ""));
    } catch (error) {
      codedError(error);
    }
    destroyAllSessions(session.user.id);
    const token = createSession(session.user.id, sessionContext(req.headers));
    const cookie = sessionCookie(token, requestIsSecure(req));
    (await cookies()).set(cookie.name, cookie.value, cookie.options as never);
    return Response.json({ ok: true });
  });
}
