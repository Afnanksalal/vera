import { sha256Hex, randomId } from "./crypto";
import { getDb, nowMs } from "./db";
import { HttpError } from "./http";
import { ingestRecords, recordForUser, type IngestResult } from "./ledger";

function requiredString(value: unknown, field: string, max = 512): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new HttpError(400, `${field} is required.`, "invalid_evidence");
  return value.trim();
}

function optionalString(value: unknown, max = 512): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new HttpError(400, "Evidence field is invalid.", "invalid_evidence");
  return value.trim();
}

function paise(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new HttpError(400, `${field} must be non-negative integer paise.`, "invalid_evidence");
  return Number(value);
}

function isoDate(value: unknown, field: string): string {
  const text = requiredString(value, field);
  if (!Number.isFinite(Date.parse(text))) throw new HttpError(400, `${field} must be a valid date.`, "invalid_evidence");
  return new Date(text).toISOString();
}

function artifact(raw: Record<string, unknown>): { name: string; mime: string; bytes: Buffer; hash: string } {
  const name = requiredString(raw.file_name, "Evidence file name", 255);
  const mime = requiredString(raw.mime_type, "Evidence MIME type", 128);
  const encoded = requiredString(raw.file_base64, "Evidence file", 1_500_000);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0) throw new HttpError(400, "Evidence file is not valid base64.", "invalid_evidence");
  let bytes: Buffer;
  try { bytes = Buffer.from(encoded, "base64"); } catch { throw new HttpError(400, "Evidence file is not valid base64.", "invalid_evidence"); }
  if (bytes.length === 0 || bytes.length > 1_000_000) throw new HttpError(400, "Evidence file must be between 1 byte and 1 MB.", "invalid_evidence");
  return { name, mime, bytes, hash: sha256Hex(bytes) };
}

export function attachExternalEvidence(userId: string, raw: unknown): IngestResult {
  if (!raw || typeof raw !== "object") throw new HttpError(400, "Evidence details are required.", "invalid_evidence");
  const body = raw as Record<string, unknown>;
  const paymentId = requiredString(body.payment_id, "Payment ID", 256);
  const kind = body.kind === "processor" || body.kind === "bank_statement" ? body.kind : null;
  if (!kind) throw new HttpError(400, "Evidence kind is invalid.", "invalid_evidence");
  const record = recordForUser(userId, paymentId);
  if (!record) throw new HttpError(404, "Payment was not found in this workspace.", "not_found");
  const file = artifact(body);
  if (kind === "processor") {
    const gross = paise(body.gross_minor, "Gross amount");
    const fee = paise(body.fee_minor, "Fee");
    const tax = paise(body.tax_minor, "Tax");
    const net = paise(body.net_minor, "Net amount");
    if (gross - fee - tax !== net) throw new HttpError(400, "Gross minus fee and tax must equal net.", "invalid_evidence");
    record.settlement = {
      id: requiredString(body.settlement_id, "Settlement ID"),
      gross_minor: gross,
      fee_minor: fee,
      tax_minor: tax,
      net_minor: net,
      psp_ref: requiredString(body.psp_ref, "Processor reference or UTR"),
      settled_on: isoDate(body.settled_on, "Settlement date"),
      source: "processor_report",
      source_hash: file.hash,
    };
  } else {
    record.bank = {
      id: requiredString(body.bank_id, "Bank transaction ID"),
      amount_minor: paise(body.amount_minor, "Bank amount"),
      date: isoDate(body.date, "Bank credit date"),
      narration: requiredString(body.narration, "Bank narration"),
      intent_ref: optionalString(body.intent_ref),
      utr: requiredString(body.utr, "UTR"),
      source: "bank_statement",
      source_hash: file.hash,
    };
  }
  const db = getDb();
  return db.transaction(() => {
    const result = ingestRecords(userId, `evidence:${kind}`, [record]);
    const usage = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(length(payload)), 0) AS bytes FROM evidence_artifacts WHERE user_id = ?").get(userId) as { n: number; bytes: number };
    if (usage.n >= 1_000 || usage.bytes + file.bytes.length > 6 * 1024 * 1024) throw new HttpError(400, "Evidence storage limit reached (1,000 files or 6 MB).", "evidence_quota");
    const duplicate = db.prepare("SELECT 1 FROM evidence_artifacts WHERE user_id = ? AND payment_id = ? AND kind = ? AND payload_hash = ? LIMIT 1").get(userId, paymentId, kind, file.hash);
    if (duplicate) return result;
    db.prepare(
      "INSERT INTO evidence_artifacts (id, user_id, payment_id, kind, file_name, mime_type, payload, payload_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(randomId("art"), userId, paymentId, kind, file.name, file.mime, file.bytes, file.hash, nowMs());
    return result;
  })();
}
