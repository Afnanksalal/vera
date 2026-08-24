import { calibrate, type Labelled } from "@/mandate/conformal";
import { getDb, nowMs } from "./db";
import { randomId } from "./crypto";
import { HttpError } from "./http";

export function calibrationRows(userId: string): Labelled[] {
  return (getDb().prepare("SELECT score, correct FROM match_calibration WHERE user_id = ? ORDER BY created_at, id").all(userId) as { score: number; correct: number }[])
    .map((row) => ({ score: row.score, correct: row.correct === 1 }));
}

export function importCalibration(userId: string, raw: unknown, mode: "replace" | "append" = "replace"): number {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10_000) throw new HttpError(400, "Calibration must contain 1–10,000 labelled rows.", "invalid_calibration");
  const rows = raw.map((item) => {
    const row = item as { score?: unknown; correct?: unknown };
    if (typeof row?.score !== "number" || !Number.isFinite(row.score) || row.score < 0 || typeof row.correct !== "boolean") throw new HttpError(400, "Each calibration row needs a non-negative numeric score and boolean correct value.", "invalid_calibration");
    return { score: row.score, correct: row.correct };
  });
  if (mode !== "replace" && mode !== "append") throw new HttpError(400, "Calibration mode must be replace or append.", "invalid_calibration");
  const db = getDb();
  const insert = db.prepare("INSERT INTO match_calibration (id, user_id, score, correct, created_at) VALUES (?, ?, ?, ?, ?)");
  const tx = db.transaction(() => {
    if (mode === "replace") db.prepare("DELETE FROM match_calibration WHERE user_id = ?").run(userId);
    rows.forEach((row) => insert.run(randomId("cal"), userId, row.score, row.correct ? 1 : 0, nowMs()));
  });
  tx();
  return rows.length;
}

export function clearCalibration(userId: string): void {
  getDb().prepare("DELETE FROM match_calibration WHERE user_id = ?").run(userId);
}

export function calibrationStatus(userId: string, alpha = 0.1, delta = 0.1) {
  const rows = calibrationRows(userId);
  return { rows: rows.length, calibration: rows.length ? calibrate(rows, alpha, delta) : null };
}
