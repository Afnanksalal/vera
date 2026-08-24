import { ingest, type ExternalRecord } from "@/mandate/adapters";
import { exportBundle, type AuditArtifact } from "@/mandate/bundle";
import { sha256 } from "@/mandate/canonical";
import { runClose } from "@/mandate/orchestrate";
import type { Claim } from "@/mandate/types";
import { MAX_INGEST_RECORDS } from "./config";
import { randomId } from "./crypto";
import { getDb, nowMs } from "./db";
import { HttpError } from "./http";
import { signingIdentity } from "./signing";
import { getSystemSettings } from "./settings";

export type IngestResult = { inserted: number; updated: number; unchanged: number; total: number };

export type CloseSummary = {
  id: string;
  world_hash: string;
  proven: number;
  excepted: number;
  abstained: number;
  sales: number;
  created_at: number;
};

export function ingestRecords(userId: string, source: string, records: ExternalRecord[]): IngestResult {
  if (records.length === 0) throw new HttpError(400, "Provide at least one record.", "empty");
  if (records.length > MAX_INGEST_RECORDS) {
    throw new HttpError(400, `At most ${MAX_INGEST_RECORDS} records per request.`, "too_many");
  }
  const db = getDb();
  const maxEvents = getSystemSettings().max_ingest_events;
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const write = db.transaction(() => {
    let total = (db.prepare("SELECT COUNT(*) as n FROM ingest_events WHERE user_id = ?").get(userId) as { n: number }).n;
    for (const record of records) {
      const externalId = record.payment.id;
      const payload = JSON.stringify(record);
      const existing = db
        .prepare("SELECT id, payload_json FROM ingest_events WHERE user_id = ? AND external_id = ? ORDER BY created_at ASC LIMIT 1")
        .get(userId, externalId) as { id: string; payload_json: string } | undefined;
      if (existing) {
        if (existing.payload_json === payload) {
          unchanged += 1;
        } else {
          db.prepare("UPDATE ingest_events SET source = ?, payload_json = ? WHERE id = ?").run(source, payload, existing.id);
          updated += 1;
        }
      } else {
        if (total >= maxEvents) throw new HttpError(400, `Ingest capacity of ${maxEvents.toLocaleString("en-US")} events reached. Increase it in Installation settings or archive data.`, "quota");
        db.prepare(
          "INSERT INTO ingest_events (id, user_id, source, external_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(randomId("evt"), userId, source, externalId, payload, nowMs());
        inserted += 1;
        total += 1;
      }
    }
  });
  write();
  const total = (db.prepare("SELECT COUNT(*) as n FROM ingest_events WHERE user_id = ?").get(userId) as { n: number }).n;
  return { inserted, updated, unchanged, total };
}

export function recordsForUser(userId: string): ExternalRecord[] {
  const rows = getDb()
    .prepare("SELECT payload_json FROM ingest_events WHERE user_id = ? ORDER BY created_at ASC, id ASC")
    .all(userId) as { payload_json: string }[];
  return rows.map((row) => JSON.parse(row.payload_json) as ExternalRecord);
}

export function recordForUser(userId: string, externalId: string): ExternalRecord | null {
  const row = getDb().prepare(
    "SELECT payload_json FROM ingest_events WHERE user_id = ? AND external_id = ? LIMIT 1"
  ).get(userId, externalId) as { payload_json: string } | undefined;
  return row ? JSON.parse(row.payload_json) as ExternalRecord : null;
}

export function closeUser(userId: string): CloseSummary {
  const records = recordsForUser(userId);
  if (records.length === 0) throw new HttpError(400, "Nothing to close. Ingest records first.", "empty");
  const world = ingest(records);
  const run = runClose(world);
  const artifactRows = getDb().prepare(
    "SELECT id, payment_id, kind, file_name, mime_type, payload_hash, payload FROM evidence_artifacts WHERE user_id = ? ORDER BY created_at ASC, id ASC"
  ).all(userId) as { id: string; payment_id: string; kind: AuditArtifact["kind"]; file_name: string; mime_type: string; payload_hash: string; payload: Buffer }[];
  const artifacts: AuditArtifact[] = artifactRows.map((row) => ({ id: row.id, payment_id: row.payment_id, kind: row.kind, file_name: row.file_name, mime_type: row.mime_type, payload_hash: row.payload_hash, data_base64: row.payload.toString("base64") }));
  const bundle = exportBundle(world, new Date().toISOString(), signingIdentity(), run, artifacts);
  const proven = run.claims.filter((c) => c.status === "PROVEN").length;
  const excepted = run.claims.filter((c) => c.status === "EXCEPTED").length;
  const abstained = run.claims.filter((c) => c.status === "ABSTAINED").length;
  const stats = { proven, excepted, abstained, sales: world.sales.length, planner: run.planner };
  const id = randomId("cls");
  const created = nowMs();
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO closes (id, user_id, source, world_hash, summary_json, claims_json, bundle_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, userId, "close", sha256(world), JSON.stringify(stats), JSON.stringify(run.claims), JSON.stringify(bundle), created);
    db.prepare("UPDATE reviews SET status = 'superseded', resolved_at = ? WHERE user_id = ? AND status = 'open'").run(
      created,
      userId
    );
    for (const claim of run.claims) {
      if (claim.status !== "EXCEPTED" && claim.status !== "ABSTAINED") continue;
      db.prepare(
        "INSERT INTO reviews (id, user_id, close_id, claim_id, sale_id, claim_type, code, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)"
      ).run(randomId("rev"), userId, id, claim.claim_id, claim.sale_id, claim.type, claim.code ?? null, created);
    }
  });
  tx();
  return { id, world_hash: sha256(world), proven, excepted, abstained, sales: world.sales.length, created_at: created };
}

