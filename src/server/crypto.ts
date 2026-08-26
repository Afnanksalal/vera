import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { authSecret, masterKeyring } from "./config";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/** HMAC of a session token or API key. A DB dump is insufficient without the installation master key. */
export function tokenHash(token: string): string {
  return hmacSha256Hex(authSecret(), token);
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function randomId(prefix: string, bytes = 16): string {
  return `${prefix}_${randomBytes(bytes).toString("hex")}`;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString("hex");
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4];
  const expected = Buffer.from(parts[5], "hex");
  if (!Number.isInteger(N) || !salt || expected.length !== KEY_LEN) return false;
  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, expected.length, { N, r, p });
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function envelopeKey(secret = authSecret()): Buffer {
  return scryptSync(secret, "vera-envelope-v1", KEY_LEN, {
    N: 16384,
    r: 8,
    p: 1,
  });
}

/** AES-256-GCM. Output: v2:key-id:iv:tag:ciphertext (binary fields base64url). */
export function encryptSecret(plaintext: string): string {
  const active = masterKeyring().active;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", envelopeKey(active.secret), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v2", active.id, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  const ring = masterKeyring();
  const candidates = parts[0] === "v2" && parts.length === 5 ? [...[ring.active, ...ring.previous].filter((item) => item.id === parts[1])] : parts[0] === "v1" && parts.length === 4 ? [ring.active, ...ring.previous] : [];
  const offset = parts[0] === "v2" ? 2 : 1;
  for (const candidate of candidates) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", envelopeKey(candidate.secret), Buffer.from(parts[offset], "base64url"));
      decipher.setAuthTag(Buffer.from(parts[offset + 1], "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(parts[offset + 2], "base64url")), decipher.final()]).toString("utf8");
    } catch { /* try the retained key during a crash-safe rotation */ }
  }
  throw new Error("invalid secret envelope");
}

export function hmacSha256Hex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export { timingSafeEqual };
