import { closeUser } from "./ledger";
import { randomId } from "./crypto";
import { getDb, nowMs } from "./db";
import { ingestRazorpayPayment, parseWebhookPayment } from "./razorpay";
import { attachVerifiedPurchaseEvidence } from "./purchases";
import { publishCloseNotifications } from "./chat-integrations";

type WebhookRow = {
  id: string;
  user_id: string;
  payload_json: string;
  status: "pending" | "processing" | "processed" | "ignored" | "failed";
  attempts: number;
};

export function enqueueRazorpayWebhook(
  userId: string,
  providerEventId: string,
  rawPayload: string
): { id: string; duplicate: boolean; status: string } {
  const eventId = providerEventId.trim();
  if (!eventId || eventId.length > 200) throw new Error("Invalid Razorpay event id.");
  const db = getDb();
  const id = randomId("wh");
  const result = db.prepare(
    `INSERT OR IGNORE INTO webhook_events
      (id, user_id, provider, provider_event_id, payload_json, status, attempts, created_at)
     VALUES (?, ?, 'razorpay', ?, ?, 'pending', 0, ?)`
  ).run(id, userId, eventId, rawPayload, nowMs());
  const row = db.prepare(
    "SELECT id, status FROM webhook_events WHERE user_id = ? AND provider = 'razorpay' AND provider_event_id = ?"
  ).get(userId, eventId) as { id: string; status: string };
  return { id: row.id, duplicate: result.changes === 0, status: row.status };
}

function claimNextRazorpayWebhook(userId?: string): WebhookRow | null {
  const db = getDb();
  return db.transaction(() => {
    const row = db.prepare(
      `SELECT id, user_id, payload_json, status, attempts
       FROM webhook_events
       WHERE provider = 'razorpay'
         AND status IN ('pending', 'failed')
         AND attempts < 5
         AND COALESCE(next_attempt_at, created_at) <= ?
         AND (? IS NULL OR user_id = ?)
       ORDER BY created_at ASC
       LIMIT 1`
    ).get(nowMs(), userId ?? null, userId ?? null) as WebhookRow | undefined;
    if (!row) return null;
    const claimed = db.prepare(
      `UPDATE webhook_events
       SET status = 'processing', attempts = attempts + 1, last_error = NULL, locked_at = ?
       WHERE id = ? AND status IN ('pending', 'failed')`
    ).run(nowMs(), row.id);
    return claimed.changes === 1 ? { ...row, status: "processing" as const, attempts: row.attempts + 1 } : null;
  })();
}

export async function processPendingRazorpayWebhooks(userId?: string, limit = 20): Promise<{
  processed: number;
  ignored: number;
  failed: number;
  recovered: number;
}> {
  const recovered = getDb().prepare(
    `UPDATE webhook_events SET status = 'failed', last_error = 'Recovered after interrupted processing.', next_attempt_at = ?, locked_at = NULL
     WHERE status = 'processing' AND locked_at IS NOT NULL AND locked_at < ?`
  ).run(nowMs(), nowMs() - 5 * 60_000).changes;
  let processed = 0;
  let ignored = 0;
  let failed = 0;
  const take = Math.max(1, Math.min(100, Math.trunc(limit)));
  for (let index = 0; index < take; index += 1) {
    const row = claimNextRazorpayWebhook(userId);
    if (!row) break;
    try {
      const payment = parseWebhookPayment(JSON.parse(row.payload_json));
      if (!payment) {
        getDb().prepare("UPDATE webhook_events SET status = 'ignored', processed_at = ?, locked_at = NULL WHERE id = ?").run(nowMs(), row.id);
        ignored += 1;
        continue;
      }
      const ingest = await ingestRazorpayPayment(row.user_id, payment);
      const evidence = (payment.status === "captured" || payment.captured === true) && payment.order_id
        ? attachVerifiedPurchaseEvidence(row.user_id, payment.order_id, payment.id)
        : null;
      if (ingest.inserted + ingest.updated + (evidence?.inserted ?? 0) + (evidence?.updated ?? 0) > 0) {
        const close = closeUser(row.user_id);
        await publishCloseNotifications(row.user_id, close);
      }
      getDb().prepare("UPDATE webhook_events SET status = 'processed', processed_at = ?, locked_at = NULL WHERE id = ?").run(nowMs(), row.id);
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook processing failed";
      const delay = Math.min(3_600_000, 30_000 * 2 ** Math.max(0, row.attempts - 1));
      getDb().prepare("UPDATE webhook_events SET status = 'failed', last_error = ?, next_attempt_at = ?, locked_at = NULL WHERE id = ?").run(message.slice(0, 1000), nowMs() + delay, row.id);
      failed += 1;
    }
  }
  return { processed, ignored, failed, recovered };
}

export function webhookQueueStatus(userId: string): { pending: number; failed: number } {
  const rows = getDb().prepare(
    `SELECT status, COUNT(*) AS n FROM webhook_events
     WHERE user_id = ? AND status IN ('pending', 'processing', 'failed')
     GROUP BY status`
  ).all(userId) as { status: string; n: number }[];
  return {
    pending: rows.filter((row) => row.status !== "failed").reduce((sum, row) => sum + row.n, 0),
    failed: rows.find((row) => row.status === "failed")?.n ?? 0,
  };
}
