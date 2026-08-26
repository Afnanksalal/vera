import { decryptSecret, encryptSecret, randomId, sha256Hex } from "./crypto";
import { getDb, nowMs } from "./db";
import { HttpError } from "./http";
import { closeUser, ingestRecords, recordsForUser } from "./ledger";
import { log } from "./logger";
import { razorpayCredentials } from "./razorpay";

type RazorpayXTransaction = {
  id: string; amount: number; credit?: number; debit?: number; balance?: number;
  currency?: string; source?: Record<string, unknown> | null; status?: string;
  utr?: string | null; created_at: number;
};

export type BankFeedPublic = {
  configured: boolean; enabled: boolean; account_last4: string | null;
  sync_interval_minutes: number; last_synced_at: number | null; last_error: string | null;
};

export function bankFeedPublic(userId: string): BankFeedPublic {
  const row = getDb().prepare("SELECT account_number_last4, enabled, sync_interval_minutes, last_synced_at, last_error FROM bank_feed_connections WHERE user_id = ?").get(userId) as { account_number_last4: string; enabled: number; sync_interval_minutes: number; last_synced_at: number | null; last_error: string | null } | undefined;
  return { configured: Boolean(row), enabled: Boolean(row?.enabled), account_last4: row?.account_number_last4 ?? null, sync_interval_minutes: row?.sync_interval_minutes ?? 60, last_synced_at: row?.last_synced_at ?? null, last_error: row?.last_error ?? null };
}

export function saveBankFeed(userId: string, input: { account_number?: unknown; enabled?: unknown; sync_interval_minutes?: unknown }): BankFeedPublic {
  razorpayCredentials(userId);
  const db = getDb();
  const current = db.prepare("SELECT account_number_cipher FROM bank_feed_connections WHERE user_id = ?").get(userId) as { account_number_cipher: string } | undefined;
  const raw = typeof input.account_number === "string" ? input.account_number.replace(/\s+/g, "") : "";
  if (!current && !/^\d{8,32}$/.test(raw)) throw new HttpError(400, "Enter a valid RazorpayX account number.", "invalid_account_number");
  if (raw && !/^\d{8,32}$/.test(raw)) throw new HttpError(400, "RazorpayX account number must contain 8 to 32 digits.", "invalid_account_number");
  const interval = Number(input.sync_interval_minutes ?? 60);
  if (!Number.isInteger(interval) || interval < 15 || interval > 1440) throw new HttpError(400, "Sync interval must be between 15 and 1,440 minutes.", "invalid_interval");
  const cipher = raw ? encryptSecret(raw) : current!.account_number_cipher;
  const last4 = raw ? raw.slice(-4) : (db.prepare("SELECT account_number_last4 FROM bank_feed_connections WHERE user_id = ?").get(userId) as { account_number_last4: string }).account_number_last4;
  db.prepare(`INSERT INTO bank_feed_connections (user_id, provider, account_number_cipher, account_number_last4, enabled, sync_interval_minutes, updated_at)
    VALUES (?, 'razorpayx', ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET account_number_cipher=excluded.account_number_cipher, account_number_last4=excluded.account_number_last4, enabled=excluded.enabled, sync_interval_minutes=excluded.sync_interval_minutes, last_error=NULL, updated_at=excluded.updated_at`)
    .run(userId, cipher, last4, input.enabled === false ? 0 : 1, interval, nowMs());
  return bankFeedPublic(userId);
}

export function deleteBankFeed(userId: string): void { getDb().prepare("DELETE FROM bank_feed_connections WHERE user_id = ?").run(userId); }

function referenceOf(item: RazorpayXTransaction): string {
  const source = item.source ?? {};
  return String(item.utr ?? source.utr ?? source.bank_reference ?? source.reference ?? source.id ?? "").trim();
}

function candidatePayment(userId: string, item: RazorpayXTransaction) {
  const amount = Number(item.credit ?? item.amount ?? 0);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  const ref = referenceOf(item).toLowerCase();
  const happened = item.created_at * 1000;
  const candidates = recordsForUser(userId).filter((record) => {
    if (!record.settlement || record.bank) return false;
    if (record.settlement.net_minor !== amount) return false;
    const settled = Date.parse(record.settlement.settled_on);
    if (!Number.isFinite(settled) || Math.abs(settled - happened) > 5 * 24 * 60 * 60_000) return false;
    if (!ref) return true;
    return record.settlement.psp_ref.toLowerCase().includes(ref) || ref.includes(record.settlement.psp_ref.toLowerCase().split("/").at(-1) ?? "");
  });
  return candidates.length === 1 ? candidates[0] : null;
}

