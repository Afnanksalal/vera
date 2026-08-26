import Razorpay from "razorpay";
import { decryptSecret, encryptSecret, hmacSha256Hex, randomId, timingSafeEqualHex } from "./crypto";
import { getDb, nowMs } from "./db";
import { HttpError } from "./http";
import { ingestRecords, recordForUser, type IngestResult } from "./ledger";
import { paymentToRecord, type RazorpayPaymentLike, type RazorpayRefundLike } from "./razorpay-map";
import { getSystemSettings } from "./settings";
import type { ExternalRecord } from "@/mandate/adapters";
import { sha256 } from "@/mandate/canonical";

export type RazorpayPublic = {
  configured: boolean;
  key_id: string | null;
  mode: "test" | "live" | null;
  webhook_url: string;
  has_webhook_secret: boolean;
};

function modeOf(keyId: string): "test" | "live" {
  return keyId.startsWith("rzp_live_") ? "live" : "test";
}

function assertKeyId(keyId: string): void {
  if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) {
    throw new HttpError(400, "Razorpay key_id looks invalid.", "invalid_key");
  }
  if (keyId.startsWith("rzp_live_") && !getSystemSettings().allow_live_razorpay) {
    throw new HttpError(400, "Live Razorpay keys are disabled. Enable live mode in Settings first.", "live_blocked");
  }
}

export function razorpayPublic(userId: string): RazorpayPublic {
  const row = getDb()
    .prepare("SELECT key_id, webhook_secret_cipher FROM razorpay_accounts WHERE user_id = ?")
    .get(userId) as { key_id: string; webhook_secret_cipher: string | null } | undefined;
  return {
    configured: Boolean(row),
    key_id: row?.key_id ?? null,
    mode: row ? modeOf(row.key_id) : null,
    webhook_url: `${getSystemSettings().public_url}/api/webhooks/razorpay/${userId}`,
    has_webhook_secret: Boolean(row?.webhook_secret_cipher),
  };
}

export function saveRazorpayAccount(
  userId: string,
  input: { key_id: string; key_secret: string; webhook_secret?: string }
): RazorpayPublic {
  const current = getDb().prepare(
    "SELECT key_id, key_secret_cipher, webhook_secret_cipher FROM razorpay_accounts WHERE user_id = ?"
  ).get(userId) as { key_id: string; key_secret_cipher: string; webhook_secret_cipher: string | null } | undefined;
  const keyId = input.key_id.trim() || current?.key_id || "";
  const keySecret = input.key_secret.trim();
  const webhookSecret = input.webhook_secret?.trim() ?? "";
  assertKeyId(keyId);
  if (!current && !keySecret) throw new HttpError(400, "Enter the Razorpay key secret.", "invalid_secret");
  if (keySecret && (keySecret.length < 16 || keySecret.length > 128)) {
    throw new HttpError(400, "Razorpay key_secret looks invalid.", "invalid_secret");
  }
  if (webhookSecret && (webhookSecret.length < 8 || webhookSecret.length > 256)) {
    throw new HttpError(400, "Webhook secret looks invalid.", "invalid_webhook_secret");
  }
  getDb()
    .prepare(
      `INSERT INTO razorpay_accounts (user_id, key_id, key_secret_cipher, webhook_secret_cipher, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         key_id = excluded.key_id,
         key_secret_cipher = excluded.key_secret_cipher,
         webhook_secret_cipher = excluded.webhook_secret_cipher,
         updated_at = excluded.updated_at`
    )
    .run(
      userId,
      keyId,
      keySecret ? encryptSecret(keySecret) : current!.key_secret_cipher,
      webhookSecret ? encryptSecret(webhookSecret) : current?.webhook_secret_cipher ?? null,
      nowMs()
    );
  return razorpayPublic(userId);
}

export function deleteRazorpayAccount(userId: string): void {
  getDb().prepare("DELETE FROM razorpay_accounts WHERE user_id = ?").run(userId);
}

export function razorpayCredentials(userId: string): { key_id: string; key_secret: string; webhook_secret: string | null } {
  const row = getDb()
    .prepare("SELECT key_id, key_secret_cipher, webhook_secret_cipher FROM razorpay_accounts WHERE user_id = ?")
    .get(userId) as { key_id: string; key_secret_cipher: string; webhook_secret_cipher: string | null } | undefined;
  if (!row) throw new HttpError(400, "Connect Razorpay in settings first.", "not_configured");
  return {
    key_id: row.key_id,
    key_secret: decryptSecret(row.key_secret_cipher),
    webhook_secret: row.webhook_secret_cipher ? decryptSecret(row.webhook_secret_cipher) : null,
  };
}

function clientFor(userId: string): InstanceType<typeof Razorpay> {
  const creds = razorpayCredentials(userId);
  return new Razorpay({ key_id: creds.key_id, key_secret: creds.key_secret });
}

