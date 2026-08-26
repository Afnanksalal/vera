export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    const database = getDb().prepare("SELECT 1 AS ok").get() as { ok: number };
    const keyReady = authSecret().length >= 32;
    if (database.ok !== 1 || !keyReady) throw new Error("readiness check failed");
    return Response.json({ ok: true, service: "vera", status: "ready", initialized: installationHasUser() });
  } catch (error) {
    log("error", "health.unavailable", { message: error instanceof Error ? error.message : String(error) });
    return Response.json({ ok: false, service: "vera", status: "unavailable" }, { status: 503 });
  }
}
import { installationHasUser } from "@/server/auth";
import { authSecret } from "@/server/config";
import { getDb } from "@/server/db";
import { log } from "@/server/logger";
