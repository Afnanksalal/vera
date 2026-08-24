import { newAuditorKeypair, type AuditorKeypair } from "@/mandate/audit";
import { decryptSecret, encryptSecret } from "./crypto";
import { getDb, nowMs } from "./db";

/** Return the installation's stable audit identity, creating it atomically once. */
export function signingIdentity(): AuditorKeypair {
  const db = getDb();
  const existing = db.prepare("SELECT private_key_cipher, public_key_pem FROM signing_identity WHERE id = 1").get() as
    | { private_key_cipher: string; public_key_pem: string }
    | undefined;
  if (existing) {
    return { privateKeyPem: decryptSecret(existing.private_key_cipher), publicKeyPem: existing.public_key_pem };
  }
  const created = newAuditorKeypair();
  db.prepare("INSERT OR IGNORE INTO signing_identity (id, private_key_cipher, public_key_pem, created_at) VALUES (1, ?, ?, ?)")
    .run(encryptSecret(created.privateKeyPem), created.publicKeyPem, nowMs());
  const stored = db.prepare("SELECT private_key_cipher, public_key_pem FROM signing_identity WHERE id = 1").get() as {
    private_key_cipher: string;
    public_key_pem: string;
  };
  return { privateKeyPem: decryptSecret(stored.private_key_cipher), publicKeyPem: stored.public_key_pem };
}

export function signingPublicKey(): string {
  return signingIdentity().publicKeyPem;
}
