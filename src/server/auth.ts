import { API_KEY_PREFIX, SESSION_COOKIE, SESSION_TTL_MS } from "./config";
import { getDb, nowMs } from "./db";
import { hashPassword, randomId, randomToken, tokenHash, verifyPassword } from "./crypto";
import { emailOk, normalizeEmail, passwordOk } from "./policy";

export type User = {
  id: string;
  email: string;
  created_at: number;
};

export type SessionInfo = {
  user: User;
  sessionId: string;
};

export function createUser(emailRaw: string, password: string): User {
  const email = normalizeEmail(emailRaw);
  if (!emailOk(email)) throw Object.assign(new Error("Enter a valid email."), { code: "invalid_email" });
  if (!passwordOk(password)) {
    throw Object.assign(new Error("Password must be 12–128 characters."), { code: "weak_password" });
  }
  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) throw Object.assign(new Error("An account with that email already exists."), { code: "email_taken" });
  const user: User = { id: randomId("usr"), email, created_at: nowMs() };
  db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").run(
    user.id,
    user.email,
    hashPassword(password),
    user.created_at
  );
  return user;
}

/** Atomically create the one installation owner. Concurrent setup requests cannot create a second account. */
export function createInstallationOwner(emailRaw: string, password: string): User {
  const email = normalizeEmail(emailRaw);
  if (!emailOk(email)) throw Object.assign(new Error("Enter a valid email."), { code: "invalid_email" });
  if (!passwordOk(password)) {
    throw Object.assign(new Error("Password must be 12–128 characters."), { code: "weak_password" });
  }
  const db = getDb();
  return db.transaction(() => {
    if (db.prepare("SELECT 1 FROM users LIMIT 1").get()) {
      throw Object.assign(new Error("This Vera installation is already initialized."), { code: "registration_closed" });
    }
    const user: User = { id: randomId("usr"), email, created_at: nowMs() };
    db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").run(
      user.id,
      user.email,
      hashPassword(password),
      user.created_at
    );
    return user;
  })();
}

const DUMMY_HASH = hashPassword("timing-oracle-pad-value");

export function authenticate(emailRaw: string, password: string): User | null {
  const email = normalizeEmail(emailRaw);
  const row = getDb()
    .prepare("SELECT id, email, password_hash, created_at FROM users WHERE email = ?")
    .get(email) as { id: string; email: string; password_hash: string; created_at: number } | undefined;
  const hash = row?.password_hash ?? DUMMY_HASH;
  const ok = verifyPassword(password, hash);
  if (!row || !ok) return null;
  return { id: row.id, email: row.email, created_at: row.created_at };
}

export function createSession(userId: string): string {
  const token = randomToken(32);
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowMs());
  const active = db.prepare("SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC").all(userId) as { id: string }[];
  for (const stale of active.slice(19)) db.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?").run(stale.id, userId);
  db.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(
    randomId("ses"),
    userId,
    tokenHash(token),
    nowMs() + SESSION_TTL_MS,
    nowMs()
  );
  return token;
}

export function sessionFromToken(token: string | undefined | null): SessionInfo | null {
  if (!token) return null;
  const now = nowMs();
  const row = getDb()
    .prepare(
      `SELECT sessions.id as session_id, users.id as user_id, users.email, users.created_at
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.expires_at > ?`
    )
    .get(tokenHash(token), now) as
    | { session_id: string; user_id: string; email: string; created_at: number }
    | undefined;
  if (!row) return null;
  return {
    sessionId: row.session_id,
    user: { id: row.user_id, email: row.email, created_at: row.created_at },
  };
}

export function destroySession(token: string | undefined | null): void {
  if (!token) return;
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
}

export function destroySessionById(sessionId: string, userId: string): void {
  getDb().prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?").run(sessionId, userId);
}

export function destroyAllSessions(userId: string): void {
  getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function changePassword(userId: string, currentPassword: string, nextPassword: string): void {
  if (!passwordOk(nextPassword)) {
    throw Object.assign(new Error("New password must be 12–128 characters."), { code: "weak_password" });
  }
  if (currentPassword === nextPassword) {
    throw Object.assign(new Error("Choose a different password."), { code: "same_password" });
  }
  const row = getDb().prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as { password_hash: string } | undefined;
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    throw Object.assign(new Error("Current password is incorrect."), { code: "invalid_credentials" });
  }
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(nextPassword), userId);
}

export function sessionCookie(token: string, secure: boolean): { name: string; value: string; options: Record<string, unknown> } {
  return {
    name: SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure,
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    },
  };
}

export function clearSessionCookie(secure: boolean): { name: string; value: string; options: Record<string, unknown> } {
  return {
    name: SESSION_COOKIE,
    value: "",
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure,
      path: "/",
      maxAge: 0,
    },
  };
}

export function createApiKey(userId: string, name: string): { id: string; prefix: string; secret: string } {
  const count = getDb().prepare("SELECT COUNT(*) AS n FROM api_keys WHERE user_id = ?").get(userId) as { n: number };
  if (count.n >= 50) throw Object.assign(new Error("Revoke an integration key before creating another."), { code: "api_key_limit" });
  const label = name.trim();
  if (!label || label.length > 80) throw Object.assign(new Error("Integration name must be 1–80 characters."), { code: "invalid_key_name" });
  const secret = `${API_KEY_PREFIX}${randomToken(24)}`;
  const prefix = secret.slice(0, 12);
  const id = randomId("key");
  getDb()
    .prepare("INSERT INTO api_keys (id, user_id, name, prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, userId, label, prefix, tokenHash(secret), nowMs());
  return { id, prefix, secret };
}

export function listApiKeys(userId: string) {
  return getDb()
    .prepare("SELECT id, name, prefix, created_at, last_used_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC")
    .all(userId) as { id: string; name: string; prefix: string; created_at: number; last_used_at: number | null }[];
}

export function revokeApiKey(userId: string, keyId: string): boolean {
  const result = getDb().prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?").run(keyId, userId);
  return result.changes > 0;
}

export function userFromApiKey(raw: string | undefined | null): User | null {
  if (!raw || !raw.startsWith(API_KEY_PREFIX) || raw.length < 20) return null;
  const row = getDb()
    .prepare(
      `SELECT users.id, users.email, users.created_at, api_keys.id as key_id
       FROM api_keys JOIN users ON users.id = api_keys.user_id
       WHERE api_keys.key_hash = ?`
    )
    .get(tokenHash(raw)) as { id: string; email: string; created_at: number; key_id: string } | undefined;
  if (!row) return null;
  getDb().prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(nowMs(), row.key_id);
  return { id: row.id, email: row.email, created_at: row.created_at };
}

export function isOwner(userId: string): boolean {
  const row = getDb().prepare("SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1").get() as { id: string } | undefined;
  return row?.id === userId;
}

export function installationHasUser(): boolean {
  return Boolean(getDb().prepare("SELECT 1 as present FROM users LIMIT 1").get());
}
