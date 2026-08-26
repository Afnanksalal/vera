import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { authSecret } from "./config";
import { getDb, nowMs } from "./db";
import { randomId, sha256Hex } from "./crypto";
import { HttpError } from "./http";

const MIME = "application/vnd.vera.backup+json";

type BackupEnvelope = {
  format: "vera-backup";
  version: 1;
  created_at: string;
  kdf: { name: "scrypt"; salt: string; n: 32768; r: 8; p: 1 };
  cipher: { name: "aes-256-gcm"; iv: string; tag: string; ciphertext: string };
};

function password(value: unknown): string {
  if (typeof value !== "string" || value.length < 16 || value.length > 256) {
    throw new HttpError(400, "Backup passphrase must be between 16 and 256 characters.", "invalid_passphrase");
  }
  return value;
}

function audit(userId: string, action: string, detail: string): void {
  getDb().prepare("INSERT INTO backup_audit_log (id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(randomId("baklog"), userId, action, detail, nowMs());
}

export function createEncryptedBackup(userId: string, rawPassphrase: unknown): { bytes: Buffer; fileName: string; mime: string } {
  const passphrase = password(rawPassphrase);
  const db = getDb();
  db.pragma("wal_checkpoint(FULL)");
  const database = db.serialize();
  const payload = Buffer.from(JSON.stringify({
    format: "vera-recovery-payload",
    version: 1,
    database: database.toString("base64"),
    master_key: authSecret(),
    database_sha256: sha256Hex(database),
  }));
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const envelope: BackupEnvelope = {
    format: "vera-backup",
    version: 1,
    created_at: new Date().toISOString(),
    kdf: { name: "scrypt", salt: salt.toString("base64url"), n: 32768, r: 8, p: 1 },
    cipher: { name: "aes-256-gcm", iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") },
  };
  const bytes = Buffer.from(JSON.stringify(envelope));
  audit(userId, "backup_created", `sha256:${sha256Hex(bytes)} bytes:${bytes.length}`);
  return { bytes, mime: MIME, fileName: `vera-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.vera` };
}

export function verifyEncryptedBackup(userId: string, rawPassphrase: unknown, encoded: unknown): { created_at: string; database_bytes: number; database_sha256: string } {
  const passphrase = password(rawPassphrase);
  if (typeof encoded !== "string" || encoded.length > 100_000_000) throw new HttpError(400, "Backup file is invalid or too large.", "invalid_backup");
  try {
    const envelope = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as BackupEnvelope;
    if (envelope.format !== "vera-backup" || envelope.version !== 1 || envelope.kdf?.name !== "scrypt" || envelope.cipher?.name !== "aes-256-gcm") throw new Error("format");
    const salt = Buffer.from(envelope.kdf.salt, "base64url");
    if (envelope.kdf.n !== 32768 || envelope.kdf.r !== 8 || envelope.kdf.p !== 1) throw new Error("kdf");
    const key = scryptSync(passphrase, salt, 32, { N: envelope.kdf.n, r: envelope.kdf.r, p: envelope.kdf.p, maxmem: 128 * 1024 * 1024 });
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.cipher.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(envelope.cipher.tag, "base64url"));
    const clear = Buffer.concat([decipher.update(Buffer.from(envelope.cipher.ciphertext, "base64url")), decipher.final()]);
    const payload = JSON.parse(clear.toString("utf8")) as { format: string; database: string; database_sha256: string; master_key: string };
    const database = Buffer.from(payload.database, "base64");
    if (payload.format !== "vera-recovery-payload" || payload.master_key.length < 32 || sha256Hex(database) !== payload.database_sha256 || !database.subarray(0, 16).equals(Buffer.from("SQLite format 3\0"))) throw new Error("contents");
    audit(userId, "backup_verified", `sha256:${sha256Hex(Buffer.from(encoded, "base64"))}`);
    return { created_at: envelope.created_at, database_bytes: database.length, database_sha256: payload.database_sha256 };
  } catch {
    audit(userId, "backup_verification_failed", "Invalid file or passphrase");
    throw new HttpError(400, "Backup verification failed. Check the file and passphrase.", "invalid_backup");
  }
}

export function backupHistory(userId: string) {
  return getDb().prepare("SELECT id, action, detail, created_at FROM backup_audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 20").all(userId) as { id: string; action: string; detail: string; created_at: number }[];
}
