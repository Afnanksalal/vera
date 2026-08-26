import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { databasePath } from "./config";

const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = FULL;
PRAGMA wal_autocheckpoint = 1000;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE INDEX IF NOT EXISTS api_keys_user ON api_keys(user_id);

CREATE TABLE IF NOT EXISTS razorpay_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  key_id TEXT NOT NULL,
  key_secret_cipher TEXT NOT NULL,
  webhook_secret_cipher TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ingest_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, source, external_id)
);

CREATE INDEX IF NOT EXISTS ingest_events_user ON ingest_events(user_id, created_at);

CREATE TABLE IF NOT EXISTS closes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  world_hash TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  claims_json TEXT NOT NULL,
  bundle_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS closes_user ON closes(user_id, created_at);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  close_id TEXT NOT NULL REFERENCES closes(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  code TEXT,
  status TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE INDEX IF NOT EXISTS reviews_user_status ON reviews(user_id, status);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_cipher TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_investigations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  close_id TEXT REFERENCES closes(id) ON DELETE CASCADE,
  sale_id TEXT NOT NULL,
  model TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_investigations_user_sale
  ON ai_investigations(user_id, sale_id, created_at DESC);

CREATE TABLE IF NOT EXISTS signing_identity (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  private_key_cipher TEXT NOT NULL,
  public_key_pem TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS match_calibration (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score REAL NOT NULL,
  correct INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS match_calibration_user ON match_calibration(user_id, created_at);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'processed', 'ignored', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  processed_at INTEGER,
  UNIQUE(user_id, provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS webhook_events_status ON webhook_events(status, created_at);

CREATE TABLE IF NOT EXISTS evidence_signers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('principal', 'merchant')),
  public_key_pem TEXT NOT NULL,
  private_key_cipher TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, kind)
);

CREATE TABLE IF NOT EXISTS verified_purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('creating', 'ready', 'paid', 'failed')),
  mode TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  intent_json TEXT NOT NULL,
  cart_json TEXT NOT NULL,
  intent_hash TEXT NOT NULL,
  cart_hash TEXT NOT NULL,
  order_id TEXT UNIQUE,
  payment_id TEXT UNIQUE,
  failure_reason TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);

CREATE INDEX IF NOT EXISTS verified_purchases_user
  ON verified_purchases(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS evidence_artifacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('processor', 'bank_statement', 'receipt')),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  payload BLOB NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS evidence_artifacts_payment
  ON evidence_artifacts(user_id, payment_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_integrations (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('slack', 'discord')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  webhook_url_cipher TEXT NOT NULL,
  signing_secret_cipher TEXT,
  command_public_key TEXT,
  notify_reports INTEGER NOT NULL DEFAULT 1 CHECK (notify_reports IN (0, 1)),
  notify_issues INTEGER NOT NULL DEFAULT 1 CHECK (notify_issues IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider)
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('slack', 'discord')),
  event_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER,
  UNIQUE(user_id, provider, event_key)
);

CREATE INDEX IF NOT EXISTS notification_deliveries_pending
  ON notification_deliveries(user_id, status, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS integration_audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('slack', 'discord')),
  action TEXT NOT NULL,
  detail TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS integration_audit_log_user
  ON integration_audit_log(user_id, created_at DESC);
`;

const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      DELETE FROM ingest_events
      WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY user_id, external_id
            ORDER BY created_at DESC, id DESC
          ) AS duplicate_number
          FROM ingest_events
        ) WHERE duplicate_number > 1
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ingest_events_external
        ON ingest_events(user_id, external_id);
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE sessions ADD COLUMN client_label TEXT;
      ALTER TABLE sessions ADD COLUMN ip_hint TEXT;
      ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER;
      UPDATE sessions SET last_seen_at = created_at WHERE last_seen_at IS NULL;
    `,
  },
  {
    version: 3,
    sql: `
      ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
        CHECK (role IN ('owner', 'member'));
      UPDATE users SET role = 'owner'
      WHERE id = (SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1);
      CREATE UNIQUE INDEX IF NOT EXISTS users_single_owner
        ON users(role) WHERE role = 'owner';
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS ai_investigations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        close_id TEXT REFERENCES closes(id) ON DELETE CASCADE,
        sale_id TEXT NOT NULL,
        model TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ai_investigations_user_sale
        ON ai_investigations(user_id, sale_id, created_at DESC);
    `,
  },
  {
    version: 5,
    sql: `
      CREATE TABLE IF NOT EXISTS evidence_signers (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('principal', 'merchant')),
        public_key_pem TEXT NOT NULL,
        private_key_cipher TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, kind)
      );
      CREATE TABLE IF NOT EXISTS verified_purchases (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        state TEXT NOT NULL CHECK (state IN ('creating', 'ready', 'paid', 'failed')),
        mode TEXT NOT NULL CHECK (mode IN ('test', 'live')),
        intent_json TEXT NOT NULL,
        cart_json TEXT NOT NULL,
        intent_hash TEXT NOT NULL,
        cart_hash TEXT NOT NULL,
        order_id TEXT UNIQUE,
        payment_id TEXT UNIQUE,
        failure_reason TEXT,
        created_at INTEGER NOT NULL,
        paid_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS verified_purchases_user
        ON verified_purchases(user_id, created_at DESC);
    `,
  },
  {
    version: 6,
    sql: `
      CREATE TABLE IF NOT EXISTS evidence_artifacts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        payment_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('processor', 'bank_statement', 'receipt')),
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        payload BLOB NOT NULL,
        payload_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS evidence_artifacts_payment
        ON evidence_artifacts(user_id, payment_id, kind, created_at DESC);
    `,
  },
  {
    version: 7,
    sql: `
      CREATE TABLE IF NOT EXISTS chat_integrations (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK (provider IN ('slack', 'discord')),
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        webhook_url_cipher TEXT NOT NULL,
        signing_secret_cipher TEXT,
        command_public_key TEXT,
        notify_reports INTEGER NOT NULL DEFAULT 1 CHECK (notify_reports IN (0, 1)),
        notify_issues INTEGER NOT NULL DEFAULT 1 CHECK (notify_issues IN (0, 1)),
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, provider)
      );
      CREATE TABLE IF NOT EXISTS notification_deliveries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK (provider IN ('slack', 'discord')),
        event_key TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        delivered_at INTEGER,
        UNIQUE(user_id, provider, event_key)
      );
      CREATE INDEX IF NOT EXISTS notification_deliveries_pending
        ON notification_deliveries(user_id, status, next_attempt_at, created_at);
      CREATE TABLE IF NOT EXISTS integration_audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK (provider IN ('slack', 'discord')),
        action TEXT NOT NULL,
        detail TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS integration_audit_log_user
        ON integration_audit_log(user_id, created_at DESC);
    `,
  },
];

let singleton: Database.Database | undefined;

export function getDb(): Database.Database {
  if (singleton) return singleton;
  const path = databasePath();
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec(SCHEMA);
  const migrate = db.transaction(() => {
    const applied = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?");
    const record = db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)");
    for (const migration of MIGRATIONS) {
      if (applied.get(migration.version)) continue;
      db.exec(migration.sql);
      record.run(migration.version, Date.now());
    }
  });
  migrate();
  singleton = db;
  return db;
}

/** Test helper: drop the process-wide connection so the next getDb() is clean. */
export function resetDb(): void {
  singleton?.close();
  singleton = undefined;
}

export function nowMs(): number {
  return Date.now();
}
