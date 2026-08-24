import { cookies } from "next/headers";
import { createSession, createUser, sessionContext, sessionCookie } from "@/server/auth";
import { assertSameOriginIfCookie, codedError, handle, readJson, requestIsSecure } from "@/server/http";
import { clientIp, rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    if (!rateLimit(`signup:${clientIp(req.headers)}`, 5)) {
      return Response.json({ error: "Too many signups. Try later.", code: "rate_limited" }, { status: 429 });
    }
    const body = (await readJson(req, 8_192)) as { email?: string; password?: string };
    let user;
    try {
      user = createUser(String(body.email ?? ""), String(body.password ?? ""));
    } catch (err) {
      codedError(err);
    }
    const token = createSession(user.id, sessionContext(req.headers));
    const cookie = sessionCookie(token, requestIsSecure(req));
    (await cookies()).set(cookie.name, cookie.value, cookie.options as never);
    return Response.json({ user: { id: user.id, email: user.email } }, { status: 201 });
  });
}
