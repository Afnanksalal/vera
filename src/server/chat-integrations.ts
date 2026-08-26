import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import type Database from "better-sqlite3";
import { decryptSecret, encryptSecret, randomId } from "./crypto";
import { getDb, nowMs } from "./db";
import { HttpError } from "./http";
import { listReviews, recordForUser, type CloseSummary } from "./ledger";
import { getSystemSettings } from "./settings";

export type ChatProvider = "slack" | "discord";

export type ChatIntegrationPublic = {
  provider: ChatProvider;
  configured: boolean;
  enabled: boolean;
  commands_configured: boolean;
  notify_reports: boolean;
  notify_issues: boolean;
  destination: string | null;
  pending: number;
  failed: number;
  last_delivery_at: number | null;
  application_id: string | null;
  commands_registered_at: number | null;
};

type IntegrationRow = {
  user_id: string;
  provider: ChatProvider;
  enabled: number;
  webhook_url_cipher: string;
  signing_secret_cipher: string | null;
  command_public_key: string | null;
  application_id: string | null;
  bot_token_cipher: string | null;
  commands_registered_at: number | null;
  notify_reports: number;
  notify_issues: number;
};

type NotificationPayload = {
  event: "report.completed";
  title: string;
  summary: string;
  severity: "ok" | "attention";
  report_id: string;
  report_url: string;
  proven: number;
  needs_attention: number;
  payments: number;
  occurred_at: string;
};

function provider(value: string): ChatProvider {
  if (value !== "slack" && value !== "discord") throw new HttpError(404, "Unknown chat provider.", "not_found");
  return value;
}

export function validateChatProvider(value: string): ChatProvider {
  return provider(value);
}

