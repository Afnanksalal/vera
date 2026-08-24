import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

const MASTER_KEY_FILE = join(process.cwd(), "data", ".master_key");

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
  if (isTest()) return "vera-test-secret-do-not-use-in-production-ok";
  if (existsSync(MASTER_KEY_FILE)) {
    const disk = readFileSync(MASTER_KEY_FILE, "utf8").trim();
    if (disk.length >= 32) return disk;
    throw new Error("data/.master_key is invalid; restore it from backup.");
  }
  mkdirSync(dirname(MASTER_KEY_FILE), { recursive: true });
  const generated = randomBytes(48).toString("base64url");
  try {
    writeFileSync(MASTER_KEY_FILE, generated, { encoding: "utf8", mode: 0o600, flag: "wx" });
    return generated;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code: string }).code) : "";
    if (code !== "EEXIST") throw error;
    const disk = readFileSync(MASTER_KEY_FILE, "utf8").trim();
    if (disk.length >= 32) return disk;
    throw new Error("data/.master_key is invalid; restore it from backup.");
  }
}

export function databasePath(): string {
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