async function fetchTransactions(userId: string, accountNumber: string, from: number, to: number): Promise<RazorpayXTransaction[]> {
  const creds = razorpayCredentials(userId); const items: RazorpayXTransaction[] = [];
  for (let skip = 0; skip < 1000; skip += 100) {
    const url = new URL("https://api.razorpay.com/v1/transactions");
    url.searchParams.set("account_number", accountNumber); url.searchParams.set("from", String(from)); url.searchParams.set("to", String(to)); url.searchParams.set("count", "100"); url.searchParams.set("skip", String(skip));
    const response = await fetch(url, { headers: { authorization: `Basic ${Buffer.from(`${creds.key_id}:${creds.key_secret}`).toString("base64")}`, accept: "application/json", "user-agent": "Vera/1.0" }, signal: AbortSignal.timeout(15_000), redirect: "error" });
    if (!response.ok) throw new Error(`RazorpayX returned HTTP ${response.status}`);
    const body = await response.json() as { items?: RazorpayXTransaction[] };
    const page = Array.isArray(body.items) ? body.items : []; items.push(...page);
    if (page.length < 100) break;
  }
  return items;
}

export async function syncBankFeed(userId: string): Promise<{ imported: number; matched: number; ambiguous: number }> {
  const db = getDb();
  const row = db.prepare("SELECT account_number_cipher, last_cursor_at FROM bank_feed_connections WHERE user_id = ? AND enabled = 1").get(userId) as { account_number_cipher: string; last_cursor_at: number | null } | undefined;
  if (!row) throw new HttpError(400, "Connect and enable a bank feed first.", "not_configured");
  const now = nowMs(); const from = Math.floor((row.last_cursor_at ?? now - 30 * 24 * 60 * 60_000) / 1000); const to = Math.floor(now / 1000);
  try {
    const transactions = await fetchTransactions(userId, decryptSecret(row.account_number_cipher), from, to);
    let imported = 0, matched = 0, ambiguous = 0;
    for (const item of transactions) {
      if (!item?.id || !Number.isFinite(item.created_at)) continue;
      const payload = JSON.stringify(item); const hash = sha256Hex(payload);
      const inserted = db.prepare("INSERT OR IGNORE INTO bank_feed_events (id, user_id, provider, provider_event_id, payload_json, payload_hash, created_at) VALUES (?, ?, 'razorpayx', ?, ?, ?, ?)").run(randomId("bankevt"), userId, item.id, payload, hash, now).changes;
      if (!inserted) continue; imported += 1;
      const record = candidatePayment(userId, item);
      if (!record) { if (Number(item.credit ?? item.amount ?? 0) > 0) ambiguous += 1; continue; }
      const ref = referenceOf(item) || item.id;
      record.bank = { id: item.id, amount_minor: Number(item.credit ?? item.amount), date: new Date(item.created_at * 1000).toISOString(), narration: `RazorpayX credit ${ref}`, intent_ref: record.ap2_intent?.id ?? null, utr: ref, source: "bank_api", source_hash: hash };
      ingestRecords(userId, "razorpayx:transactions", [record]);
      db.prepare("UPDATE bank_feed_events SET matched_payment_id = ? WHERE user_id = ? AND provider_event_id = ?").run(record.payment.id, userId, item.id);
      const bytes = Buffer.from(payload);
      if (!(db.prepare("SELECT 1 FROM evidence_artifacts WHERE user_id=? AND payment_id=? AND payload_hash=?").get(userId, record.payment.id, hash))) db.prepare("INSERT INTO evidence_artifacts (id,user_id,payment_id,kind,file_name,mime_type,payload,payload_hash,created_at) VALUES (?,?,?,'bank_statement',?,'application/json',?,?,?)").run(randomId("art"), userId, record.payment.id, `razorpayx-${item.id}.json`, bytes, hash, now);
      matched += 1;
    }
    db.prepare("UPDATE bank_feed_connections SET last_cursor_at=?, last_synced_at=?, last_error=NULL, updated_at=? WHERE user_id=?").run(now - 5 * 60_000, now, now, userId);
    if (matched) closeUser(userId);
    log("info", "bank_feed.synced", { user_id: userId, imported, matched, ambiguous });
    return { imported, matched, ambiguous };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Bank feed sync failed";
    db.prepare("UPDATE bank_feed_connections SET last_error=?, updated_at=? WHERE user_id=?").run(message, now, userId);
    log("error", "bank_feed.failed", { user_id: userId, message }); throw error;
  }
}

export async function syncDueBankFeeds(limit = 10): Promise<{ attempted: number; failed: number }> {
  const now = nowMs(); const rows = getDb().prepare("SELECT user_id FROM bank_feed_connections WHERE enabled=1 AND (last_synced_at IS NULL OR last_synced_at + sync_interval_minutes * 60000 <= ?) ORDER BY COALESCE(last_synced_at,0) LIMIT ?").all(now, limit) as { user_id: string }[];
  let failed = 0; for (const row of rows) try { await syncBankFeed(row.user_id); } catch { failed += 1; }
  return { attempted: rows.length, failed };
}