export function normalizeWebhookUrl(kind: ChatProvider, raw: string): string {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new HttpError(400, "Enter a valid HTTPS webhook URL.", "invalid_webhook_url"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new HttpError(400, "Webhook URLs must use HTTPS without credentials or a custom port.", "invalid_webhook_url");
  }
  const host = url.hostname.toLowerCase();
  if (kind === "slack") {
    if (!(["hooks.slack.com", "hooks.slack-gov.com"].includes(host)) || !url.pathname.startsWith("/services/")) {
      throw new HttpError(400, "Use an official Slack incoming webhook URL.", "invalid_webhook_url");
    }
  } else if (!(["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"].includes(host)) || !/^\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+\/?$/.test(url.pathname)) {
    throw new HttpError(400, "Use an official Discord webhook URL.", "invalid_webhook_url");
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

function normalizedDiscordPublicKey(value: string): string | null {
  const key = value.trim().toLowerCase();
  if (!key) return null;
  if (!/^[a-f0-9]{64}$/.test(key)) throw new HttpError(400, "Discord public key must contain exactly 64 hexadecimal characters.", "invalid_public_key");
  return key;
}

function rowFor(userId: string, kind: ChatProvider): IntegrationRow | undefined {
  return getDb().prepare(
    `SELECT user_id, provider, enabled, webhook_url_cipher, signing_secret_cipher,
            command_public_key, application_id, bot_token_cipher, commands_registered_at,
            notify_reports, notify_issues
     FROM chat_integrations WHERE user_id = ? AND provider = ?`
  ).get(userId, kind) as IntegrationRow | undefined;
}

function destination(cipher: string, kind: ChatProvider): string {
  try {
    const url = new URL(decryptSecret(cipher));
    if (kind === "slack") return "Slack incoming webhook";
    return `Discord webhook ${url.pathname.split("/").at(-2) ?? ""}`;
  } catch { return `${kind === "slack" ? "Slack" : "Discord"} webhook`; }
}

export function chatIntegrationPublic(userId: string, kind: ChatProvider): ChatIntegrationPublic {
  const row = rowFor(userId, kind);
  const stats = getDb().prepare(
    `SELECT
       SUM(CASE WHEN status IN ('pending', 'processing') THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
       MAX(delivered_at) AS last_delivery_at
     FROM notification_deliveries WHERE user_id = ? AND provider = ?`
  ).get(userId, kind) as { pending: number | null; failed: number | null; last_delivery_at: number | null };
  return {
    provider: kind,
    configured: Boolean(row),
    enabled: Boolean(row?.enabled),
    commands_configured: kind === "slack" ? Boolean(row?.signing_secret_cipher) : Boolean(row?.command_public_key),
    notify_reports: row ? Boolean(row.notify_reports) : true,
    notify_issues: row ? Boolean(row.notify_issues) : true,
    destination: row ? destination(row.webhook_url_cipher, kind) : null,
    pending: stats.pending ?? 0,
    failed: stats.failed ?? 0,
    last_delivery_at: stats.last_delivery_at,
    application_id: row?.application_id ?? null,
    commands_registered_at: row?.commands_registered_at ?? null,
  };
}

export function saveChatIntegration(userId: string, kindValue: string, input: {
  webhook_url?: string;
  signing_secret?: string;
  command_public_key?: string;
  application_id?: string;
  bot_token?: string;
  enabled?: boolean;
  notify_reports?: boolean;
  notify_issues?: boolean;
}): ChatIntegrationPublic {
  const kind = provider(kindValue);
  const current = rowFor(userId, kind);
  const suppliedUrl = input.webhook_url?.trim() ?? "";
  if (!current && !suppliedUrl) throw new HttpError(400, "Webhook URL is required.", "invalid_webhook_url");
  const webhookCipher = suppliedUrl ? encryptSecret(normalizeWebhookUrl(kind, suppliedUrl)) : current!.webhook_url_cipher;
  let signingCipher = current?.signing_secret_cipher ?? null;
  let publicKey = current?.command_public_key ?? null;
  let applicationId = current?.application_id ?? null;
  let botTokenCipher = current?.bot_token_cipher ?? null;
  if (kind === "slack" && input.signing_secret?.trim()) {
    const secret = input.signing_secret.trim();
    if (secret.length < 16 || secret.length > 256) throw new HttpError(400, "Slack signing secret looks invalid.", "invalid_signing_secret");
    signingCipher = encryptSecret(secret);
  }
  if (kind === "discord") {
    if (input.command_public_key?.trim()) publicKey = normalizedDiscordPublicKey(input.command_public_key);
    if (input.application_id?.trim()) {
      const value = input.application_id.trim();
      if (!/^\d{16,22}$/.test(value)) throw new HttpError(400, "Discord application ID looks invalid.", "invalid_application_id");
      applicationId = value;
    }
    if (input.bot_token?.trim()) {
      const value = input.bot_token.trim();
      if (value.length < 32 || value.length > 256) throw new HttpError(400, "Discord bot token looks invalid.", "invalid_bot_token");
      botTokenCipher = encryptSecret(value);
    }
  }
  getDb().prepare(
    `INSERT INTO chat_integrations
       (user_id, provider, enabled, webhook_url_cipher, signing_secret_cipher, command_public_key,
        application_id, bot_token_cipher, notify_reports, notify_issues, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET
       enabled = excluded.enabled,
       webhook_url_cipher = excluded.webhook_url_cipher,
       signing_secret_cipher = excluded.signing_secret_cipher,
       command_public_key = excluded.command_public_key,
       application_id = excluded.application_id,
       bot_token_cipher = excluded.bot_token_cipher,
       notify_reports = excluded.notify_reports,
       notify_issues = excluded.notify_issues,
       updated_at = excluded.updated_at`
  ).run(userId, kind, input.enabled === false ? 0 : 1, webhookCipher, signingCipher, publicKey, applicationId, botTokenCipher, input.notify_reports === false ? 0 : 1, input.notify_issues === false ? 0 : 1, nowMs());
  audit(userId, kind, current ? "configuration.updated" : "configuration.created");
  return chatIntegrationPublic(userId, kind);
}

export function deleteChatIntegration(userId: string, kindValue: string): void {
  const kind = provider(kindValue);
  const db = getDb();
  db.transaction(() => {
    db.prepare("DELETE FROM notification_deliveries WHERE user_id = ? AND provider = ?").run(userId, kind);
    db.prepare("DELETE FROM chat_integrations WHERE user_id = ? AND provider = ?").run(userId, kind);
    audit(userId, kind, "configuration.deleted", undefined, db);
  })();
}

function audit(userId: string, kind: ChatProvider, action: string, detail?: string, db: Database.Database = getDb()): void {
  db.prepare("INSERT INTO integration_audit_log (id, user_id, provider, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(randomId("ial"), userId, kind, action, detail?.slice(0, 500) ?? null, nowMs());
}

export function enqueueReportNotifications(userId: string, summary: CloseSummary): number {
  const issueCount = summary.excepted + summary.abstained;
  const base = getSystemSettings().public_url.replace(/\/$/, "");
  const payload: NotificationPayload = {
    event: "report.completed",
    title: issueCount ? "Vera found evidence that needs attention" : "Vera verification completed",
    summary: `${summary.sales} payment${summary.sales === 1 ? "" : "s"} checked · ${summary.proven} passed · ${issueCount} need attention`,
    severity: issueCount ? "attention" : "ok",
    report_id: summary.id,
    report_url: `${base}/app/closes/${encodeURIComponent(summary.id)}`,
    proven: summary.proven,
    needs_attention: issueCount,
    payments: summary.sales,
    occurred_at: new Date(summary.created_at).toISOString(),
  };
  let queued = 0;
  const db = getDb();
  for (const row of db.prepare(
    "SELECT provider, notify_reports, notify_issues FROM chat_integrations WHERE user_id = ? AND enabled = 1"
  ).all(userId) as { provider: ChatProvider; notify_reports: number; notify_issues: number }[]) {
    if (issueCount > 0 ? !row.notify_issues : !row.notify_reports) continue;
    const result = db.prepare(
      `INSERT OR IGNORE INTO notification_deliveries
       (id, user_id, provider, event_key, payload_json, status, attempts, next_attempt_at, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?)`
    ).run(randomId("ntf"), userId, row.provider, `report.completed:${summary.id}`, JSON.stringify(payload), nowMs(), nowMs());
    queued += result.changes;
  }
  return queued;
}

function slackPayload(payload: NotificationPayload) {
  return {
    text: `${payload.title}. ${payload.summary}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: payload.title, emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: `*${payload.summary}*\nReport: \`${payload.report_id}\`` } },
      ...(payload.report_url.startsWith("https://") ? [{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open report" }, url: payload.report_url }] }] : []),
    ],
  };
}

function discordPayload(payload: NotificationPayload) {
  return {
    content: null,
    embeds: [{
      title: payload.title,
      description: payload.summary,
      color: payload.severity === "attention" ? 0xdc2626 : 0x059669,
      fields: [
        { name: "Report", value: `\`${payload.report_id}\``, inline: false },
        { name: "Passed", value: String(payload.proven), inline: true },
        { name: "Needs attention", value: String(payload.needs_attention), inline: true },
      ],
      url: payload.report_url.startsWith("https://") ? payload.report_url : undefined,
      timestamp: payload.occurred_at,
      footer: { text: "Verified by Vera" },
    }],
  };
}

async function postWebhook(row: IntegrationRow, payload: NotificationPayload): Promise<void> {
  const url = normalizeWebhookUrl(row.provider, decryptSecret(row.webhook_url_cipher));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Vera/1.0" },
      body: JSON.stringify(row.provider === "slack" ? slackPayload(payload) : discordPayload(payload)),
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${row.provider} returned HTTP ${response.status}`);
  } finally { clearTimeout(timeout); }
}

export async function deliverPendingNotifications(userId: string, limit = 10): Promise<{ delivered: number; failed: number }> {
  const db = getDb();
  let delivered = 0;
  let failed = 0;
  for (let index = 0; index < Math.max(1, Math.min(25, Math.trunc(limit))); index += 1) {
    const row = db.transaction(() => {
      const found = db.prepare(
        `SELECT id, provider, payload_json, attempts FROM notification_deliveries
         WHERE user_id = ? AND status IN ('pending', 'failed') AND attempts < 5 AND next_attempt_at <= ?
         ORDER BY created_at ASC LIMIT 1`
      ).get(userId, nowMs()) as { id: string; provider: ChatProvider; payload_json: string; attempts: number } | undefined;
      if (!found) return null;
      const claimed = db.prepare("UPDATE notification_deliveries SET status = 'processing', attempts = attempts + 1, last_error = NULL, locked_at = ? WHERE id = ? AND status IN ('pending', 'failed')").run(nowMs(), found.id);
      return claimed.changes === 1 ? { ...found, attempts: found.attempts + 1 } : null;
    })();
    if (!row) break;
    const integration = rowFor(userId, row.provider);
    if (!integration || !integration.enabled) {
      db.prepare("UPDATE notification_deliveries SET status = 'failed', last_error = ?, next_attempt_at = ?, locked_at = NULL WHERE id = ?").run("Integration is disabled.", nowMs() + 86_400_000, row.id);
      failed += 1;
      continue;
    }
    try {
      await postWebhook(integration, JSON.parse(row.payload_json) as NotificationPayload);
      db.prepare("UPDATE notification_deliveries SET status = 'delivered', delivered_at = ?, last_error = NULL, locked_at = NULL WHERE id = ?").run(nowMs(), row.id);
      audit(userId, row.provider, "notification.delivered", row.id);
      delivered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delivery failed";
      const delay = Math.min(3_600_000, 30_000 * 2 ** Math.max(0, row.attempts - 1));
      db.prepare("UPDATE notification_deliveries SET status = 'failed', last_error = ?, next_attempt_at = ?, locked_at = NULL WHERE id = ?").run(message.slice(0, 500), nowMs() + delay, row.id);
      audit(userId, row.provider, "notification.failed", message);
      failed += 1;
    }
  }
  return { delivered, failed };
}

export async function deliverDueNotificationsAll(limit = 50): Promise<{ delivered: number; failed: number; recovered: number }> {
  const db = getDb();
  const recovered = db.prepare(
    `UPDATE notification_deliveries
     SET status = 'failed', last_error = 'Recovered after an interrupted delivery.', next_attempt_at = ?, locked_at = NULL
     WHERE status = 'processing' AND locked_at IS NOT NULL AND locked_at < ?`
  ).run(nowMs(), nowMs() - 5 * 60_000).changes;
  const users = db.prepare(
    `SELECT DISTINCT user_id FROM notification_deliveries
     WHERE status IN ('pending', 'failed') AND attempts < 5 AND next_attempt_at <= ?
     ORDER BY created_at ASC LIMIT ?`
  ).all(nowMs(), Math.max(1, Math.min(100, Math.trunc(limit)))) as { user_id: string }[];
  let delivered = 0;
  let failed = 0;
  for (const row of users) {
    const result = await deliverPendingNotifications(row.user_id, Math.max(1, limit - delivered - failed));
    delivered += result.delivered;
    failed += result.failed;
    if (delivered + failed >= limit) break;
  }
  return { delivered, failed, recovered };
}

export type IntegrationOperations = {
  deliveries: { id: string; provider: ChatProvider; event_key: string; status: string; attempts: number; last_error: string | null; created_at: number; delivered_at: number | null }[];
  audit: { id: string; provider: ChatProvider; action: string; detail: string | null; created_at: number }[];
};

export function integrationOperations(userId: string): IntegrationOperations {
  return {
    deliveries: getDb().prepare(
      `SELECT id, provider, event_key, status, attempts, last_error, created_at, delivered_at
       FROM notification_deliveries WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`
    ).all(userId) as IntegrationOperations["deliveries"],
    audit: getDb().prepare(
      `SELECT id, provider, action, detail, created_at
       FROM integration_audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`
    ).all(userId) as IntegrationOperations["audit"],
  };
}

export function retryFailedNotifications(userId: string): number {
  const changed = getDb().prepare(
    `UPDATE notification_deliveries SET status = 'pending', attempts = 0, next_attempt_at = ?, last_error = NULL, locked_at = NULL
     WHERE user_id = ? AND status = 'failed'`
  ).run(nowMs(), userId).changes;
  return changed;
}

export async function publishCloseNotifications(userId: string, summary: CloseSummary): Promise<{ queued: number; delivered: number; failed: number }> {
  const queued = enqueueReportNotifications(userId, summary);
  const delivery = await deliverPendingNotifications(userId);
  return { queued, ...delivery };
}

export async function sendTestNotification(userId: string, kindValue: string): Promise<void> {
  const kind = provider(kindValue);
  const row = rowFor(userId, kind);
  if (!row) throw new HttpError(404, `${kind === "slack" ? "Slack" : "Discord"} is not connected.`, "not_configured");
  await postWebhook(row, {
    event: "report.completed",
    title: "Vera connection verified",
    summary: "This channel can receive signed-report and evidence-gap notifications.",
    severity: "ok",
    report_id: "test",
    report_url: "",
    proven: 0,
    needs_attention: 0,
    payments: 0,
    occurred_at: new Date().toISOString(),
  });
  audit(userId, kind, "connection.tested");
}

export async function registerDiscordCommands(userId: string): Promise<void> {
  const row = rowFor(userId, "discord");
  if (!row?.application_id || !row.bot_token_cipher || !row.command_public_key) {
    throw new HttpError(400, "Save the Discord application ID, public key, and bot token before registering commands.", "discord_commands_not_configured");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://discord.com/api/v10/applications/${row.application_id}/commands`, {
      method: "PUT",
      headers: { authorization: `Bot ${decryptSecret(row.bot_token_cipher)}`, "content-type": "application/json", "user-agent": "Vera/1.0" },
      body: JSON.stringify([{
        name: "vera",
        description: "Read verified Vera payment and evidence status",
        options: [
          { type: 1, name: "issues", description: "List current evidence issues" },
          { type: 1, name: "payment", description: "Show one payment summary", options: [{ type: 3, name: "id", description: "Vera payment ID", required: true }] },
        ],
      }]),
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new HttpError(502, `Discord command registration returned HTTP ${response.status}.`, "discord_registration_failed");
    getDb().prepare("UPDATE chat_integrations SET commands_registered_at = ?, updated_at = ? WHERE user_id = ? AND provider = 'discord'").run(nowMs(), nowMs(), userId);
    audit(userId, "discord", "commands.registered");
  } finally { clearTimeout(timeout); }
}

function safeEqualHex(expected: string, actual: string): boolean {
  if (!/^[a-f0-9]+$/i.test(actual) || expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}

export function verifySlackRequest(userId: string, timestamp: string, rawBody: string, signature: string): boolean {
  const row = rowFor(userId, "slack");
  if (!row?.signing_secret_cipher || !/^v0=[a-f0-9]{64}$/i.test(signature)) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  const digest = createHmac("sha256", decryptSecret(row.signing_secret_cipher)).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  return safeEqualHex(digest, signature.slice(3));
}

export function verifyDiscordRequest(userId: string, timestamp: string, rawBody: string, signature: string): boolean {
  const row = rowFor(userId, "discord");
  if (!row?.command_public_key || !/^[a-f0-9]{128}$/i.test(signature) || !timestamp) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  try {
    const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(row.command_public_key, "hex")]);
    const key = createPublicKey({ key: der, format: "der", type: "spki" });
    return verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signature, "hex"));
  } catch { return false; }
}

