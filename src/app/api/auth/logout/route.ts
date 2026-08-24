import { cookies } from "next/headers";
import { clearSessionCookie, destroySession } from "@/server/auth";
import { assertSameOriginIfCookie, handle, readSessionToken, requestIsSecure } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    destroySession(await readSessionToken());
    const cookie = clearSessionCookie(requestIsSecure(req));
    (await cookies()).set(cookie.name, cookie.value, cookie.options as never);
    return Response.json({ ok: true });
  });
}
