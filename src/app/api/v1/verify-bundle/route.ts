import { verifyBundle, type AuditBundle } from "@/mandate/bundle";
import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { signingPublicKey } from "@/server/signing";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await requireUser();
    if (!rateLimit(`verify-bundle:${user.id}`, 10, 60_000)) return Response.json({ error: "Bundle verification rate limit reached.", code: "rate_limited" }, { status: 429 });
    const bundle = (await readJson(req, 10_000_000)) as AuditBundle;
    const verification = verifyBundle(bundle);
    const trusted_signer = bundle.public_key_pem === signingPublicKey();
    return Response.json({ ...verification, trusted_signer, ok: verification.ok && trusted_signer });
  });
}