export function chatCommand(userId: string, text: string): string {
  const [command = "help", ...rest] = text.trim().split(/\s+/);
  if (!text.trim() || command === "help") return "Vera commands: `issues` and `payment <payment-id>`. Results are read-only; open Vera to take action.";
  if (command === "issues") {
    const reviews = listReviews(userId, "open");
    if (!reviews.length) return "Vera has no open evidence issues.";
    const sample = reviews.slice(0, 5).map((review) => `• ${review.sale_id}: ${review.code ?? review.claim_type}`).join("\n");
    return `${reviews.length} open evidence issue${reviews.length === 1 ? "" : "s"}:\n${sample}${reviews.length > 5 ? `\n…and ${reviews.length - 5} more.` : ""}`;
  }
  if (command === "payment") {
    const paymentId = rest.join(" ").trim();
    if (!paymentId) return "Usage: `payment <payment-id>`.";
    const record = recordForUser(userId, paymentId);
    if (!record) return "That payment was not found in this Vera workspace.";
    const open = listReviews(userId, "open").filter((review) => review.sale_id === paymentId);
    return `${paymentId}: ₹${(record.payment.amount_minor / 100).toFixed(2)} · ${record.payment.rail}. ${open.length ? `${open.length} evidence issue${open.length === 1 ? "" : "s"} need attention.` : "No open evidence issues."}`;
  }
  return "Unknown command. Use `issues` or `payment <payment-id>`.";
}

export function commandEndpoint(userId: string, kind: ChatProvider): string {
  const base = getSystemSettings().public_url.replace(/\/$/, "");
  return `${base}/api/integrations/${kind}/${encodeURIComponent(userId)}`;
}