export function verifyWebhookSignature(userId: string, rawBody: string, signature: string | null): void {
  const secret = razorpayCredentials(userId).webhook_secret;
  if (!secret) throw new HttpError(400, "No webhook secret stored for this account.", "no_webhook_secret");
  if (!signature) throw new HttpError(401, "Missing X-Razorpay-Signature.", "bad_signature");
  if (!timingSafeEqualHex(hmacSha256Hex(secret, rawBody), signature)) {
    throw new HttpError(401, "Invalid Razorpay webhook signature.", "bad_signature");
  }
}

export function verifyCheckoutSignature(userId: string, orderId: string, paymentId: string, signature: string): void {
  if (!timingSafeEqualHex(hmacSha256Hex(razorpayCredentials(userId).key_secret, `${orderId}|${paymentId}`), signature)) {
    throw new HttpError(401, "Invalid Razorpay checkout signature.", "bad_signature");
  }
}

export async function createRazorpayOrder(
  userId: string,
  amountPaise: number,
  notes: Record<string, string> = {}
): Promise<{ id: string; amount: number; currency: string; key_id: string }> {
  if (!Number.isInteger(amountPaise) || amountPaise < 100) {
    throw new HttpError(400, "Amount must be integer paise of at least ₹1.", "invalid_amount");
  }
  const noteEntries = Object.entries(notes);
  if (noteEntries.length > 15 || noteEntries.some(([key, value]) => !key || key.length > 64 || typeof value !== "string" || value.length > 256)) {
    throw new HttpError(400, "Order notes contain too many or invalid fields.", "invalid_notes");
  }
  const creds = razorpayCredentials(userId);
  const order = await clientFor(userId).orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: randomId("rcpt").slice(0, 40),
    notes: { ...notes, vera_user_id: userId },
  });
  return { id: order.id, amount: Number(order.amount), currency: order.currency, key_id: creds.key_id };
}

function asPayment(p: {
  id: string;
  amount: number | string;
  currency?: string;
  status: string;
  method?: string;
  description?: string | null;
  email?: string | null;
  contact?: string | number | null;
  notes?: Record<string, string> | string[] | null;
  created_at: number;
  order_id?: string | null;
  invoice_id?: string | null;
  captured?: boolean;
}): RazorpayPaymentLike {
  return {
    id: p.id,
    amount: Number(p.amount),
    currency: p.currency,
    status: p.status,
    method: p.method,
    description: p.description ?? null,
    email: p.email ?? null,
    contact: p.contact == null ? null : String(p.contact),
    notes: p.notes ?? null,
    created_at: p.created_at,
    order_id: p.order_id,
    invoice_id: p.invoice_id,
    captured: Boolean(p.captured),
  };
}

async function refundsFor(client: InstanceType<typeof Razorpay>, paymentId: string): Promise<RazorpayRefundLike[]> {
  const page = await client.payments.fetchMultipleRefund(paymentId, { count: 100 });
  return (page.items ?? []).map((r) => ({
    id: r.id,
    payment_id: r.payment_id,
    amount: Number(r.amount),
    notes: (r.notes as Record<string, string> | undefined) ?? null,
    created_at: r.created_at,
  }));
}

function eventCount(userId: string): number {
  return (getDb().prepare("SELECT COUNT(*) as n FROM ingest_events WHERE user_id = ?").get(userId) as { n: number }).n;
}

export async function ingestRazorpayPayment(userId: string, payment: RazorpayPaymentLike): Promise<IngestResult> {
  if (payment.status !== "captured" && payment.captured !== true) {
    return { inserted: 0, updated: 0, unchanged: 0, total: eventCount(userId) };
  }
  const refunds = await refundsFor(clientFor(userId), payment.id);
  const fresh = paymentToRecord(payment, refunds);
  const existing = recordForUser(userId, payment.id);
  return ingestRecords(userId, "razorpay", [existing ? mergeRazorpayRecord(existing, fresh) : fresh]);
}

export function mergeRazorpayRecord(existing: ExternalRecord, fresh: ExternalRecord): ExternalRecord {
  return {
    ...fresh,
    ap2_intent: fresh.ap2_intent ?? existing.ap2_intent,
    ap2_cart: fresh.ap2_cart ?? existing.ap2_cart,
    receipt: fresh.receipt ?? existing.receipt,
    order: fresh.order ?? existing.order,
    settlement: fresh.settlement ?? existing.settlement,
    bank: fresh.bank ?? existing.bank,
  };
}

export async function ingestPaymentId(userId: string, paymentId: string): Promise<IngestResult> {
  const payment = await clientFor(userId).payments.fetch(paymentId);
  return ingestRazorpayPayment(userId, asPayment(payment));
}

export type RazorpayReconRow = {
  entity_id: string;
  type: string;
  amount: number | string;
  credit: number;
  fee: number;
  tax: number;
  currency: string;
  settled: boolean;
  settled_at: number;
  settlement_id: string;
  settlement_utr?: string | null;
};

