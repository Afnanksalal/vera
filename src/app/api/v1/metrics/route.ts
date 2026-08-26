import { operationalStatus } from "@/server/operations";
import { handle, requireUser } from "@/server/http";
import { getDb } from "@/server/db";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { return handle(async () => { const user = await requireUser("read"); const status = operationalStatus(user.id); const open = (getDb().prepare("SELECT COUNT(*) AS n FROM reviews WHERE user_id=? AND status='open'").get(user.id) as { n:number }).n; const lines = [
  "# HELP vera_up Vera application health.", "# TYPE vera_up gauge", `vera_up ${status.database === "ok" ? 1 : 0}`,
  "# TYPE vera_worker_healthy gauge", `vera_worker_healthy ${status.worker.healthy ? 1 : 0}`,
  "# TYPE vera_open_reviews gauge", `vera_open_reviews ${open}`,
  "# TYPE vera_webhook_jobs gauge", `vera_webhook_jobs{status=\"pending\"} ${status.webhook.pending}`, `vera_webhook_jobs{status=\"failed\"} ${status.webhook.failed}`,
  "# TYPE vera_notification_jobs gauge", `vera_notification_jobs{status=\"pending\"} ${status.notifications.pending}`, `vera_notification_jobs{status=\"failed\"} ${status.notifications.failed}`,
  "# TYPE vera_backup_verified gauge", `vera_backup_verified ${status.backup.healthy ? 1 : 0}`,
  "# TYPE vera_database_bytes gauge", `vera_database_bytes ${status.database_bytes ?? 0}`,
  "",
  ]; return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8", "cache-control": "no-store" } }); }); }
