import { createHash } from "node:crypto";
import { sha256 } from "./canonical";
import {
  buildChain,
  chainHead,
  newAuditorKeypair,
  signHead,
  verifyChain,
  verifyHead,
  type AuditEvent,
} from "./audit";
import { runClose, type RunResult } from "./orchestrate";
import type { Claim, World } from "./types";

export type AuditBundle = {
  format: "mandate-claim-ledger/audit-bundle@1" | "mandate-claim-ledger/audit-bundle@2";
  created_at: string;
  world_hash: string;
  world: World;
  claims: Claim[];
  events: AuditEvent[];
  head: string;
  signature: string;
  signed_digest?: string;
  artifacts?: AuditArtifact[];
  artifacts_hash?: string;
  public_key_pem: string;
  summary: {
    proven: number;
    excepted: number;
    abstained: number;
    challenges: number;
    tool_calls: number;
  };
};

export type AuditArtifact = {
  id: string;
  payment_id: string;
  kind: "processor" | "bank_statement" | "receipt";
  file_name: string;
  mime_type: string;
  payload_hash: string;
  data_base64: string;
};

/**
 * Produce a self-contained, signed evidence bundle for a close. It carries the
 * world, the committed claims, the full hash chain, and an ed25519 signature
 * over the chain head, so a third party can verify it offline with no trust in
 * the process that produced it.
 */
export function exportBundle(
  world: World,
  now: string = new Date().toISOString(),
  keypair = newAuditorKeypair(),
  run: RunResult = runClose(world),
  artifacts: AuditArtifact[] = []
): AuditBundle {
  const events = buildChain(run);
  const head = chainHead(events);
  const worldHash = sha256(world);
  const artifactsHash = sha256(artifacts);
  const signedDigest = sha256({ head, world_hash: worldHash, artifacts_hash: artifactsHash });
  const signature = signHead(keypair.privateKeyPem, signedDigest);

  const proven = run.claims.filter((c) => c.status === "PROVEN").length;
  const excepted = run.claims.filter((c) => c.status === "EXCEPTED").length;
  const abstained = run.claims.filter((c) => c.status === "ABSTAINED").length;

  return {
    format: "mandate-claim-ledger/audit-bundle@2",
    created_at: now,
    world_hash: worldHash,
    world,
    claims: run.claims,
    events,
    head,
    signature,
    signed_digest: signedDigest,
    artifacts,
    artifacts_hash: artifactsHash,
    public_key_pem: keypair.publicKeyPem,
    summary: {
      proven,
      excepted,
      abstained,
      challenges: run.challenges.length,
      tool_calls: run.transcript.entries.length,
    },
  };
}

export type BundleVerdict = {
  ok: boolean;
  chain_ok: boolean;
  chain_broken_at: number | null;
  signature_ok: boolean;
  world_hash_ok: boolean;
  replay_ok: boolean;
  head_ok: boolean;
  artifacts_ok: boolean;
  notes: string[];
};

/**
 * Verify a bundle with nothing but the bundle itself: recompute the chain,
 * check the signature over the head, confirm the world hash, and re-run the
 * close to confirm the committed claims reproduce exactly.
 */
export function verifyBundle(bundle: AuditBundle): BundleVerdict {
  const notes: string[] = [];

  const chain = verifyChain(bundle.events);
  if (!chain.ok) notes.push(`chain broken at event ${chain.broken_at}`);

  const head_ok = chainHead(bundle.events) === bundle.head;
  if (!head_ok) notes.push("head does not match last event hash");

  const artifacts = bundle.artifacts ?? [];
  const artifacts_hash = sha256(artifacts);
  const artifactBytesOk = artifacts.every((artifact) => {
    try { return createHash("sha256").update(Buffer.from(artifact.data_base64, "base64")).digest("hex") === artifact.payload_hash; }
    catch { return false; }
  });
  const artifacts_ok = artifactBytesOk && (bundle.format === "mandate-claim-ledger/audit-bundle@1" || artifacts_hash === bundle.artifacts_hash);
  if (!artifacts_ok) notes.push("an embedded evidence artifact does not match its committed hash");
  const expectedSignedDigest = sha256({ head: bundle.head, world_hash: bundle.world_hash, artifacts_hash });
  const signedDigest = bundle.format === "mandate-claim-ledger/audit-bundle@2" ? bundle.signed_digest ?? "" : bundle.head;
  if (bundle.format === "mandate-claim-ledger/audit-bundle@2" && signedDigest !== expectedSignedDigest) notes.push("signed digest does not bind the report contents");
  const signature_ok = verifyHead(bundle.public_key_pem, signedDigest, bundle.signature) &&
    (bundle.format === "mandate-claim-ledger/audit-bundle@1" || signedDigest === expectedSignedDigest);
  if (!signature_ok) notes.push("signature does not verify against the bound report digest");

  const world_hash_ok = sha256(bundle.world) === bundle.world_hash;
  if (!world_hash_ok) notes.push("world hash does not match embedded world");

  const replay = runClose(bundle.world);
  const rebuilt = replay.claims
    .map((c) => `${c.claim_id}:${c.status}:${c.code ?? ""}`)
    .sort();
  const stored = bundle.claims
    .map((c) => `${c.claim_id}:${c.status}:${c.code ?? ""}`)
    .sort();
  const replay_ok = sha256(rebuilt) === sha256(stored);
  if (!replay_ok) notes.push("re-running the close does not reproduce the committed claims");

  const ok = chain.ok && head_ok && signature_ok && world_hash_ok && replay_ok && artifacts_ok;
  return {
    ok,
    chain_ok: chain.ok,
    chain_broken_at: chain.broken_at,
    signature_ok,
    world_hash_ok,
    replay_ok,
    head_ok,
    artifacts_ok,
    notes,
  };
}
