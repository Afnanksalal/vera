import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

const MASTER_KEY_FILE = join(process.cwd(), "data", ".master_key");

export type MasterKey = { id: string; secret: string };
export type MasterKeyring = { version: 2; active: MasterKey; previous: MasterKey[] };

declare global { var __veraTestMasterKeyring: MasterKeyring | undefined; }

function key(secret: string): MasterKey { return { id: createHash("sha256").update(secret).digest("hex").slice(0, 16), secret }; }

function parsedKeyring(raw: string): MasterKeyring {
  if (!raw.startsWith("{")) {
    if (raw.length < 32) throw new Error("data/.master_key is invalid; restore it from backup.");
    return { version: 2, active: key(raw), previous: [] };
  }
  const value = JSON.parse(raw) as MasterKeyring;
  if (value.version !== 2 || !value.active?.id || value.active.secret?.length < 32 || !Array.isArray(value.previous) || value.previous.some((item) => !item.id || item.secret.length < 32)) throw new Error("data/.master_key is invalid; restore it from backup.");
  return value;
}

export function masterKeyring(): MasterKeyring {
  if (isTest()) { if (!globalThis.__veraTestMasterKeyring) { const active = key("vera-test-secret-do-not-use-in-production-ok"); globalThis.__veraTestMasterKeyring = { version: 2, active, previous: [] }; } return globalThis.__veraTestMasterKeyring; }
  if (existsSync(MASTER_KEY_FILE)) return parsedKeyring(readFileSync(MASTER_KEY_FILE, "utf8").trim());
  mkdirSync(dirname(MASTER_KEY_FILE), { recursive: true });
  const ring: MasterKeyring = { version: 2, active: key(randomBytes(48).toString("base64url")), previous: [] };
  try { writeFileSync(MASTER_KEY_FILE, JSON.stringify(ring), { encoding: "utf8", mode: 0o600, flag: "wx" }); return ring; }
  catch (error) { const code = error && typeof error === "object" && "code" in error ? String((error as { code: string }).code) : ""; if (code !== "EEXIST") throw error; return parsedKeyring(readFileSync(MASTER_KEY_FILE, "utf8").trim()); }
}

export function writeMasterKeyring(ring: MasterKeyring): void {
  if (isTest()) { globalThis.__veraTestMasterKeyring = ring; return; }
  mkdirSync(dirname(MASTER_KEY_FILE), { recursive: true });
  const temporary = `${MASTER_KEY_FILE}.next`;
  writeFileSync(temporary, JSON.stringify(ring), { encoding: "utf8", mode: 0o600, flag: "w" });
  try { renameSync(temporary, MASTER_KEY_FILE); }
  catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: string }).code) : "";
    if (code !== "EEXIST" && code !== "EPERM") throw error;
    writeFileSync(MASTER_KEY_FILE, JSON.stringify(ring), { encoding: "utf8", mode: 0o600, flag: "w" });
    unlinkSync(temporary);
  }
}

export function newMasterKey(): MasterKey { return key(randomBytes(48).toString("base64url")); }
export function exportMasterKeyMaterial(): string { return JSON.stringify(masterKeyring()); }
export function resetTestMasterKeyring(): void { if (isTest()) globalThis.__veraTestMasterKeyring = undefined; }

function isTest(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VERA_TEST === "1";
}

/**
 * Installation master key used for cookies, API-key pepper, and envelope
 * encryption. Vera creates it once inside the persistent data
 * directory. Back it up with the database: losing it invalidates sessions and
 * makes encrypted integration credentials unrecoverable.
 */
export function authSecret(): string {
  return masterKeyring().active.secret;
}

export function databasePath(): string {
  // HTTP contract tests run a production server against an isolated on-disk
  // database so separate Next.js route workers observe the same state.
  if (process.env.VERA_TEST_DATABASE) return process.env.VERA_TEST_DATABASE;
  if (isTest()) return ":memory:";
  return join(process.cwd(), "data", "vera.db");
}

export const MAX_INGEST_RECORDS = 200;
export const MAX_INGEST_BYTES = 1_000_000;
export const DEFAULT_MAX_EVENTS_PER_USER = 100_000;
export const ABSOLUTE_MAX_EVENTS_PER_USER = 1_000_000;

export const SESSION_COOKIE = "vera_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const API_KEY_PREFIX = "vera_";