export function settlementFromRazorpayRecon(row: RazorpayReconRow): NonNullable<ExternalRecord["settlement"]> {
  const gross = Number(row.amount);
  if (![gross, row.credit, row.fee, row.tax, row.settled_at].every(Number.isSafeInteger) || gross < 0 || row.credit < 0 || row.fee < 0 || row.tax < 0) throw new Error("invalid monetary fields");
  if (gross - row.fee - row.tax !== row.credit) throw new Error("gross minus fee and tax does not equal credited amount");
  if (!row.settlement_id || !row.entity_id || row.settled_at <= 0) throw new Error("invalid settlement identity or timestamp");
  return {
    id: `${row.settlement_id}:${row.entity_id}`,
    gross_minor: gross,
    fee_minor: row.fee,
    tax_minor: row.tax,
    net_minor: row.credit,
    psp_ref: row.settlement_utr ? `${row.settlement_id}/${row.settlement_utr}` : row.settlement_id,
    settled_on: new Date(row.settled_at * 1000).toISOString(),
    source: "razorpay_recon",
    source_hash: sha256(row),
  };
}

async function syncRazorpayRecon(userId: string, year: number, month: number): Promise<IngestResult & { failed: number; errors: string[] }> {
  const now = new Date();
  if (!Number.isInteger(year) || year < 2010 || year > now.getUTCFullYear() + 1 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new HttpError(400, "Settlement month is invalid.", "invalid_settlement_month");
  }
  const client = clientFor(userId);
  let inserted = 0, updated = 0, unchanged = 0, failed = 0;
  const errors: string[] = [];
  for (let skip = 0; ; skip += 1000) {
    const response = await client.settlements.reports({ year, month, count: 1000, skip }) as unknown as { items?: RazorpayReconRow[] };
    const items = Array.isArray(response?.items) ? response.items : [];
    for (const row of items) {
      if (row.type !== "payment" || !row.settled || row.currency !== "INR") continue;
      try {
        let record = recordForUser(userId, row.entity_id);
        if (!record) {
          await ingestPaymentId(userId, row.entity_id);
          record = recordForUser(userId, row.entity_id);
        }
        if (!record) throw new Error("captured payment is unavailable");
        record.settlement = settlementFromRazorpayRecon(row);
        const result = ingestRecords(userId, "razorpay", [record]);
        inserted += result.inserted; updated += result.updated; unchanged += result.unchanged;
      } catch (error) {
        failed += 1;
        if (errors.length < 20) errors.push(`${row.entity_id}: ${error instanceof Error ? error.message : "recon sync failed"}`.slice(0, 500));
      }
    }
    if (items.length < 1000) break;
  }
  return { inserted, updated, unchanged, failed, errors, total: eventCount(userId) };
}

export async function syncRazorpayPayments(userId: string, count = 100, settlementMonth?: { year: number; month: number }): Promise<IngestResult & { failed: number; errors: string[]; recon_processed: number }> {
  const take = Math.min(1000, Math.max(1, Math.trunc(count)));
  const client = clientFor(userId);
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  const errors: string[] = [];
  for (let skip = 0; skip < take; skip += 100) {
    const pageSize = Math.min(100, take - skip);
    const page = await client.payments.all({ count: pageSize, skip });
    for (const item of page.items ?? []) {
      if (item.status !== "captured" && item.captured !== true) continue;
      try {
        const result = await ingestRazorpayPayment(userId, asPayment(item));
        const evidence = item.order_id
          ? (await import("./purchases")).attachVerifiedPurchaseEvidence(userId, item.order_id, item.id)
          : null;
        inserted += result.inserted + (evidence?.inserted ?? 0);
        updated += result.updated + (evidence?.updated ?? 0);
        unchanged += result.unchanged + (evidence?.unchanged ?? 0);
      } catch (error) {
        failed += 1;
        if (errors.length < 20) errors.push(`${item.id}: ${error instanceof Error ? error.message : "sync failed"}`.slice(0, 500));
      }
    }
    if ((page.items ?? []).length < pageSize) break;
  }
  let reconProcessed = 0;
  if (settlementMonth) {
    const recon = await syncRazorpayRecon(userId, settlementMonth.year, settlementMonth.month);
    inserted += recon.inserted; updated += recon.updated; unchanged += recon.unchanged; failed += recon.failed;
    reconProcessed = recon.inserted + recon.updated + recon.unchanged;
    for (const error of recon.errors) if (errors.length < 20) errors.push(error);
  }
  return { inserted, updated, unchanged, failed, errors, recon_processed: reconProcessed, total: eventCount(userId) };
}

export function parseWebhookPayment(event: unknown): RazorpayPaymentLike | null {
  if (!event || typeof event !== "object") return null;
  const body = event as { payload?: { payment?: { entity?: RazorpayPaymentLike } } };
  return body.payload?.payment?.entity?.id ? body.payload.payment.entity : null;
}
