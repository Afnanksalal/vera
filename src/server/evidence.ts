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

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (quoted) throw new HttpError(400, "CSV contains an unterminated quoted field.", "invalid_csv");
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

export function importBankStatementCsv(userId: string, raw: unknown): IngestResult & { rows: number } {
  if (!raw || typeof raw !== "object") throw new HttpError(400, "Bank statement is required.", "invalid_evidence");
  const body = raw as Record<string, unknown>;
  const file = artifact({ ...body, mime_type: body.mime_type || "text/csv" });
  const rows = csvRows(file.bytes.toString("utf8"));
  if (rows.length < 2 || rows.length > 201) throw new HttpError(400, "CSV must contain a header and between 1 and 200 data rows.", "invalid_csv");
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const required = ["payment_id", "bank_id", "amount", "date", "narration", "utr"];
  for (const name of required) if (!headers.includes(name)) throw new HttpError(400, `CSV is missing the ${name} column.`, "invalid_csv");
  const index = (name: string) => headers.indexOf(name);
  const records = rows.slice(1).map((cells, offset) => {
    const value = (name: string) => (cells[index(name)] ?? "").trim();
    const paymentId = requiredString(value("payment_id"), `Row ${offset + 2} payment_id`, 256);
    const record = recordForUser(userId, paymentId);
    if (!record) throw new HttpError(400, `Row ${offset + 2} references an unknown payment.`, "invalid_csv");
    const amount = Number(value("amount"));
    if (!Number.isFinite(amount) || amount < 0 || Math.round(amount * 100) !== amount * 100) throw new HttpError(400, `Row ${offset + 2} amount must have at most two decimal places.`, "invalid_csv");
    record.bank = {
      id: requiredString(value("bank_id"), `Row ${offset + 2} bank_id`),
      amount_minor: Math.round(amount * 100),
      date: isoDate(value("date"), `Row ${offset + 2} date`),
      narration: requiredString(value("narration"), `Row ${offset + 2} narration`),
      utr: requiredString(value("utr"), `Row ${offset + 2} utr`),
      intent_ref: headers.includes("intent_ref") ? optionalString(value("intent_ref")) : null,
      source: "bank_statement",
      source_hash: file.hash,
    };
    return record;
  });
  const db = getDb();
  return db.transaction(() => {
    const usage = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(length(payload)), 0) AS bytes FROM evidence_artifacts WHERE user_id = ?").get(userId) as { n: number; bytes: number };
    if (usage.n >= 1_000 || usage.bytes + file.bytes.length > 6 * 1024 * 1024) throw new HttpError(400, "Evidence storage limit reached (1,000 files or 6 MB).", "evidence_quota");
    const result = ingestRecords(userId, "evidence:bank_csv", records);
    const duplicate = db.prepare("SELECT 1 FROM evidence_artifacts WHERE user_id = ? AND kind = 'bank_statement' AND payload_hash = ? LIMIT 1").get(userId, file.hash);
    if (!duplicate) db.prepare("INSERT INTO evidence_artifacts (id, user_id, payment_id, kind, file_name, mime_type, payload, payload_hash, created_at) VALUES (?, ?, ?, 'bank_statement', ?, ?, ?, ?, ?)")
      .run(randomId("art"), userId, `batch:${randomId("bank")}`, file.name, file.mime, file.bytes, file.hash, nowMs());
    return { ...result, rows: records.length };
  })();
}
