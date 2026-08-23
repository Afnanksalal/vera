import assert from "node:assert/strict";
import { test } from "node:test";
import { sha256 } from "./canonical";
import { runCloser } from "./closer";
import { buildFixture } from "./fixture";
import { Transcript } from "./transcript";
import { verify } from "./verifier";
import type { Proposal, Sale } from "./types";

function setup() {
  const { world } = buildFixture();
  const salesById = new Map<string, Sale>(world.sales.map((s) => [s.sale_id, s]));
  const transcript = new Transcript(world);
  const { proposals } = runCloser(world, transcript, world.sales);
  return { world, salesById, transcript, proposals };
}

test("valid closer proposals are accepted", () => {
  const { world, salesById, transcript, proposals } = setup();
  const { verdicts } = verify({ world, transcript, sales: salesById, proposals, challenges: [] });
  assert.ok(verdicts.every((v) => v.accepted), "all verdicts should be accepted");
});

test("tampered evidence hash is rejected", () => {
  const { world, salesById, transcript, proposals } = setup();
  const target = proposals[0];
  const tampered: Proposal = {
    ...target,
    evidence: target.evidence.map((e, i) =>
      i === 0 ? { ...e, result_hash: "deadbeef" } : e
    ),
  };
  const others = proposals.filter((p) => p.claim_id !== target.claim_id);
  const { verdicts } = verify({
    world,
    sales: salesById,
    transcript,
    proposals: [tampered, ...others],
    challenges: [],
  });
  const verdict = verdicts.find((v) => v.claim_id === target.claim_id)!;
  assert.equal(verdict.accepted, false);
  assert.ok(["evidence_hash_mismatch", "evidence_missing_in_transcript"].includes(verdict.reason));
});

test("a lying 'prove' on a real fault is rejected by the audit", () => {
  const { world, salesById, transcript, proposals } = setup();
  // Find a planted-fault claim the closer correctly excepted, flip it to prove.
  const excepted = proposals.find((p) => p.action === "except")!;
  const lie: Proposal = { ...excepted, action: "prove", code: undefined };
  const others = proposals.filter((p) => p.claim_id !== excepted.claim_id);
  const { verdicts } = verify({
    world,
    sales: salesById,
    transcript,
    proposals: [lie, ...others],
    challenges: [],
  });
  const verdict = verdicts.find((v) => v.claim_id === excepted.claim_id)!;
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, "action_disagrees_with_audit");
});

test("an open challenge blocks acceptance", () => {
  const { world, salesById, transcript, proposals } = setup();
  const target = proposals[0];
  const { verdicts } = verify({
    world,
    sales: salesById,
    transcript,
    proposals,
    challenges: [{ claim_id: target.claim_id, reason: "test" }],
  });
  const verdict = verdicts.find((v) => v.claim_id === target.claim_id)!;
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.reason, "unresolved_challenge");
});

test("evidence not in the transcript is rejected (fabricated citation)", () => {
  const { world, salesById, proposals } = setup();
  const emptyTranscript = new Transcript(world);
  const { verdicts } = verify({
    world,
    sales: salesById,
    transcript: emptyTranscript,
    proposals,
    challenges: [],
  });
  assert.ok(verdicts.every((v) => !v.accepted));
  assert.ok(verdicts.every((v) => v.reason === "evidence_missing_in_transcript"));
  // Sanity: hashes recompute, so the failure is specifically the transcript check.
  assert.ok(sha256({}) !== "");
});
