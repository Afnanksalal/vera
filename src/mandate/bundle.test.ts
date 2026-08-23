import assert from "node:assert/strict";
import { test } from "node:test";
import { exportBundle, verifyBundle } from "./bundle";
import { buildFixture } from "./fixture";

function bundle(seed = 42) {
  return exportBundle(buildFixture({ seed }).world, "2026-08-23T00:00:00.000Z");
}

test("a freshly exported bundle verifies on every check", () => {
  const verdict = verifyBundle(bundle());
  assert.equal(verdict.ok, true, verdict.notes.join("; "));
  assert.equal(verdict.chain_ok, true);
  assert.equal(verdict.signature_ok, true);
  assert.equal(verdict.world_hash_ok, true);
  assert.equal(verdict.replay_ok, true);
});

test("editing a committed claim is caught by replay", () => {
  const b = bundle();
  const target = b.claims.find((c) => c.status === "EXCEPTED")!;
  target.status = "PROVEN";
  target.code = undefined;
  const verdict = verifyBundle(b);
  assert.equal(verdict.replay_ok, false);
  assert.equal(verdict.ok, false);
});

test("editing a chain event is caught by chain verification", () => {
  const b = bundle();
  const idx = Math.floor(b.events.length / 2);
  b.events[idx] = { ...b.events[idx], payload: { ...b.events[idx].payload, tampered: true } };
  const verdict = verifyBundle(b);
  assert.equal(verdict.chain_ok, false);
  assert.equal(verdict.ok, false);
});

test("editing the world is caught by the world hash", () => {
  const b = bundle();
  b.world.payments[0].amount_paise += 100;
  const verdict = verifyBundle(b);
  assert.equal(verdict.world_hash_ok, false);
  assert.equal(verdict.ok, false);
});

test("a forged signature does not verify", () => {
  const b = bundle();
  b.signature = "00".repeat(64);
  const verdict = verifyBundle(b);
  assert.equal(verdict.signature_ok, false);
  assert.equal(verdict.ok, false);
});
