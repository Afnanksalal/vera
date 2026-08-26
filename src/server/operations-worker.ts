import { deliverDueNotificationsAll } from "./chat-integrations";
import { log } from "./logger";
import { processPendingRazorpayWebhooks } from "./webhooks";
import { syncDueBankFeeds } from "./bank-feed";
import { getDb, nowMs } from "./db";

declare global {
  var __veraOperationsWorker: ReturnType<typeof setInterval> | undefined;
  var __veraOperationsWorkerBusy: boolean | undefined;
}

async function tick(): Promise<void> {
  if (globalThis.__veraOperationsWorkerBusy) return;
  globalThis.__veraOperationsWorkerBusy = true;
  try {
    getDb().prepare("INSERT INTO worker_heartbeats (name,last_seen_at,detail) VALUES ('operations',?,'running') ON CONFLICT(name) DO UPDATE SET last_seen_at=excluded.last_seen_at, detail=excluded.detail").run(nowMs());
    const webhooks = await processPendingRazorpayWebhooks(undefined, 20);
    if (webhooks.processed || webhooks.ignored || webhooks.failed || webhooks.recovered) log("info", "worker.webhooks", webhooks);
    const result = await deliverDueNotificationsAll(50);
    if (result.delivered || result.failed || result.recovered) log("info", "worker.notifications", result);
    const feeds = await syncDueBankFeeds();
    if (feeds.attempted) log("info", "worker.bank_feeds", feeds);
  } catch (error) {
    log("error", "worker.tick_failed", { message: error instanceof Error ? error.message : String(error) });
  } finally {
    globalThis.__veraOperationsWorkerBusy = false;
  }
}

export function startOperationsWorker(): void {
  if (globalThis.__veraOperationsWorker || process.env.VERA_TEST === "1") return;
  log("info", "worker.started", { interval_ms: 15_000 });
  void tick();
  globalThis.__veraOperationsWorker = setInterval(() => void tick(), 15_000);
  globalThis.__veraOperationsWorker.unref();
}
