import { bankFeedPublic, deleteBankFeed, saveBankFeed, syncBankFeed } from "@/server/bank-feed";
import { assertSameOriginIfCookie, handle, readJson, requireUser } from "@/server/http";
import { rateLimit } from "@/server/policy";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { return handle(async () => Response.json(bankFeedPublic((await requireUser("read")).id))); }
export async function POST(req: Request) { return handle(async () => { await assertSameOriginIfCookie(); const user = await requireUser("manage_integrations"); const body = await readJson(req, 4096) as Record<string, unknown>; if (body.action === "sync") { if (!rateLimit(`bank-feed:${user.id}`, 6, 60_000)) return Response.json({ error: "Please wait before syncing again." }, { status: 429 }); return Response.json(await syncBankFeed(user.id)); } return Response.json(saveBankFeed(user.id, body)); }); }
export async function DELETE() { return handle(async () => { await assertSameOriginIfCookie(); deleteBankFeed((await requireUser("manage_integrations")).id); return Response.json({ ok: true }); }); }
