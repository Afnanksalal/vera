import { cookies } from "next/headers";
import { authenticate, clearSessionCookie, isOwner } from "@/server/auth";
import { assertSameOriginIfCookie, currentSession, handle, HttpError, readJson, requestIsSecure } from "@/server/http";
import { rateLimit } from "@/server/policy";
import { rotateMasterKey } from "@/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const session = await currentSession();
    if (!session || !isOwner(session.user.id)) throw new HttpError(403, "Only the installation owner can rotate the master key.", "forbidden");
    if (!rateLimit(`key-rotation:${session.user.id}`, 3, 24 * 60 * 60_000)) throw new HttpError(429, "Master-key rotation rate limit reached.", "rate_limited");
    const body = await readJson(req, 4096) as { current_password?: string; confirmation?: string };
    if (!authenticate(session.user.email, String(body.current_password ?? ""))) throw new HttpError(401, "Current password is incorrect.", "invalid_credentials");
    if (body.confirmation !== "ROTATE") throw new HttpError(400, "Type ROTATE to confirm key rotation.", "confirmation_required");
    const result = rotateMasterKey(session.user.id);
    const cookie = clearSessionCookie(requestIsSecure(req));
    (await cookies()).set(cookie.name, cookie.value, cookie.options as never);
    return Response.json({ ...result, signed_out: true });
  });
}
