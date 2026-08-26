import { deliverDueNotificationsAll } from "./chat-integrations";
import { log } from "./logger";
import { processPendingRazorpayWebhooks } from "./webhooks";

declare global {
  var __veraOperationsWorker: ReturnType<typeof setInterval> | undefined;
  var __veraOperationsWorkerBusy: boolean | undefined;
}

async function tick(): Promise<void> {
  if (globalThis.__veraOperationsWorkerBusy) return;
  globalThis.__veraOperationsWorkerBusy = true;
  try {
    const webhooks = await processPendingRazorpayWebhooks(undefined, 20);
    if (webhooks.processed || webhooks.ignored || webhooks.failed || webhooks.recovered) log("info", "worker.webhooks", webhooks);
    const result = await deliverDueNotificationsAll(50);
    if (result.delivered || result.failed || result.recovered) log("info", "worker.notifications", result);
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
