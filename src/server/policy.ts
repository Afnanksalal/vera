import { getDb } from "./db";

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function emailOk(email: string): boolean {
  if (email.length < 3 || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function passwordOk(password: string): boolean {
  return password.length >= 12 && password.length <= 128;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

/** Durable per-key limiter. Returns false when the caller should back off. */
export function rateLimit(key: string, max = MAX_ATTEMPTS, windowMs = WINDOW_MS): boolean {
  const db = getDb();
  return db.transaction(() => {
    const now = Date.now();
    db.prepare("DELETE FROM rate_limits WHERE reset_at < ?").run(now - 24 * 60 * 60 * 1000);
    const row = db.prepare("SELECT n, reset_at FROM rate_limits WHERE key = ?").get(key) as
      | { n: number; reset_at: number }
      | undefined;
    if (!row || now > row.reset_at) {
      db.prepare("INSERT OR REPLACE INTO rate_limits (key, n, reset_at) VALUES (?, ?, ?)").run(key, 1, now + windowMs);
      return true;
    }
    if (row.n >= max) return false;
    db.prepare("UPDATE rate_limits SET n = n + 1 WHERE key = ?").run(key);
    return true;
  })();
}

export function resetRateLimit(): void {
  getDb().prepare("DELETE FROM rate_limits").run();
}

export function clientIp(headersList: Headers): string {
  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64) || "unknown";
  return (headersList.get("x-real-ip") ?? "local").slice(0, 64);
}
