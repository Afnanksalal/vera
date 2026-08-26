import { decryptSecret, encryptSecret, randomId } from "./crypto";
import { getDb, nowMs } from "./db";
import { masterKeyring, newMasterKey, writeMasterKeyring } from "./config";
import { HttpError } from "./http";
import { log } from "./logger";

const SECRET_COLUMNS = [
  ["razorpay_accounts", "key_secret_cipher"], ["razorpay_accounts", "webhook_secret_cipher"],
  ["ai_settings", "api_key_cipher"], ["signing_identity", "private_key_cipher"],
  ["evidence_signers", "private_key_cipher"], ["chat_integrations", "webhook_url_cipher"],
  ["chat_integrations", "signing_secret_cipher"], ["chat_integrations", "bot_token_cipher"],
  ["bank_feed_connections", "account_number_cipher"],
] as const;

export function keyRotationStatus(ownerUserId: string) {
  const lastVerified = getDb().prepare("SELECT created_at FROM backup_audit_log WHERE user_id = ? AND action = 'backup_verified' ORDER BY created_at DESC LIMIT 1").get(ownerUserId) as { created_at: number } | undefined;
  const lastRotation = getDb().prepare("SELECT created_at FROM backup_audit_log WHERE user_id = ? AND action = 'master_key_rotated' ORDER BY created_at DESC LIMIT 1").get(ownerUserId) as { created_at: number } | undefined;
  return { last_backup_verified_at: lastVerified?.created_at ?? null, last_rotated_at: lastRotation?.created_at ?? null, rotation_ready: Boolean(lastVerified && nowMs() - lastVerified.created_at <= 24 * 60 * 60_000) };
}

export function rotateMasterKey(ownerUserId: string): { reencrypted: number; sessions_revoked: number; api_keys_revoked: number } {
  if (!keyRotationStatus(ownerUserId).rotation_ready) throw new HttpError(409, "Create and verify an encrypted backup within the last 24 hours before rotating the master key.", "backup_required");
  const old = masterKeyring(); const next = newMasterKey();
  writeMasterKeyring({ version: 2, active: next, previous: [old.active, ...old.previous].slice(0, 3) });
  const db = getDb();
  let reencrypted = 0; let sessionsRevoked = 0; let apiKeysRevoked = 0;
  try {
    db.transaction(() => {
      for (const [table, column] of SECRET_COLUMNS) {
        const rows = db.prepare(`SELECT rowid AS id, ${column} AS cipher FROM ${table} WHERE ${column} IS NOT NULL`).all() as { id: number; cipher: string }[];
        const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`);
        for (const row of rows) { update.run(encryptSecret(decryptSecret(row.cipher)), row.id); reencrypted += 1; }
      }
      sessionsRevoked = db.prepare("DELETE FROM sessions").run().changes;
      apiKeysRevoked = db.prepare("DELETE FROM api_keys").run().changes;
      db.prepare("DELETE FROM organization_invitations WHERE accepted_at IS NULL").run();
      db.prepare("INSERT INTO backup_audit_log (id, user_id, action, detail, created_at) VALUES (?, ?, 'master_key_rotated', ?, ?)").run(randomId("baklog"), ownerUserId, `reencrypted:${reencrypted} sessions:${sessionsRevoked} api_keys:${apiKeysRevoked}`, nowMs());
    }).immediate();
    writeMasterKeyring({ version: 2, active: next, previous: [] });
    log("info", "security.master_key_rotated", { reencrypted, sessions_revoked: sessionsRevoked, api_keys_revoked: apiKeysRevoked });
    return { reencrypted, sessions_revoked: sessionsRevoked, api_keys_revoked: apiKeysRevoked };
  } catch (error) {
    log("error", "security.master_key_rotation_failed", { message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
