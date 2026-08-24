import { signingPublicKey } from "@/server/signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(signingPublicKey(), { headers: { "content-type": "application/x-pem-file", "content-disposition": "attachment; filename=vera-audit-public-key.pem" } });
}
