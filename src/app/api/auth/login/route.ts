import { cookies } from "next/headers";
import { authenticate, createSession, installationHasUser, sessionCookie } from "@/server/auth";
import { HttpError, assertSameOriginIfCookie, handle, readJson, requestIsSecure } from "@/server/http";
import { clientIp, normalizeEmail, rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    if (!installationHasUser()) throw new HttpError(409, "Create the installation owner before signing in.", "installation_uninitialized");
    const body = (await readJson(req, 8_192)) as { email?: string; password?: string };
    const email = normalizeEmail(String(body.email ?? ""));
    if (!rateLimit(`login:${clientIp(req.headers)}:${email}`)) {
      return Response.json({ error: "Too many login attempts. Try later.", code: "rate_limited" }, { status: 429 });
    }
    const user = authenticate(email, String(body.password ?? ""));
    if (!user) throw new HttpError(401, "Invalid email or password.", "invalid_credentials");
    const token = createSession(user.id);
    const cookie = sessionCookie(token, requestIsSecure(req));
    (await cookies()).set(cookie.name, cookie.value, cookie.options as never);
    return Response.json({ user: { id: user.id, email: user.email } });
  });
}