export function latestClose(userId: string): { summary: CloseSummary; claims: Claim[]; bundle: unknown } | null {
  const row = getDb()
    .prepare(
      "SELECT id, world_hash, summary_json, claims_json, bundle_json, created_at FROM closes WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(userId) as
    | {
        id: string;
        world_hash: string;
        summary_json: string;
        claims_json: string;
        bundle_json: string | null;
        created_at: number;
      }
    | undefined;
  if (!row) return null;
  const stats = JSON.parse(row.summary_json) as { proven: number; excepted: number; abstained: number; sales: number };
  return {
    summary: { id: row.id, world_hash: row.world_hash, created_at: row.created_at, ...stats },
    claims: JSON.parse(row.claims_json) as Claim[],
    bundle: row.bundle_json ? JSON.parse(row.bundle_json) : null,
  };
}

export function listCloses(userId: string) {
  return getDb()
    .prepare("SELECT id, world_hash, summary_json, created_at FROM closes WHERE user_id = ? ORDER BY created_at DESC LIMIT 50")
    .all(userId)
    .map((row) => {
      const r = row as { id: string; world_hash: string; summary_json: string; created_at: number };
      const stats = JSON.parse(r.summary_json) as { proven: number; excepted: number; abstained: number; sales: number };
      return { id: r.id, world_hash: r.world_hash, created_at: r.created_at, ...stats };
    });
}

export function closeById(userId: string, closeId: string): { summary: CloseSummary; claims: Claim[]; bundle: unknown } | null {
  const row = getDb().prepare(
    "SELECT id, world_hash, summary_json, claims_json, bundle_json, created_at FROM closes WHERE id = ? AND user_id = ?"
  ).get(closeId, userId) as { id: string; world_hash: string; summary_json: string; claims_json: string; bundle_json: string | null; created_at: number } | undefined;
  if (!row) return null;
  const stats = JSON.parse(row.summary_json) as { proven: number; excepted: number; abstained: number; sales: number };
  return { summary: { id: row.id, world_hash: row.world_hash, created_at: row.created_at, ...stats }, claims: JSON.parse(row.claims_json) as Claim[], bundle: row.bundle_json ? JSON.parse(row.bundle_json) : null };
}

export type ReviewRow = {
  id: string;
  close_id: string;
  claim_id: string;
  sale_id: string;
  claim_type: string;
  code: string | null;
  status: string;
  note: string | null;
  created_at: number;
  resolved_at: number | null;
};

export function listReviews(userId: string, status = "open"): ReviewRow[] {
  return getDb()
    .prepare(
      "SELECT id, close_id, claim_id, sale_id, claim_type, code, status, note, created_at, resolved_at FROM reviews WHERE user_id = ? AND status = ? ORDER BY created_at DESC"
    )
    .all(userId, status) as ReviewRow[];
}

export function acknowledgeReview(userId: string, reviewId: string, note?: string): ReviewRow {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, close_id, claim_id, sale_id, claim_type, code, status, note, created_at, resolved_at FROM reviews WHERE id = ? AND user_id = ?"
    )
    .get(reviewId, userId) as ReviewRow | undefined;
  if (!row) throw new HttpError(404, "Review not found.", "not_found");
  if (row.status !== "open") throw new HttpError(409, "Review is not open.", "not_open");
  const trimmed = (note ?? "").trim().slice(0, 500);
  const resolved = nowMs();
  db.prepare("UPDATE reviews SET status = 'acknowledged', note = ?, resolved_at = ? WHERE id = ? AND user_id = ?").run(
    trimmed || null,
    resolved,
    reviewId,
    userId
  );
  return { ...row, status: "acknowledged", note: trimmed || null, resolved_at: resolved };
}
