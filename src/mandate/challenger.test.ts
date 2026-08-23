import assert from "node:assert/strict";
import { test } from "node:test";
import { runChallenger } from "./challenger";
import { runCloser } from "./closer";
import { buildFixture } from "./fixture";
import { Transcript } from "./transcript";
import type { Proposal } from "./types";

test("honest proposals draw no challenges", () => {
  const { world } = buildFixture();
  const transcript = new Transcript(world);
  const { proposals } = runCloser(world, transcript, world.sales);
  const challenges = runChallenger(world, proposals);
  assert.equal(challenges.length, 0);
});

test("a tampered evidence hash is challenged on replay", () => {
  const { world } = buildFixture();
  const transcript = new Transcript(world);
  const { proposals } = runCloser(world, transcript, world.sales);
  const target = proposals[0];
  const lied: Proposal = {
    ...target,
    evidence: target.evidence.map((e, i) => (i === 0 ? { ...e, result_hash: "00" } : e)),
  };
  const challenges = runChallenger(world, [lied, ...proposals.slice(1)]);
  assert.ok(challenges.some((c) => c.claim_id === target.claim_id && c.reason.startsWith("replay_mismatch")));
});

test("a lying 'prove' on a real fault is independently challenged", () => {
  const { world } = buildFixture();
  const transcript = new Transcript(world);
  const { proposals } = runCloser(world, transcript, world.sales);
  const excepted = proposals.find((p) => p.action === "except")!;
  const lie: Proposal = { ...excepted, action: "prove", code: undefined };
  const rest = proposals.filter((p) => p.claim_id !== excepted.claim_id);
  const challenges = runChallenger(world, [lie, ...rest]);
  assert.ok(
    challenges.some((c) => c.claim_id === excepted.claim_id && c.reason.startsWith("audit_disagree"))
  );
});
