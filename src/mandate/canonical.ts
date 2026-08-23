import { createHash, createHmac, timingSafeEqual } from "node:crypto";

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

function sortValue(value: unknown): Json {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value === "object") {
    const input = value as Record<string, unknown>;
    const out: Record<string, Json> = {};
    for (const key of Object.keys(input).sort()) {
      if (input[key] === undefined) continue;
      out[key] = sortValue(input[key]);
    }
    return out;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonicalize: non-finite number");
    }
    return value;
  }
  return value as Json;
}

/**
 * Deterministic JSON with sorted keys. Used for every hash and signature so a
 * result computed now and re-computed by the verifier are byte-identical.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

export function hmacSign(key: string, payload: unknown): string {
  return createHmac("sha256", key).update(canonicalize(payload)).digest("hex");
}

export function hmacVerify(key: string, payload: unknown, signature: string): boolean {
  const expected = hmacSign(key, payload);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
