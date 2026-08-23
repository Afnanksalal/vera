import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
} from "node:crypto";
import { canonicalize, sha256 } from "./canonical";
import type { RunResult } from "./orchestrate";

export type AuditEvent = {
  seq: number;
  kind: "tool_call" | "verdict";
  payload: Record<string, unknown>;
  prev_hash: string;
  hash: string;
};

export const GENESIS = "GENESIS";

function hashEvent(prev_hash: string, seq: number, kind: string, payload: unknown): string {
  return sha256({ prev_hash, seq, kind, payload });
}

/**
 * Build an append-only, hash-chained log of everything that happened in a run:
 * every tool call, then every verifier verdict. Each entry commits to the one
 * before it, so any edit, reorder, or deletion breaks the chain from that point.
 */
export function buildChain(run: RunResult): AuditEvent[] {
  const events: AuditEvent[] = [];
  let prev = GENESIS;
  let seq = 0;

  for (const entry of run.transcript.entries) {
    seq += 1;
    const payload = {
      agent: entry.agent,
      tool: entry.tool,
      args_hash: entry.args_hash,
      result_hash: entry.result_hash,
    };
    const hash = hashEvent(prev, seq, "tool_call", payload);
    events.push({ seq, kind: "tool_call", payload, prev_hash: prev, hash });
    prev = hash;
  }

  for (const verdict of run.verdicts) {
    seq += 1;
    const payload = {
      claim_id: verdict.claim_id,
      accepted: verdict.accepted,
      reason: verdict.reason,
    };
    const hash = hashEvent(prev, seq, "verdict", payload);
    events.push({ seq, kind: "verdict", payload, prev_hash: prev, hash });
    prev = hash;
  }

  return events;
}

export function chainHead(events: AuditEvent[]): string {
  return events.length ? events[events.length - 1].hash : GENESIS;
}

export type ChainCheck = { ok: boolean; broken_at: number | null };

/** Recompute the whole chain offline; report the first index that was tampered. */
export function verifyChain(events: AuditEvent[]): ChainCheck {
  let prev = GENESIS;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.prev_hash !== prev) return { ok: false, broken_at: i };
    const expected = hashEvent(prev, e.seq, e.kind, e.payload);
    if (expected !== e.hash) return { ok: false, broken_at: i };
    prev = e.hash;
  }
  return { ok: true, broken_at: null };
}

export type AuditorKeypair = { publicKeyPem: string; privateKeyPem: string };

export function newAuditorKeypair(): AuditorKeypair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

export function signHead(privateKeyPem: string, head: string): string {
  const key = createPrivateKey(privateKeyPem);
  return edSign(null, Buffer.from(head, "utf8"), key).toString("hex");
}

export function verifyHead(publicKeyPem: string, head: string, signatureHex: string): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    return edVerify(null, Buffer.from(head, "utf8"), key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

/** Stable digest of a set of events, for quick equality checks. */
export function chainDigest(events: AuditEvent[]): string {
  return sha256(canonicalize(events.map((e) => e.hash)));
}
