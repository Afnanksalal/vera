import { existsSync, statSync } from "node:fs";
import { databasePath } from "./config";
import { getDb } from "./db";

export type OperationalStatus = {
  database: "ok" | "error";
  schema_version: number;
  database_bytes: number | null;
  webhook: { pending: number; failed: number; processing: number };
  notifications: { pending: number; failed: number; processing: number };
};

export function operationalStatus(userId: string): OperationalStatus {
  const db = getDb();
  const check = db.pragma("quick_check") as { quick_check: string }[];
  const count = (table: "webhook_events" | "notification_deliveries") => db.prepare(`SELECT
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
    SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing
    FROM ${table} WHERE user_id = ?`).get(userId) as { pending: number | null; failed: number | null; processing: number | null };
  const normalized = (value: ReturnType<typeof count>) => ({ pending: value.pending ?? 0, failed: value.failed ?? 0, processing: value.processing ?? 0 });
  const path = databasePath();
  return {
    database: check.every((row) => row.quick_check === "ok") ? "ok" : "error",
    schema_version: (db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number }).version,
    database_bytes: path !== ":memory:" && existsSync(path) ? statSync(path).size : null,
    webhook: normalized(count("webhook_events")),
    notifications: normalized(count("notification_deliveries")),
  };
}
