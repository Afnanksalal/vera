import { isOwner } from "@/server/auth";
import { backupHistory, createEncryptedBackup, verifyEncryptedBackup } from "@/server/backups";
import { assertSameOriginIfCookie, currentSession, handle, HttpError, readJson } from "@/server/http";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function owner() {
  const session = await currentSession();
  if (!session) throw new HttpError(401, "Sign in to manage backups.", "unauthorized");
  const user = session.user;
  if (!isOwner(user.id)) throw new HttpError(403, "Only the installation owner can manage backups.", "forbidden");
  return user;
}

export async function GET() {
  return handle(async () => {
    const user = await owner();
    return Response.json({ history: backupHistory(user.id) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await owner();
    if (!rateLimit(`backup:${user.id}`, 3, 60 * 60_000)) throw new HttpError(429, "Backup creation rate limit reached.", "rate_limited");
    const body = await readJson(req, 4096) as { passphrase?: string };
    const backup = createEncryptedBackup(user.id, body.passphrase);
    const bodyBytes = backup.bytes.buffer.slice(backup.bytes.byteOffset, backup.bytes.byteOffset + backup.bytes.byteLength) as ArrayBuffer;
    return new Response(bodyBytes, { headers: { "content-type": backup.mime, "content-disposition": `attachment; filename="${backup.fileName}"`, "cache-control": "no-store" } });
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    await assertSameOriginIfCookie();
    const user = await owner();
    if (!rateLimit(`backup-verify:${user.id}`, 5, 60 * 60_000)) throw new HttpError(429, "Backup verification rate limit reached.", "rate_limited");
    const body = await readJson(req, 100_000_000) as { passphrase?: string; file_base64?: string };
    return Response.json(verifyEncryptedBackup(user.id, body.passphrase, body.file_base64));
  });
}
